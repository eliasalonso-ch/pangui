/**
 * El constructor de automatizaciones, de punta a punta.
 *
 * Esta pantalla concentra varias reglas que no se ven en el tipo y que ya se
 * rompieron una vez cada una: el activo se deduce del medidor y se bloquea, las
 * condiciones se agrupan por medidor al abrir y se aplanan al guardar, el modo
 * es del disparador aunque en la base sea una columna por fila, y los ids de
 * disparadores y acciones tienen que sobrevivir a una edición o el motor pierde
 * el latch y el enfriamiento.
 *
 * Se prueba contra `createAutomatizacion` / `updateAutomatizacion` mockeados:
 * lo que importa es la FORMA de lo que el panel manda a guardar, que es el
 * contrato con el trigger de Postgres.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `vi.mock` se iza sobre todo el archivo, así que los dobles tienen que nacer
// dentro de `vi.hoisted` o la fábrica los lee antes de que existan.
const { createAutomatizacion, updateAutomatizacion, uploadToR2 } = vi.hoisted(() => ({
  createAutomatizacion: vi.fn(async () => ({ id: "auto-nueva" })),
  updateAutomatizacion: vi.fn(async () => {}),
  uploadToR2: vi.fn(async () => "https://cdn.test/adjuntos/1_abc.pdf"),
}));

vi.mock("@/lib/automatizaciones-api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/automatizaciones-api")>();
  return { ...real, createAutomatizacion, updateAutomatizacion };
});

vi.mock("@/lib/r2", () => ({ uploadToR2 }));

// El picker de procedimientos y el de cuadrillas hacen su propia consulta al
// abrirse; acá no se ejercitan, así que se reemplazan por marcadores.
vi.mock("@/app/(app)/ordenes/ProcedimientosPicker", () => ({
  default: () => <div data-testid="procedimientos-picker" />,
}));
vi.mock("@/components/ordenes/CuadrillaQuickAdd", () => ({
  default: () => <div data-testid="cuadrilla-quick-add" />,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));

import AutomatizacionCrearPanel from "@/components/automatizaciones/AutomatizacionCrearPanel";
import type { AutomatizacionCompleta } from "@/lib/automatizaciones-api";
import type { MedidorConUltima } from "@/lib/medidores-api";

/** Dos medidores del mismo activo y uno de otro, para probar el filtro. */
const medidores = [
  { id: "med-1", nombre: "Corriente de Motor", unidad: "A", activo_id: "act-1",
    activo_nombre: "Bomba 3", ultima: null },
  { id: "med-2", nombre: "Horómetro", unidad: "h", activo_id: "act-1",
    activo_nombre: "Bomba 3", ultima: null },
  { id: "med-3", nombre: "Temperatura", unidad: "°C", activo_id: "act-2",
    activo_nombre: "Chiller", ultima: null },
] as unknown as MedidorConUltima[];

const props: React.ComponentProps<typeof AutomatizacionCrearPanel> = {
  wsId: "ws-1",
  inicial: null,
  medidores,
  activos: [
    { id: "act-1", label: "Bomba 3" },
    { id: "act-2", label: "Chiller" },
    { id: "act-3", label: "Compresor (sin medidores)" },
  ],
  ubicaciones: [{ id: "ubi-1", label: "Planta" }],
  usuarios: [{ id: "u1", nombre: "Ana López", rol: "tecnico" }] as never,
  categorias: [],
  onClose: vi.fn(),
  onGuardada: vi.fn(),
};

function renderPanel(extra: Partial<typeof props> = {}) {
  return render(<AutomatizacionCrearPanel {...props} {...extra} />);
}

/**
 * Abre un SearchSelect y elige una opción.
 *
 * El botón muestra el placeholder solo mientras no hay nada elegido; después
 * muestra la etiqueta. `textoBoton` permite volver a abrirlo pasando lo que se
 * ve ahora.
 */
async function elegirEnSelect(textoBoton: string | RegExp, opcion: string | RegExp) {
  await userEvent.click(screen.getByText(textoBoton));
  // La opción elegida también aparece en el botón, así que se toma la del
  // panel, que es la última en el DOM.
  const opciones = await screen.findAllByText(opcion);
  await userEvent.click(opciones[opciones.length - 1]);
}

/** El input numérico de la primera condición. */
function inputValor() {
  return screen.getByPlaceholderText("Valor");
}

/**
 * Despliega la primera acción, que al crear nace plegada.
 *
 * Los campos de la OT no existen en el DOM hasta abrirla, así que casi todo lo
 * que toca la acción empieza por acá.
 */
async function abrirAccion(indice = 0) {
  // Sin título la acción no se pliega desde el encabezado: la forma de entrar
  // es la caja de "Escribir la orden de trabajo".
  const cajas = screen.queryAllByText("Escribir la orden de trabajo");
  if (cajas[indice]) {
    await userEvent.click(cajas[indice]);
    return;
  }
  const botones = screen.getAllByLabelText(/Plegar|Desplegar/);
  await userEvent.click(botones[indice]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AutomatizacionCrearPanel — el disparador", () => {
  it("no muestra las condiciones hasta que hay un medidor", async () => {
    renderPanel();

    // Sin medidor no hay contra qué comparar, así que no se dibuja la fila.
    expect(screen.queryByPlaceholderText("Valor")).not.toBeInTheDocument();
    expect(screen.queryByText("Para")).not.toBeInTheDocument();

    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    expect(screen.getByPlaceholderText("Valor")).toBeInTheDocument();
    expect(screen.getByText("Para")).toBeInTheDocument();
  });

  it("rellena el activo al elegir el medidor y lo deja bloqueado", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    // Recíproco: el medidor cuelga de Bomba 3, así que el activo se completa.
    expect(screen.getByText("Bomba 3")).toBeInTheDocument();
    // Y deja de ser un filtro opcional, porque ya lo determina el medidor.
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(
      screen.getByText(/Es el activo del medidor elegido/),
    ).toBeInTheDocument();
  });

  it("suelta el activo al quitar el medidor", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    expect(screen.getByText("Bomba 3")).toBeInTheDocument();

    await elegirEnSelect(/Corriente de Motor/, "Sin medidor");

    // El activo lo había puesto el medidor: sin él vuelve a ser un filtro vacío.
    expect(screen.queryByText("Bomba 3")).not.toBeInTheDocument();
    expect(screen.getByText("Activo (opcional, para filtrar)")).toBeInTheDocument();
  });

  it("elige solo el medidor cuando el activo tiene exactamente uno", async () => {
    renderPanel();

    await elegirEnSelect("Busca un equipo…", "Chiller");

    // act-2 tiene un único medidor: pedir un segundo clic para la única opción
    // posible es trabajo por gusto.
    expect(screen.getByText(/Temperatura/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Valor")).toBeInTheDocument();
  });

  it("no ofrece activos que no tienen ningún medidor", async () => {
    renderPanel();

    await userEvent.click(screen.getByText("Busca un equipo…"));

    // Un activo sin medidores no puede disparar nada, así que no se ofrece:
    // es mejor que dejarlo elegir y después explicar por qué no sirve.
    expect(screen.getByText("Bomba 3")).toBeInTheDocument();
    expect(screen.getByText("Chiller")).toBeInTheDocument();
    expect(screen.queryByText(/Compresor/)).not.toBeInTheDocument();
  });
});

describe("AutomatizacionCrearPanel — las condiciones", () => {
  it("agrega condiciones y las une con O", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    expect(screen.queryByText("O")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Añadir condición"));

    expect(screen.getAllByPlaceholderText("Valor")).toHaveLength(2);
    // La "O" explica que basta con que se cumpla una, que es lo que hace el
    // motor al recorrer los disparadores por separado.
    expect(screen.getByText("O")).toBeInTheDocument();
  });

  it("no deja borrar la única condición, pero sí una de varias", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    // Con una sola no hay basurero: borrarla dejaría el disparador sin nada
    // que evaluar.
    expect(screen.queryAllByLabelText("Quitar esta condición")).toHaveLength(0);

    await userEvent.click(screen.getByText("Añadir condición"));
    const basureros = screen.getAllByLabelText("Quitar esta condición");
    expect(basureros).toHaveLength(2);

    await userEvent.click(basureros[0]);
    expect(screen.getAllByPlaceholderText("Valor")).toHaveLength(1);
  });

  it("muestra el 'Para' una sola vez, no uno por condición", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    await userEvent.click(screen.getByText("Añadir condición"));
    await userEvent.click(screen.getByText("Añadir condición"));

    expect(screen.getAllByPlaceholderText("Valor")).toHaveLength(3);
    // El modo es una sola pregunta sobre el medidor. Repetirlo dejaba
    // desplegables que podían contradecirse.
    expect(screen.getAllByText("Para")).toHaveLength(1);
  });

  it("muestra el campo 'hasta' solo con el operador 'entre'", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    expect(screen.queryByPlaceholderText("Hasta")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Es mayor o igual a"));
    await userEvent.click(screen.getByText("Está entre"));

    expect(screen.getByPlaceholderText("Hasta")).toBeInTheDocument();
  });

  it("pide el número de lecturas solo en el modo de varias lecturas", async () => {
    renderPanel();
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    expect(screen.queryByText("lecturas")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Cada vez que pase"));
    await userEvent.click(screen.getByText(/Recién cuando se repita/));

    expect(screen.getByText("lecturas")).toBeInTheDocument();
  });
});

describe("AutomatizacionCrearPanel — validación", () => {
  async function intentarCrear() {
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
  }

  it("exige un nombre", async () => {
    renderPanel();
    await intentarCrear();

    expect(screen.getByText(/Ponle un nombre a la regla/)).toBeInTheDocument();
    expect(createAutomatizacion).not.toHaveBeenCalled();
  });

  it("exige un medidor", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await intentarCrear();

    expect(screen.getByText(/Falta elegir el medidor/)).toBeInTheDocument();
    expect(createAutomatizacion).not.toHaveBeenCalled();
  });

  it("exige que el valor sea un número", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    await intentarCrear();

    expect(screen.getByText(/tiene que ser un número/)).toBeInTheDocument();
    expect(createAutomatizacion).not.toHaveBeenCalled();
  });

  it("exige que el segundo valor de un rango sea mayor que el primero", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);

    await userEvent.click(screen.getByText("Es mayor o igual a"));
    await userEvent.click(screen.getByText("Está entre"));
    fireEvent.change(inputValor(), { target: { value: "50" } });
    fireEvent.change(screen.getByPlaceholderText("Hasta"), { target: { value: "10" } });
    await intentarCrear();

    // Mismo chequeo que la constraint de la base, dicho en castellano.
    expect(screen.getByText(/el segundo valor tiene que ser mayor/)).toBeInTheDocument();
    expect(createAutomatizacion).not.toHaveBeenCalled();
  });

  it("exige el título de la OT y abre la acción para que se pueda arreglar", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    fireEvent.change(inputValor(), { target: { value: "10" } });
    await intentarCrear();

    expect(screen.getByText(/es el título de la orden/)).toBeInTheDocument();
    // Un error que apunta a un campo invisible no se puede arreglar: la acción
    // se despliega sola.
    expect(screen.getByPlaceholderText("¿Qué trabajo se debe realizar?")).toBeInTheDocument();
    expect(createAutomatizacion).not.toHaveBeenCalled();
  });
});

describe("AutomatizacionCrearPanel — guardado", () => {
  async function llenarMinimo(titulo = "Revisar bomba") {
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Mi regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    fireEvent.change(inputValor(), { target: { value: "10" } });
    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), titulo,
    );
  }

  it("manda una fila por condición, todas con el mismo medidor y modo", async () => {
    renderPanel();
    await llenarMinimo();

    await userEvent.click(screen.getByText("Añadir condición"));
    const valores = screen.getAllByPlaceholderText("Valor");
    fireEvent.change(valores[1], { target: { value: "2" } });

    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(createAutomatizacion).toHaveBeenCalledTimes(1);
    const [ws, input] = createAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    expect(ws).toBe("ws-1");

    const { triggers } = input as { triggers: Record<string, unknown>[] };
    // Aplanado: dos condiciones = dos filas del mismo medidor. Es la forma que
    // el motor recorre, y recorrerlas por separado es lo que las hace O.
    expect(triggers).toHaveLength(2);
    expect(triggers.map(t => t.medidor_id)).toEqual(["med-1", "med-1"]);
    expect(triggers.map(t => t.valor)).toEqual([10, 2]);
    expect(triggers.every(t => t.modo === "una_lectura")).toBe(true);
  });

  it("no manda el activo del disparador: es un filtro de la UI", async () => {
    renderPanel();
    await llenarMinimo();
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    const [, input] = createAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { triggers } = input as { triggers: Record<string, unknown>[] };
    // El disparador se identifica por `medidor_id` y nada más.
    expect(triggers[0]).not.toHaveProperty("activo_id");
  });

  it("guarda el tipo de trabajo elegido y no 'reactiva' por defecto", async () => {
    renderPanel();
    await llenarMinimo();

    await userEvent.click(screen.getByText("Reactiva"));
    await userEvent.click(screen.getByText("Preventiva"));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    const [, input] = createAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { acciones } = input as { acciones: { config: Record<string, unknown> }[] };
    expect(acciones[0].config.tipo_trabajo).toBe("preventiva");
  });

  it("guarda null en tiempo_estimado cuando no se estimó nada", async () => {
    renderPanel();
    await llenarMinimo();
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    const [, input] = createAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { acciones } = input as { acciones: { config: Record<string, unknown> }[] };
    // "sin estimación" y "estimado en cero" no son lo mismo.
    expect(acciones[0].config.tiempo_estimado).toBeNull();
  });

  it("suma horas y minutos en un solo total de minutos", async () => {
    renderPanel();
    await llenarMinimo();

    const numeros = screen.getAllByPlaceholderText("0");
    fireEvent.change(numeros[0], { target: { value: "2" } });
    fireEvent.change(numeros[1], { target: { value: "30" } });
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    const [, input] = createAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { acciones } = input as { acciones: { config: Record<string, unknown> }[] };
    expect(acciones[0].config.tiempo_estimado).toBe(150);
  });
});

describe("AutomatizacionCrearPanel — varias acciones", () => {
  it("agrega acciones y manda una por cada una", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    fireEvent.change(inputValor(), { target: { value: "10" } });

    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Trabajo eléctrico",
    );
    // La acción nueva nace desplegada: se acaba de pedir, hay que llenarla.
    await userEvent.click(screen.getByText("Agregar otra acción"));

    const titulos = screen.getAllByPlaceholderText("¿Qué trabajo se debe realizar?");
    expect(titulos).toHaveLength(2);
    await userEvent.type(titulos[1], "Trabajo mecánico");

    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    const [, input] = createAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { acciones } = input as { acciones: { config: { titulo: string } }[] };
    // El motor recorre todas (`ORDER BY orden, id`) y frena cada una por
    // separado, así que N acciones = N OT con la misma lectura.
    expect(acciones).toHaveLength(2);
    expect(acciones.map(a => a.config.titulo)).toEqual(["Trabajo eléctrico", "Trabajo mecánico"]);
    // Más margen que los 5s por defecto: este caso escribe dos títulos con
    // userEvent (una tecla por vez) y con la suite completa en paralelo se
    // pasaba del límite, aunque suelto corre en menos de un segundo.
  }, 15000);

  it("dice a qué acción le falta el título cuando hay varias", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    fireEvent.change(inputValor(), { target: { value: "10" } });

    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Trabajo eléctrico",
    );
    await userEvent.click(screen.getByText("Agregar otra acción"));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    // "falta el título" sobre cuatro tarjetas idénticas no orienta a nadie.
    expect(screen.getByText(/acción 2 le falta el título/)).toBeInTheDocument();
    expect(createAutomatizacion).not.toHaveBeenCalled();
  });

  it("al plegar una acción, el encabezado dice qué lleva dentro", async () => {
    renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Revisar bomba",
    );

    await userEvent.click(screen.getByLabelText("Plegar"));

    // Plegada se nombra por el título de la OT, no por "Crear una orden de
    // trabajo": con tres iguales, borrar la equivocada es cuestión de tiempo.
    expect(screen.getByText("Revisar bomba")).toBeInTheDocument();
    expect(screen.getByText("Sin asignados ni adjuntos")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("¿Qué trabajo se debe realizar?"),
    ).not.toBeInTheDocument();
  });

  it("ofrece la caja de escribir cuando la acción no tiene título", async () => {
    renderPanel();

    // Sin definir no se pliega ni se renombra: se ofrece el atajo para
    // escribirla, que es lo único que se puede hacer con ella.
    expect(screen.getByText("Escribir la orden de trabajo")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Plegar|Desplegar/)).not.toBeInTheDocument();
  });

  it("solo deja plegar una vez que la OT tiene título", async () => {
    renderPanel();

    // Vacía: la caja para escribirla, sin chevron.
    expect(screen.getByText("Escribir la orden de trabajo")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Plegar|Desplegar/)).not.toBeInTheDocument();

    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Revisar bomba",
    );

    // Con contenido sí se puede plegar, que es lo que ahorra scroll con varias.
    await userEvent.click(screen.getByLabelText("Plegar"));
    expect(screen.getByText("Revisar bomba")).toBeInTheDocument();
    expect(screen.queryByText("Escribir la orden de trabajo")).not.toBeInTheDocument();
  });

  it("quita la acción elegida y deja las demás", async () => {
    renderPanel();
    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Primera",
    );
    await userEvent.click(screen.getByText("Agregar otra acción"));
    const titulos = screen.getAllByPlaceholderText("¿Qué trabajo se debe realizar?");
    await userEvent.type(titulos[1], "Segunda");

    await userEvent.click(screen.getAllByLabelText("Borrar lo que hace esta regla")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const restantes = screen.getAllByPlaceholderText("¿Qué trabajo se debe realizar?");
    expect(restantes).toHaveLength(1);
    expect(restantes[0]).toHaveValue("Segunda");
  });

  it("con una sola acción, borrar la vacía en vez de quitarla", async () => {
    renderPanel();
    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Algo",
    );

    await userEvent.click(screen.getByLabelText("Borrar lo que hace esta regla"));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    // `crear_ot` es la única acción que el motor implementa, así que una regla
    // sin ninguna no tiene nada que hacer: vuelve a "sin definir".
    expect(screen.getByText("Escribir la orden de trabajo")).toBeInTheDocument();
  });

  it("cancelar el diálogo no borra nada", async () => {
    renderPanel();
    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Intacto",
    );

    await userEvent.click(screen.getByLabelText("Borrar lo que hace esta regla"));
    // Hay dos "Cancelar": el del diálogo y el del pie del panel. El del
    // diálogo es el último, porque sale por un portal al final del body.
    const cancelares = screen.getAllByRole("button", { name: "Cancelar" });
    await userEvent.click(cancelares[cancelares.length - 1]);

    expect(screen.getByPlaceholderText("¿Qué trabajo se debe realizar?")).toHaveValue("Intacto");
  });
});

describe("AutomatizacionCrearPanel — edición", () => {
  const existente: AutomatizacionCompleta = {
    id: "auto-1",
    workspace_id: "ws-1",
    nombre: "Fuga a tierra",
    descripcion: "Vigila la corriente",
    activa: true,
    ultima_ejecucion_at: null,
    creado_por: "u1",
    created_at: new Date().toISOString(),
    triggers: [
      { id: "trg-1", automatizacion_id: "auto-1", medidor_id: "med-1",
        operador: "mayor_igual", valor: 10, valor_hasta: null,
        modo: "una_lectura_reset", modo_n: null, armado: true },
      { id: "trg-2", automatizacion_id: "auto-1", medidor_id: "med-1",
        operador: "menor_igual", valor: 2, valor_hasta: null,
        modo: "una_lectura_reset", modo_n: null, armado: true },
    ],
    acciones: [
      { id: "acc-1", automatizacion_id: "auto-1", tipo: "crear_ot",
        config: { titulo: "Revisar motor", prioridad: "alta", tipo_trabajo: "preventiva" },
        retrigger_minutos: 15, solo_si_anterior_cerrada: true, orden: 0 },
    ],
  };

  it("agrupa las filas del mismo medidor en un disparador con dos condiciones", () => {
    renderPanel({ inicial: existente });

    // Dos filas de la base, un solo selector de medidor y dos condiciones.
    expect(screen.getAllByPlaceholderText("Valor")).toHaveLength(2);
    expect(screen.getByText("O")).toBeInTheDocument();
    expect(screen.getAllByText("Para")).toHaveLength(1);
  });

  it("deduce el activo del medidor guardado aunque no se persista", () => {
    renderPanel({ inicial: existente });

    expect(screen.getByText("Bomba 3")).toBeInTheDocument();
  });

  it("conserva los ids de disparadores y acciones al guardar", async () => {
    renderPanel({ inicial: existente });

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateAutomatizacion).toHaveBeenCalledTimes(1);
    const [id, input] = updateAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    expect(id).toBe("auto-1");

    const { triggers, acciones } = input as {
      triggers: { id?: string }[];
      acciones: { id?: string }[];
    };
    // Sin los ids, la fila se recrea: el latch de "sólo la primera vez" se
    // rearma y el freno de retrigger estrena historial.
    expect(triggers.map(t => t.id)).toEqual(["trg-1", "trg-2"]);
    expect(acciones.map(a => a.id)).toEqual(["acc-1"]);
  });

  it("abre la acción desplegada al editar", () => {
    renderPanel({ inicial: existente });

    // Al editar el usuario ya eligió qué hace la regla: esconderle lo que vino
    // a cambiar sería un clic de peaje.
    expect(screen.getByPlaceholderText("¿Qué trabajo se debe realizar?")).toHaveValue("Revisar motor");
  });

  it("conserva los frenos guardados", async () => {
    renderPanel({ inicial: existente });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const [, input] = updateAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { acciones } = input as {
      acciones: { retrigger_minutos: number; solo_si_anterior_cerrada: boolean }[];
    };
    expect(acciones[0].retrigger_minutos).toBe(15);
    expect(acciones[0].solo_si_anterior_cerrada).toBe(true);
  });

  it("quitar una condición manda solo la que queda", async () => {
    renderPanel({ inicial: existente });

    await userEvent.click(screen.getAllByLabelText("Quitar esta condición")[1]);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const [, input] = updateAutomatizacion.mock.calls[0] as unknown as [string, unknown];
    const { triggers } = input as { triggers: { id?: string }[] };
    // La fila que sobra se borra del lado de la API por no venir en la lista.
    expect(triggers.map(t => t.id)).toEqual(["trg-1"]);
  });
});

describe("AutomatizacionCrearPanel — archivos", () => {
  it("sube los archivos nuevos al guardar y no antes", async () => {
    const { container } = renderPanel();
    await userEvent.type(screen.getByPlaceholderText("¿Cómo se llama esta regla?"), "Regla");
    await elegirEnSelect("Busca un medidor…", /Corriente de Motor/);
    fireEvent.change(inputValor(), { target: { value: "10" } });
    await abrirAccion();
    await userEvent.type(
      screen.getByPlaceholderText("¿Qué trabajo se debe realizar?"), "Revisar",
    );

    const archivo = new File(["x"], "manual.pdf", { type: "application/pdf" });
    const inputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[1], { target: { files: [archivo] } });

    // Elegirlo no sube nada: si el usuario cancela, no queda basura en R2.
    expect(uploadToR2).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("manual.pdf")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(uploadToR2).toHaveBeenCalledTimes(1);
    // La carpeta es una raíz que r2-presign autoriza; otra da forbidden_folder.
    expect((uploadToR2.mock.calls[0] as unknown as [File, string])[1]).toBe("adjuntos");
  });

  it("separa imágenes de adjuntos por la extensión", async () => {
    const { container } = renderPanel();
    await abrirAccion();

    // Los dos archivos entran por el MISMO input; la sección en la que
    // aparecen la decide la extensión, no por dónde se cargaron. Es lo que
    // hace que al reabrir la regla —cuando solo hay links— sigan en su sitio.
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["x"], "foto.jpg", { type: "image/jpeg" }),
          new File(["x"], "manual.pdf", { type: "application/pdf" }),
        ],
      },
    });

    expect(screen.getByDisplayValue("foto.jpg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("manual.pdf")).toBeInTheDocument();

    // Uno en cada sección: ninguna se quedó con los dos. El tamaño se redondea
    // a KB, así que un archivo de un byte muestra "0 KB".
    expect(screen.getAllByText("0 KB")).toHaveLength(2);
  });

  it("quita un archivo de la lista", async () => {
    const { container } = renderPanel();
    await abrirAccion();
    const inputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(inputs[1], {
      target: { files: [new File(["x"], "manual.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByDisplayValue("manual.pdf")).toBeInTheDocument();

    const fila = screen.getByDisplayValue("manual.pdf").closest("div") as HTMLElement;
    await userEvent.click(within(fila).getByRole("button"));

    expect(screen.queryByDisplayValue("manual.pdf")).not.toBeInTheDocument();
  });
});

describe("AutomatizacionCrearPanel — el globo de frecuencia", () => {
  it("se abre anclado al botón y guarda el valor en la acción", async () => {
    renderPanel();
    await userEvent.click(screen.getByLabelText("Con qué frecuencia puede repetirse"));

    const minutos = screen.getByDisplayValue("5");
    fireEvent.change(minutos, { target: { value: "30" } });

    // El globo edita la acción, no un estado propio: el valor sobrevive a
    // cerrarlo y volver a abrirlo.
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
  });

  it("abre, cierra y reabre sin reventar", async () => {
    // El rect se leía dentro del updater de setState, que React puede correr
    // después de vaciar `currentTarget`: eso tiraba "Cannot read properties of
    // null (reading 'getBoundingClientRect')" en cuanto se tocaba el engranaje.
    renderPanel();
    const boton = screen.getByLabelText("Con qué frecuencia puede repetirse");

    await userEvent.click(boton);
    expect(screen.getByText("Como máximo, crear una orden cada")).toBeInTheDocument();

    await userEvent.click(boton);
    expect(screen.queryByText("Como máximo, crear una orden cada")).not.toBeInTheDocument();

    await userEvent.click(boton);
    expect(screen.getByText("Como máximo, crear una orden cada")).toBeInTheDocument();
  });

  it("se dibuja encima del botón cuando no cabe debajo", async () => {
    // El cuerpo del panel tiene scroll propio, así que el globo sale por un
    // portal con coordenadas de viewport; si no hubiera hueco abajo y no se
    // volteara, quedaría cortado por el borde inferior.
    const alto = window.innerHeight;
    renderPanel();

    const boton = screen.getByLabelText("Con qué frecuencia puede repetirse");
    vi.spyOn(boton, "getBoundingClientRect").mockReturnValue({
      top: alto - 40, bottom: alto - 20, left: 900, right: 940,
      width: 40, height: 20, x: 900, y: alto - 40, toJSON: () => ({}),
    } as DOMRect);

    await userEvent.click(boton);

    const globo = screen.getByText("Como máximo, crear una orden cada")
      .closest("div") as HTMLElement;
    // Arriba del botón, no debajo de él.
    expect(parseFloat(globo.style.top)).toBeLessThan(alto - 40);
  });
});
