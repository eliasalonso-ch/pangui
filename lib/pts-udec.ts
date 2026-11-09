/**
 * Ficha PTS UdeC: arma, en el orden del formulario de la UdeC ("SOLICITUD DE
 * PERMISO DE TRABAJO SEGURO (PTS)", Microsoft Forms), las respuestas que
 * Claudio tiene que pasar al formulario. Junta tres fuentes:
 *   1. Datos fijos de Electrilam (PTS_FIJOS, abajo).
 *   2. La OT (título, lugar, ITO, N° SF).
 *   3. Lo que el técnico respondió en el procedimiento "PTS".
 *
 * El formulario es de la UdeC y tiene los links prellenados apagados
 * (AllowPrefill=false), así que por ahora esto es para copiar y marcar a mano.
 */
import { numeroOtCliente } from "@/lib/cobro-export";

export const PTS_FORM_URL =
  "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=nitYViSI0EmmZc0yjA4ASgRntBPucYBJnzYP0UmA3ohUNEVaMFlHU1o2NlVRNVpBN1o2UldZVTJYWSQlQCN0PWcu";

/** El procedimiento "PTS" de Electrilam (el estructurado, no el viejo "PTS Electrilam"). */
export const PTS_PROCEDIMIENTO_ID = "e9b3f290-70aa-4d60-844e-84845c33f970";

// ponytail: datos fijos en código porque es un solo cliente; pasarlos a la base
// cuando Claudio necesite cambiarlos sin esperar un deploy.
export const PTS_FIJOS = {
  empresaOpcion: "Electrilam (77.078.563-4)",
  empresaNombre: "Ingeniería y Construcción Electrilam SpA",
  empresaRut: "77.078.563-4",
  /** ACHS | IST | MUTUAL DE CCHC | ISL */
  mutual: "MUTUAL DE CCHC",
  subcontratacion: "NO",
  area: "Eléctrica",
  /** "Nombre Supervisor / Rut (sin punto y con guión) / Teléfono" */
  supervisor: "Patricio Salazar / 12702122-8 / 946222573",
  /** "Nombre Experto / Rut / Teléfono" */
  experto: "Claudio Barra / 19533316-5 / 932772695",
  documentos: [
    "Seguro de Accidentes Personales",
    "Inducción a faena en UdeC",
    "Análisis Seguro de trabajo (AST)",
    "Contrato de trabajo",
    "Obligación de Informar",
    "Procedimiento de trabajo seguro",
    "Registro entrega Elementos de Protección Personal",
    "Registro Capacitación uso EPP",
    "Registro entrega Reglamento Interno",
    "Capacitación Uso de extintores, Primeros Auxilios y Emergencia y Evacuación",
    "Plan de Emergencias",
    "Matriz de identificación de peligros y evaluación de riesgos",
  ],
};

/**
 * Nombre como aparece en el checklist "Trabajadores" → línea "Nombre / Cargo / RUT"
 * para el formulario. Quien no esté acá sale solo con el nombre.
 * RUT de la app de asistencia de Electrilam; cargo de pangui (usuarios.cargo).
 */
export const PTS_TRABAJADORES: Record<string, string> = {
  "Andrés Javier Lamana Rosas": "Andrés Javier Lamana Rosas / Maestro / 17900794-0",
  "Aramis Gé Betancourt": "Aramis Gé Betancourt / Ayudante eléctrico / 28849676-5", // cargo de la app Electrilam (no está en pangui)
  "Bastián Jara": "Bastián Jara / Maestro / 16285428-3",
  "Benjamín Valenzuela": "Benjamín Valenzuela / Ayudante eléctrico / 19908376-7", // cargo de la app Electrilam (no está en pangui)
  "César Emilio Mendoza Rebolledo": "César Emilio Mendoza Rebolledo / Maestro / 19909775-K",
  "Claudio Barra": "Claudio Barra / Prevencionista / 19533136-5",
  "David Calfuleo": "David Calfuleo / Ayudante eléctrico / 18815033-0", // cargo de la app Electrilam (no está en pangui)
  "Elias Felipe Alonso Martinez": "Elias Felipe Alonso Martinez / Administrador / 20361535-3",
  "Elvis Steven Neira González": "Elvis Steven Neira González / Maestro / 18418348-K",
  "Emilio Burgos": "Emilio Burgos / Ayudante eléctrico / 20748024-K", // cargo de la app Electrilam (no está en pangui)
  "Humberto Joel Aguilera Puchi": "Humberto Joel Aguilera Puchi / Capataz Eléctrico / 15189792-4",
  "Ignacio Andrés López Ormeño": "Ignacio Andrés López Ormeño / Maestro eléctrico / 19511510-9", // cargo de la app Electrilam (no está en pangui)
  "Jorge Luis Reyes Soto": "Jorge Luis Reyes Soto / Maestro / 18361450-9",
  "Luis Vásquez": "Luis Vásquez / Ayudante / 16738236-3",
  "Osvaldo Ramírez": "Osvaldo Ramírez / Maestro eléctrico / 14272685-8", // cargo de la app Electrilam (no está en pangui)
  "Patricio Alejandro Salazar Rojas": "Patricio Alejandro Salazar Rojas / Supervisor / 12702122-8",
  "Yury Correa": "Yury Correa / Maestro eléctrico / 13103958-1", // cargo de la app Electrilam (no está en pangui)
};

/** Opciones del formulario para "supervisor eléctrico que encargó el trabajo". */
const SUPERVISORES_ELECTRICOS = ["Javier Araneda", "Samuel Artiaga", "Cristian Quijada", "Ricardo Tello", "Enzo Cifuentes"];

export interface FilaPts {
  pregunta: string;
  /** Texto a copiar, o las opciones a marcar (una por línea). */
  valor: string;
  /** copiar = campo de texto del formulario; marcar = opciones/casillas. */
  modo: "copiar" | "marcar";
  /** Falta el dato: hay que completarlo (técnico o PTS_FIJOS). */
  falta?: boolean;
}

export interface RespuestaPts {
  paso_id: string;
  valor_texto?: string | null;
  valor_json?: unknown;
  valor_fecha?: string | null;
}

export interface OtPts {
  titulo: string | null;
  descripcion?: string | null;
  n_serie?: string | null;
  numero_meconecta?: string | null;
  observacion?: string | null;
  hito: string | null;
  solicitante: string | null;
  tipo_trabajo: string | null;
  prioridad: string | null;
  ubicaciones?: { edificio?: string | null; detalle?: string | null } | null;
  lugar?: { nombre?: string | null } | null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/** Fecha guardada en valor_fecha → dd-mm-aaaa. La web guarda medianoche UTC y el
 *  móvil mediodía de Chile: en los dos casos el día UTC es el correcto. */
export function fechaPts(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Hora guardada en valor_fecha → "17.30 horas" (formato del ejemplo del formulario).
 *  La web la guarda como 1970-01-01THH:MMZ (hora de pared); el móvil, como instante real. */
export function horaPts(v: string | null | undefined): string {
  if (!v) return "";
  let hhmm: string;
  if (v.startsWith("1970-01-01")) hhmm = v.slice(11, 16);
  else {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  }
  return `${hhmm.replace(":", ".")} horas`;
}

function supervisorElectrico(hito: string | null): string {
  if (!hito) return "";
  const h = norm(hito);
  return SUPERVISORES_ELECTRICOS.find(s => norm(s).startsWith(h) || h.startsWith(norm(s))) ?? hito;
}

export function armarFichaPts(
  ot: OtPts,
  pasos: { id: string; titulo: string }[],
  respuestas: RespuestaPts[],
): FilaPts[] {
  // Por título y no por id: si Claudio renombra un paso, el campo sale vacío
  // (y marcado "falta") en vez de mostrar otra respuesta.
  const tituloPorId = new Map(pasos.map(p => [p.id, p.titulo.trim().toLowerCase()]));
  const porTitulo = new Map<string, RespuestaPts>();
  for (const r of respuestas) {
    const t = tituloPorId.get(r.paso_id);
    if (t) porTitulo.set(t, r);
  }
  const resp = (t: string) => porTitulo.get(t.toLowerCase());
  const texto = (t: string) => (resp(t)?.valor_texto ?? "").trim();
  const marcados = (t: string): string[] => {
    const c = (resp(t)?.valor_json as { checked?: unknown } | null | undefined)?.checked;
    return Array.isArray(c) ? c.map(String) : [];
  };

  const sf = numeroOtCliente(ot.n_serie, ot.numero_meconecta, ot.descripcion, ot.titulo, ot.observacion);
  // Regla de Electrilam (igual que cobros): con N° SF es CON OT (Me-Conecta);
  // sin SF es SIN OT, que en la práctica son los llamados de emergencia.
  const emergencia = !sf || ot.tipo_trabajo === "emergencia" || ot.prioridad === "urgente";

  const lugar = [ot.ubicaciones?.edificio, ot.ubicaciones?.detalle, ot.lugar?.nombre]
    .map(s => (s ?? "").trim()).filter(Boolean).join(" · ");

  const fechaInicio = fechaPts(resp("Fecha de Inicio de Trabajo")?.valor_fecha);
  const fechaFin = fechaPts(resp("Fecha de término")?.valor_fecha) || fechaInicio;
  const caliente = texto("¿Realiza trabajos en caliente?") === "Sí";

  const trabajadores = [
    ...marcados("Trabajadores").map(n => PTS_TRABAJADORES[n] ?? n),
    ...texto("Otros trabajadores").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean),
  ];

  const herramientas = [...marcados("Herramientas"), texto("Herramientas (otras o detalle)")].filter(Boolean);
  const observaciones = [
    herramientas.length ? `Herramientas: ${herramientas.join(", ")}.` : "",
    texto("Observaciones"),
  ].filter(Boolean).join("\n");

  const fila = (pregunta: string, valor: string, modo: FilaPts["modo"]): FilaPts =>
    ({ pregunta, valor, modo, ...(valor ? {} : { falta: true }) });

  const filas: FilaPts[] = [
    fila("Seleccione Empresa Contratista", PTS_FIJOS.empresaOpcion, "marcar"),
    fila("Nombre Empresa Contratista", PTS_FIJOS.empresaNombre, "copiar"),
    fila("Rut Empresa Contratista", PTS_FIJOS.empresaRut, "copiar"),
    fila("Organismo Administrador de Ley 16.744", PTS_FIJOS.mutual, "marcar"),
    fila("¿Contempla Subcontratación?", PTS_FIJOS.subcontratacion, "marcar"),
    fila("Nombre del Trabajo a Desarrollar", (ot.titulo ?? "").trim(), "copiar"),
    fila("Área de trabajo", PTS_FIJOS.area, "marcar"),
    fila("Supervisor eléctrico que encargó el trabajo", supervisorElectrico(ot.hito), "marcar"),
    fila("Lugar o área", lugar, "copiar"),
    fila("Tipo de Orden de Trabajo", sf ? "Solicitud de Trabajo por Me-Conecta" : "Otro Medio", "marcar"),
    sf
      ? fila("Nº Orden de Me-Conecta", sf, "copiar")
      : fila("Medio de Solicitud", ot.solicitante ? `Llamado de ${ot.solicitante.trim()}` : "", "copiar"),
    fila("Fecha propuesta de Inicio del Trabajo", fechaInicio, "copiar"),
    fila("Horario propuesto de Inicio Trabajos", horaPts(resp("Horario propuesto de Inicio Trabajos")?.valor_fecha), "copiar"),
    fila("Fecha estimada Finalización de Trabajos", fechaFin, "copiar"),
    fila("Horario estimado Finalización de Trabajos", horaPts(resp("Horario estimado Finalización de Trabajos")?.valor_fecha), "copiar"),
    fila("Prioridad de Trabajo", emergencia ? "Emergencia" : "Planificado", "marcar"),
    fila("Tipo de trabajo/s a realizar", marcados("Tipo de trabajo").join("\n"), "marcar"),
    fila("¿Realiza Trabajos en Caliente?", resp("¿Realiza trabajos en caliente?") ? (caliente ? "Si" : "No") : "", "marcar"),
  ];
  if (caliente) {
    const tomadas = marcados("Precauciones trabajo en caliente");
    filas.push(fila("Precauciones Tomadas (Sí; el resto N/A)", tomadas.join("\n"), "marcar"));
  }
  filas.push(
    fila("Elementos de apoyo", marcados("Material de Apoyo").join("\n"), "marcar"),
    fila("Medidas de control (EPP)", marcados("EPP").join("\n"), "marcar"),
    fila("Nombre/Cargo/Rut", trabajadores.join("\n"), "copiar"),
    fila("Nombre Supervisor / Rut / Teléfono", PTS_FIJOS.supervisor, "copiar"),
    fila("Nombre Experto / Rut / Teléfono", PTS_FIJOS.experto, "copiar"),
    fila("Documentos que declaro tener", PTS_FIJOS.documentos.join("\n"), "marcar"),
    fila("OBSERVACIONES", observaciones || "Sin observaciones.", "copiar"),
    fila("Guía de reglamento empresas contratistas", "Si", "marcar"),
    fila("Declaro que todos los antecedentes se encuentran al día", "Si", "marcar"),
  );
  return filas;
}
