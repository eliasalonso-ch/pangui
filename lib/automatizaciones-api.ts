/**
 * Automatizaciones: la regla configurable medidor → acción.
 *
 * Reemplaza a los umbrales soldados que vivían en `medidores` (advertencia,
 * critico, intervalo_ot). Acá solo se guarda y se lee la configuración: el
 * disparo ocurre en el trigger `fn_automatizacion_lectura`, porque una lectura
 * entra por tres clientes distintos y los tres tienen que disparar igual.
 * Ver 20260914110000_automatizaciones_motor.sql.
 */

import { createClient } from "@/lib/supabase";
import type { AssetCriticality, AssetStatus, OTLink } from "@/types/ordenes";
import type { TipoInactividad } from "@/lib/activo-estado-api";

export type OperadorTrigger =
  | "mayor" | "menor" | "mayor_igual" | "menor_igual" | "igual" | "distinto" | "entre"
  | "aumenta_desde_disparo" | "disminuye_desde_disparo"
  | "aumenta_desde_lectura" | "disminuye_desde_lectura";

/** Los cuatro que miran el cambio y no el valor. */
export const OPERADORES_DELTA: OperadorTrigger[] = [
  "aumenta_desde_disparo", "disminuye_desde_disparo",
  "aumenta_desde_lectura", "disminuye_desde_lectura",
];

/** Los dos acumulados, los únicos que usan `proximo_disparo`. */
export const OPERADORES_ACUMULADOS: OperadorTrigger[] = [
  "aumenta_desde_disparo", "disminuye_desde_disparo",
];

export const esDelta = (o: OperadorTrigger) => OPERADORES_DELTA.includes(o);
export const esAcumulado = (o: OperadorTrigger) => OPERADORES_ACUMULADOS.includes(o);
export type ModoTrigger = "una_lectura" | "una_lectura_reset" | "lecturas_multiples";
export type TipoAccion = "crear_ot" | "crear_solicitud" | "cambiar_estado_activo" | "enviar_notificacion";
export type TipoCondicion =
  | "estado_activo" | "ventana_horaria" | "sin_ot_abierta_en_activo" | "criticidad_activo";
export type EstadoActivo = "operativo" | "fuera_servicio" | "mantencion" | "baja";
export type ResultadoEjecucion = "ejecutada" | "omitida" | "fallida";

export interface Automatizacion {
  id: string;
  workspace_id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  ultima_ejecucion_at: string | null;
  creado_por: string | null;
  created_at: string;
}

export interface AutomatizacionTrigger {
  id: string;
  automatizacion_id: string;
  medidor_id: string;
  operador: OperadorTrigger;
  valor: number;
  valor_hasta: number | null;
  modo: ModoTrigger;
  modo_n: number | null;
  armado: boolean;
  /** Solo en los acumulados: el valor de medidor del próximo disparo. */
  proximo_disparo: number | null;
}

/** Campos de la OT que la acción deja preparados. Es el `config` jsonb. */
export interface ConfigCrearOT {
  titulo?: string;
  descripcion?: string;
  activo_id?: string | null;
  ubicacion_id?: string | null;
  asignados_ids?: string[];
  categoria_ids?: string[];
  /** Minutos. La UI pide horas + minutos y los suma acá. */
  tiempo_estimado?: number | null;
  prioridad?: string;
  tipo_trabajo?: string;
  /**
   * Procedimientos que se adjuntan a cada OT generada.
   *
   * Los ids solos: el nombre y el número de pasos se releen del catálogo al
   * abrir el panel. Guardar el nombre acá lo dejaría congelado en el que tenía
   * el día que se configuró la regla.
   *
   * Los inserta el trigger en `ot_procedimientos`, no el cliente: cuando la OT
   * nace no hay nadie escuchando. Ver 20260917120000.
   */
  procedimiento_ids?: string[];
  /**
   * Adjuntos e imágenes, con la forma de `ordenes_trabajo.links`.
   *
   * El archivo se sube UNA vez, al guardar la automatización, y cada OT
   * generada hereda la misma URL. El archivo pertenece a la regla, no a la
   * ejecución: el manual adjunto es el mismo manual en las 200 OT que abra.
   */
  links?: OTLink[];
}

/**
 * Campos de la acción "Cambiar el estado del activo". Es el `config` jsonb.
 *
 * Los mismos que pide CambiarEstadoDialog, porque escriben en la misma tabla
 * (`activo_estado_periodos`) y de ahí salen las horas de parada de /activos/
 * [id]/estado: si la automatización guardara menos campos, sus paradas
 * quedarían sin clasificar en el mismo informe.
 *
 * Lo que NO está es la fecha de inicio: el diálogo la ofrece porque una persona
 * carga una parada que ya empezó, y acá el instante es el de la lectura que
 * disparó. Tampoco la jerarquía: ver el comentario de la migración.
 */
export interface ConfigCambiarEstado {
  /** Ausente o null = el activo del medidor que disparó. */
  activo_id?: string | null;
  estado?: AssetStatus;
  /** Obligatorio salvo en `operativo`, que no lleva. */
  tipo_inactividad?: TipoInactividad | null;
  /** Obligatorio en `sin_planear`. */
  motivo_id?: string | null;
  notas?: string;
}

export interface AutomatizacionAccion {
  id: string;
  automatizacion_id: string;
  tipo: TipoAccion;
  /** Qué forma tiene depende de `tipo`. */
  config: ConfigCrearOT & ConfigCambiarEstado;
  retrigger_minutos: number;
  solo_si_anterior_cerrada: boolean;
  orden: number;
}

/**
 * El "Sólo si además…": el disparador dice cuándo mirar, la condición si
 * además corresponde actuar.
 *
 * `config` cambia de forma según `tipo` —igual que en las acciones— y lo
 * evalúa fn_automatizacion_condiciones_bloqueo, no el cliente: la lectura entra
 * por tres caminos y los tres tienen que filtrar igual.
 */
export interface CondicionConfig {
  /** estado_activo */
  estados?: EstadoActivo[];
  /** criticidad_activo */
  criticidades?: AssetCriticality[];
  /** ventana_horaria, "HH:MM" en hora de planta. */
  desde?: string;
  hasta?: string;
  /** ventana_horaria. ISODOW: lunes=1 … domingo=7. Vacío = todos los días. */
  dias?: number[];
}

export interface AutomatizacionCondicion {
  id: string;
  automatizacion_id: string;
  tipo: TipoCondicion;
  config: CondicionConfig;
  negado: boolean;
  orden: number;
}

export interface AutomatizacionEjecucion {
  id: string;
  automatizacion_id: string;
  accion_id: string | null;
  lectura_id: string | null;
  resultado: ResultadoEjecucion;
  detalle: string | null;
  valor: number | null;
  orden_id: string | null;
  created_at: string;
}

/** Una automatización con sus hijos, que es como la muestra la ficha. */
export interface AutomatizacionCompleta extends Automatizacion {
  triggers: AutomatizacionTrigger[];
  acciones: AutomatizacionAccion[];
  condiciones: AutomatizacionCondicion[];
}

const OPERADOR_TEXTO: Record<OperadorTrigger, string> = {
  mayor:       "es mayor que",
  menor:       "es menor que",
  mayor_igual: "es mayor o igual a",
  menor_igual: "es menor o igual a",
  igual:       "es igual a",
  distinto:    "es distinto de",
  entre:       "está entre",
  aumenta_desde_disparo:   "aumenta",
  disminuye_desde_disparo: "disminuye",
  aumenta_desde_lectura:   "sube",
  disminuye_desde_lectura: "baja",
};

/**
 * Los once operadores, con la explicación que ve el usuario.
 *
 * `ayuda` está escrita para alguien que no piensa en símbolos: dice qué pasa y
 * da el ejemplo con una unidad real. Los cuatro de delta la necesitan más que
 * nadie —"aumenta en" no dice respecto de QUÉ—, y confundir el acumulado con el
 * de salto es el error caro: uno abre una OT cada 5.000 km y el otro cada vez
 * que el valor pega un salto de 5.000 entre dos lecturas.
 */
export const OPERADORES: {
  value: OperadorTrigger; label: string; ayuda: string; grupo: "umbral" | "cambio";
}[] = [
  { value: "mayor", label: "Es mayor que", grupo: "umbral",
    ayuda: "La lectura pasa del valor, sin incluirlo. Con 10: dispara con 10,1 pero no con 10." },
  { value: "menor", label: "Es menor que", grupo: "umbral",
    ayuda: "La lectura queda por debajo del valor, sin incluirlo. Con 10: dispara con 9,9 pero no con 10." },
  { value: "mayor_igual", label: "Es mayor o igual a", grupo: "umbral",
    ayuda: "La lectura llega al valor o lo pasa. Con 10: dispara con 10 y con cualquier número mayor." },
  { value: "menor_igual", label: "Es menor o igual a", grupo: "umbral",
    ayuda: "La lectura llega al valor o queda por debajo. Con 10: dispara con 10 y con cualquier número menor." },
  { value: "igual", label: "Es igual a", grupo: "umbral",
    ayuda: "La lectura es exactamente ese número. Útil con medidores que informan códigos o estados, no con medidas que varían." },
  { value: "distinto", label: "Es distinto de", grupo: "umbral",
    ayuda: "La lectura es cualquier cosa MENOS ese número. Sirve para vigilar que algo se mantenga en su valor normal: con 1, dispara apenas deja de marcar 1." },
  { value: "entre", label: "Está entre", grupo: "umbral",
    ayuda: "La lectura cae dentro del rango, incluidos los dos extremos. Con 10 y 20: dispara con 10, con 15 y con 20." },

  { value: "aumenta_desde_disparo", label: "Aumenta en (desde el último disparo)", grupo: "cambio",
    ayuda: "Dispara cada vez que el medidor avanza esa cantidad, contando desde la vez anterior. Es el mantenimiento por uso: en un odómetro, \"cada 5.000 km\" abre una orden a los 5.000, a los 10.000, a los 15.000… El medidor nunca se reinicia; lo que avanza es el próximo objetivo." },
  { value: "disminuye_desde_disparo", label: "Disminuye en (desde el último disparo)", grupo: "cambio",
    ayuda: "Igual que el anterior pero hacia abajo: dispara cada vez que el medidor baja esa cantidad desde la vez anterior. Por ejemplo, un estanque que se controla cada 500 litros consumidos." },
  { value: "aumenta_desde_lectura", label: "Sube de golpe (respecto de la lectura anterior)", grupo: "cambio",
    ayuda: "Compara la lectura con la inmediatamente anterior y dispara si subió al menos esa cantidad. No mira el valor absoluto sino el salto: con 15, un rodamiento que pasa de 40° a 55° dispara, aunque 55° no sea un valor alto." },
  { value: "disminuye_desde_lectura", label: "Baja de golpe (respecto de la lectura anterior)", grupo: "cambio",
    ayuda: "Compara la lectura con la inmediatamente anterior y dispara si bajó al menos esa cantidad. Sirve para caídas repentinas: una presión que se desploma 15 unidades entre dos lecturas." },
];

/**
 * Los tres modos, dichos como los diría un jefe de mantenimiento.
 *
 * Las etiquetas viejas venían calcadas del inglés de MaintainX y no se
 * entendían: "Una lectura, luego reiniciar" no dice qué se reinicia —no es el
 * medidor ni la OT, es la regla, que se queda esperando a que el valor vuelva a
 * la normalidad—, y "Lecturas múltiples" no dice múltiples de qué ni cuántas.
 * Ahora cada etiqueta dice el comportamiento y la ayuda lo ejemplifica.
 */
export const MODOS: { value: ModoTrigger; label: string; ayuda: string }[] = [
  { value: "una_lectura", label: "Cada vez que pase",
    ayuda: "Abre una orden con cada lectura que cumpla la condición." },
  { value: "una_lectura_reset", label: "Sólo la primera vez (hasta que se normalice)",
    ayuda: "Abre una orden la primera vez y no vuelve a abrir otra hasta que el medidor vuelva a valores normales y se pase de nuevo. Evita una orden por cada lectura mientras el problema sigue ahí." },
  { value: "lecturas_multiples", label: "Recién cuando se repita varias veces",
    ayuda: "Espera a que varias de las últimas lecturas cumplan la condición antes de abrir la orden. Sirve para no reaccionar a una medición suelta o mal tomada." },
];

/**
 * Los tipos de acción que ofrece el selector.
 *
 * `crear_solicitud` y `enviar_notificacion` siguen en el enum de la base —hay
 * filas históricas posibles y quitarlas sería una migración destructiva— pero
 * no se ofrecen: se decidió no construirlas. Mostrarlas con candado prometía
 * algo que no va a llegar.
 */
export const TIPOS_ACCION: { value: TipoAccion; label: string }[] = [
  { value: "crear_ot",              label: "Crear una orden de trabajo" },
  { value: "cambiar_estado_activo", label: "Cambiar el estado del activo" },
];

export const ESTADOS_ACTIVO: { value: EstadoActivo; label: string }[] = [
  { value: "operativo",      label: "Operativo" },
  { value: "mantencion",     label: "En mantención" },
  { value: "fuera_servicio", label: "Fuera de servicio" },
  { value: "baja",           label: "De baja" },
];

export const CRITICIDADES: { value: AssetCriticality; label: string }[] = [
  { value: "critico",      label: "Crítico" },
  { value: "semi_critico", label: "Semi crítico" },
  { value: "no_critico",   label: "No crítico" },
];

/** ISODOW, que es lo que compara el motor: lunes=1 … domingo=7. */
export const DIAS_SEMANA: { value: number; label: string; corto: string }[] = [
  { value: 1, label: "Lunes",     corto: "L" },
  { value: 2, label: "Martes",    corto: "M" },
  { value: 3, label: "Miércoles", corto: "X" },
  { value: 4, label: "Jueves",    corto: "J" },
  { value: 5, label: "Viernes",   corto: "V" },
  { value: 6, label: "Sábado",    corto: "S" },
  { value: 7, label: "Domingo",   corto: "D" },
];

/**
 * Los cuatro tipos con el texto que ve el usuario.
 *
 * `ayuda` dice para qué sirve en obra, no qué compara: "el activo está en
 * mantención" ya se lee en el título, y lo que nadie adivina es que esa es la
 * condición que corta las OT duplicadas sobre una máquina ya intervenida.
 */
export const TIPOS_CONDICION: {
  value: TipoCondicion; label: string; ayuda: string;
  /** Texto del switch de negado, en los tipos donde invertir tiene sentido. */
  negable?: string;
}[] = [
  { value: "estado_activo", label: "El estado del activo es...",
    ayuda: "Actúa solo cuando el activo está en alguno de los estados elegidos. Invertida es el uso más común: no abrir órdenes sobre una máquina que ya está en mantención.",
    negable: "Invertir: actuar cuando NO esté en esos estados" },
  { value: "ventana_horaria", label: "Es uno de estos días y horarios...",
    ayuda: "Actúa solo con las lecturas tomadas dentro de la ventana. Sirve para vigilar el turno de noche o el fin de semana, cuando no hay nadie en planta.",
    negable: "Invertir: actuar fuera de esa ventana" },
  { value: "sin_ot_abierta_en_activo", label: "El activo no tiene órdenes abiertas...",
    ayuda: "Evita apilar órdenes sobre un activo que ya tiene trabajo pendiente, sin importar quién abrió la anterior ni desde qué regla." },
  { value: "criticidad_activo", label: "La criticidad del activo es...",
    ayuda: "Actúa solo sobre activos de la criticidad elegida. Permite una sola regla para toda la flota en vez de una por máquina." },
];

/** Una condición dicha en una línea, para la ficha y la tarjeta plegada. */
export function describirCondicion(c: Pick<AutomatizacionCondicion, "tipo" | "config" | "negado">): string {
  const no = c.negado ? "no " : "";
  switch (c.tipo) {
    case "estado_activo": {
      const ls = (c.config.estados ?? []).map(e => ESTADOS_ACTIVO.find(x => x.value === e)?.label ?? e);
      if (ls.length === 0) return "Estado del activo — sin estados elegidos";
      return `El activo ${no}está ${ls.length === 1 ? ls[0].toLowerCase() : "en: " + ls.join(", ").toLowerCase()}`;
    }
    case "criticidad_activo": {
      const ls = (c.config.criticidades ?? []).map(x => CRITICIDADES.find(y => y.value === x)?.label ?? x);
      if (ls.length === 0) return "Criticidad del activo — sin criticidad elegida";
      return `La criticidad del activo ${no}es ${ls.join(" o ").toLowerCase()}`;
    }
    case "sin_ot_abierta_en_activo":
      return c.negado
        ? "El activo ya tiene una orden de trabajo abierta"
        : "El activo no tiene órdenes de trabajo abiertas";
    case "ventana_horaria": {
      const d = c.config.desde ?? "00:00";
      const h = c.config.hasta ?? "23:59";
      const dias = c.config.dias ?? [];
      // Los siete días es lo mismo que ninguno: se dice "todos los días" en vez
      // de enumerarlos, que es cómo lo diría una persona.
      const cuando = dias.length === 0 || dias.length === 7
        ? "todos los días"
        : DIAS_SEMANA.filter(x => dias.includes(x.value)).map(x => x.label.toLowerCase()).join(", ");
      return `La lectura ${no}es entre las ${d} y las ${h}, ${cuando}`;
    }
  }
}

/**
 * La condición en castellano, para la lista y la ficha.
 *
 * La unidad se concatena solo si existe: un medidor sin unidad dejaba
 * "es igual a 3 " con el espacio colgando.
 */
export function describirTrigger(
  t: Pick<AutomatizacionTrigger, "operador" | "valor" | "valor_hasta">,
  unidad: string,
): string {
  const sufijo = unidad ? ` ${unidad}` : "";
  if (t.operador === "entre") {
    return `${OPERADOR_TEXTO.entre} ${t.valor} y ${t.valor_hasta}${sufijo}`;
  }
  // Los de delta se leen al revés que los de umbral: "aumenta 5000 km" habla de
  // cuánto cambió, no de qué valor alcanzó, y sin decir desde dónde la frase
  // queda a medias.
  if (esAcumulado(t.operador)) {
    return `${OPERADOR_TEXTO[t.operador]} ${t.valor}${sufijo} desde el último disparo`;
  }
  if (esDelta(t.operador)) {
    return `${OPERADOR_TEXTO[t.operador]} ${t.valor}${sufijo} respecto de la lectura anterior`;
  }
  return `${OPERADOR_TEXTO[t.operador]} ${t.valor}${sufijo}`;
}

/**
 * El select se arma por partes porque la base puede ir dos migraciones atrás.
 *
 * `conProximo` = la columna `proximo_disparo` (20260920160000).
 * `conCondiciones` = la tabla `automatizacion_condiciones` (20260920120000).
 *
 * Son independientes: una base puede tener una y no la otra según qué se aplicó.
 */
function armarSelect(conCondiciones: boolean, conProximo: boolean) {
  const triggers = [
    "id", "automatizacion_id", "medidor_id", "operador", "valor", "valor_hasta",
    "modo", "modo_n", "armado",
    ...(conProximo ? ["proximo_disparo"] : []),
  ].join(", ");

  return `
  id, workspace_id, nombre, descripcion, activa, ultima_ejecucion_at, creado_por, created_at,
  automatizacion_triggers ( ${triggers} ),
  automatizacion_acciones ( id, automatizacion_id, tipo, config, retrigger_minutos, solo_si_anterior_cerrada, orden )${
    conCondiciones
      ? `,
  automatizacion_condiciones ( id, automatizacion_id, tipo, config, negado, orden )`
      : ""
  }`;
}

/**
 * Si la base todavía no tiene `automatizacion_condiciones`, se pide sin ella.
 *
 * El despliegue de migraciones está bloqueado (ver supabase/README.md), así que
 * el código llega a producción antes que la tabla. Sin esto, PostgREST responde
 * 400 al embed que no puede resolver y la página entera queda vacía: una función
 * nueva que todavía no existe no puede romper la pantalla que ya funcionaba.
 *
 * Se recuerda en un módulo y no por automatización: la respuesta es la misma
 * para todo el proyecto y reintentar el embed en cada consulta es un 400 por
 * carga. Vuelve a null en cada recarga de la app, así que el día que la
 * migración entre, la primera consulta ya la encuentra.
 */
let hayCondiciones: boolean | null = null;

/**
 * Lo mismo para la columna `proximo_disparo` de los operadores acumulados.
 *
 * Bandera aparte y no la misma: las dos migraciones se aplican por separado, y
 * una base con la tabla de condiciones pero sin esta columna —o al revés— es
 * un estado real mientras el despliegue esté bloqueado. Compartir la bandera
 * apagaría una función que sí está.
 */
let hayProximoDisparo: boolean | null = null;

/**
 * Los dos códigos de "esa columna no existe".
 *
 * `42703` lo tira Postgres al parsear; `PGRST204` lo tira PostgREST desde su
 * caché de esquema, que es por donde salen los INSERT y UPDATE. Un guard que
 * mire solo el primero deja pasar el camino de escritura.
 */
function esColumnaFaltante(code?: string): boolean {
  return code === "42703" || code === "PGRST204";
}

/**
 * Si el paso "Sólo si además…" se puede ofrecer.
 *
 * `null` (todavía sin consultar) cuenta como sí: la tabla es lo normal y
 * esconder el paso hasta la primera consulta lo haría aparecer de golpe.
 */
export function condicionesDisponibles(): boolean {
  return hayCondiciones !== false;
}

/**
 * Si se puede ofrecer el "Empezar a disparar en" de los acumulados.
 *
 * Misma idea: sin la columna, el campo no se muestra y no se escribe. Los
 * operadores acumulados igual funcionan —el motor viejo simplemente no los
 * conoce, así que tampoco se ofrecen—; ver `operadoresDisponibles`.
 */
export function proximoDisparoDisponible(): boolean {
  return hayProximoDisparo !== false;
}

/**
 * Los operadores que esta base entiende.
 *
 * El CHECK de `operador` viejo solo acepta cuatro: guardar 'mayor' contra una
 * base sin la migración la rechaza con un error de constraint que no dice nada
 * útil. Mientras falte la columna —que viaja en la misma migración— se ofrecen
 * los cuatro de siempre.
 */
export function operadoresDisponibles(): typeof OPERADORES {
  if (hayProximoDisparo !== false) return OPERADORES;
  const viejos: OperadorTrigger[] = ["mayor_igual", "menor_igual", "igual", "entre"];
  return OPERADORES.filter(o => viejos.includes(o.value));
}

/** Todas las del espacio, con sus disparadores, acciones y condiciones embebidos. */
export async function fetchAutomatizaciones(workspaceId: string): Promise<AutomatizacionCompleta[]> {
  const sb = createClient();

  const pedir = (conCondiciones: boolean, conProximo: boolean) => sb
    .from("automatizaciones")
    .select(armarSelect(conCondiciones, conProximo))
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  let { data, error } = await pedir(hayCondiciones !== false, hayProximoDisparo !== false);

  // Dos formas de "la migración todavía no corrió", y se reintenta por cada una:
  //   PGRST200 → el embed apunta a una relación que no existe (la tabla).
  //   42703 / PGRST204 → la columna no existe (`proximo_disparo`). Postgres
  //   contesta lo primero y la caché de esquema de PostgREST lo segundo, según
  //   por dónde se detecte; las dos significan lo mismo.
  // Se bajan las banderas que correspondan y se pide de nuevo. Cualquier otro
  // error se propaga: esto cubre una base desactualizada, no errores de verdad.
  if (error && (error.code === "PGRST200" || esColumnaFaltante(error.code))) {
    let reintentar = false;
    if (error.code === "PGRST200" && hayCondiciones === null) {
      hayCondiciones = false;
      reintentar = true;
    }
    if (esColumnaFaltante(error.code) && hayProximoDisparo === null) {
      hayProximoDisparo = false;
      reintentar = true;
    }
    if (reintentar) {
      ({ data, error } = await pedir(hayCondiciones !== false, hayProximoDisparo !== false));
      // Una base sin NINGUNA de las dos falla dos veces: la primera respuesta
      // solo delata un problema por vez. El segundo intento destapa el otro.
      if (error && (error.code === "PGRST200" || esColumnaFaltante(error.code))) {
        if (error.code === "PGRST200") hayCondiciones = false;
        if (esColumnaFaltante(error.code)) hayProximoDisparo = false;
        ({ data, error } = await pedir(hayCondiciones !== false, hayProximoDisparo !== false));
      }
    }
  }
  if (!error) {
    hayCondiciones = hayCondiciones ?? true;
    hayProximoDisparo = hayProximoDisparo ?? true;
  }

  if (error) throw error;

  // Embebidos y no en tres consultas: la lista muestra la condición de cada
  // fila, así que resolverlos después costaría un viaje por automatización.
  return ((data ?? []) as unknown as (Automatizacion & {
    automatizacion_triggers: AutomatizacionTrigger[];
    automatizacion_acciones: AutomatizacionAccion[];
    automatizacion_condiciones: AutomatizacionCondicion[];
  })[]).map(({ automatizacion_triggers, automatizacion_acciones, automatizacion_condiciones, ...resto }) => ({
    ...resto,
    triggers: automatizacion_triggers ?? [],
    acciones: (automatizacion_acciones ?? []).sort((a, b) => a.orden - b.orden),
    // Sin la tabla, la clave no viene: la regla se lee como "sin requisitos",
    // que es lo que de hecho hace el motor viejo.
    condiciones: (automatizacion_condiciones ?? []).sort((a, b) => a.orden - b.orden),
  }));
}

/** El panel "Historia de la acción", de la más nueva hacia atrás. */
export async function fetchEjecuciones(
  automatizacionId: string,
  limite = 30,
): Promise<AutomatizacionEjecucion[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("automatizacion_ejecuciones")
    .select("id, automatizacion_id, accion_id, lectura_id, resultado, detalle, valor, orden_id, created_at")
    .eq("automatizacion_id", automatizacionId)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return (data ?? []) as unknown as AutomatizacionEjecucion[];
}

export interface AutomatizacionInput {
  nombre: string;
  descripcion?: string | null;
  triggers: {
    /**
     * Id de la fila existente, al editar. Ausente = disparador nuevo.
     *
     * Es lo que permite actualizar en vez de reemplazar, y con eso conservar
     * `armado`: sin el id, editar el título de una automatización le devolvía
     * el latch a "sin disparar" y el modo "una lectura, luego reiniciar"
     * volvía a dispararse.
     */
    id?: string;
    medidor_id: string;
    operador: OperadorTrigger;
    valor: number;
    valor_hasta?: number | null;
    modo: ModoTrigger;
    modo_n?: number | null;
    /**
     * Solo en los acumulados. `null` = que lo fije la primera lectura.
     *
     * Al editar solo viaja si el usuario lo cambió: es estado del motor —avanza
     * solo con cada disparo— y reenviar el valor que se cargó en pantalla
     * retrocedría el contador a donde estaba cuando se abrió el panel.
     */
    proximo_disparo?: number | null;
  }[];
  /**
   * Las condiciones no llevan `id`: se reemplazan enteras al guardar.
   *
   * A diferencia de disparadores y acciones, una condición NO guarda estado del
   * motor —no hay latch ni historial que cuelgue de su id—, así que recrearlas
   * no pierde nada y evita el ida y vuelta de ids en el formulario.
   */
  condiciones: {
    tipo: TipoCondicion;
    config: CondicionConfig;
    negado: boolean;
  }[];
  acciones: {
    /**
     * Id de la fila existente, al editar. Ausente = acción nueva.
     *
     * El freno de retrigger busca la última ejecución por `accion_id`, así que
     * una acción recreada estrena historial y el freno se olvida de lo que ya
     * había disparado. Conservar el id mantiene el enfriamiento.
     */
    id?: string;
    tipo: TipoAccion;
    config: ConfigCrearOT | ConfigCambiarEstado;
    retrigger_minutos: number;
    solo_si_anterior_cerrada: boolean;
  }[];
}

export async function createAutomatizacion(
  workspaceId: string,
  input: AutomatizacionInput,
): Promise<Automatizacion> {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  const { data, error } = await sb
    .from("automatizaciones")
    .insert({
      workspace_id: workspaceId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      creado_por: auth.user?.id ?? null,
    })
    .select("id, workspace_id, nombre, descripcion, activa, ultima_ejecucion_at, creado_por, created_at")
    .single();

  if (error) throw error;
  const auto = data as unknown as Automatizacion;

  await insertarHijos(auto.id, input);
  return auto;
}

/**
 * Guarda los cambios reemplazando disparadores y acciones.
 *
 * Se borran y se reinsertan en vez de hacer un diff: la ficha edita el conjunto
 * completo, y un diff por id significaría mantener la correspondencia en el
 * formulario para ahorrar dos DELETE. El historial no se toca —cuelga de la
 * automatización, no de la acción— salvo por `accion_id`, que queda NULL por el
 * ON DELETE SET NULL, que es justo lo que corresponde: esa acción ya no existe.
 */
export async function updateAutomatizacion(id: string, input: AutomatizacionInput): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("automatizaciones")
    .update({ nombre: input.nombre.trim(), descripcion: input.descripcion?.trim() || null })
    .eq("id", id);
  if (error) throw error;

  // Las filas se actualizan en su lugar, no se borran y recrean.
  //
  // Antes esto era DELETE + INSERT, que es más corto y estaba mal: los hijos
  // guardan ESTADO que no está en el formulario. `automatizacion_triggers.armado`
  // es el latch de "una lectura, luego reiniciar", y el freno de retrigger busca
  // la última ejecución por `accion_id`. Recrear las filas les daba ids nuevos,
  // así que editar el título rearmaba el latch, reseteaba el enfriamiento y
  // dejaba el historial apuntando a una acción que ya no existía (accion_id NULL
  // por el ON DELETE SET NULL). Se detectó editando una automatización en vivo
  // entre dos lecturas.
  const idsT = input.triggers.map(t => t.id).filter(Boolean) as string[];
  const idsA = input.acciones.map(a => a.id).filter(Boolean) as string[];

  // Primero se van los que el usuario sacó del formulario. `not in ()` con lista
  // vacía es sintaxis inválida en PostgREST, de ahí las dos ramas.
  const borrarSobrantes = async (tabla: string, conservar: string[]) => {
    let q = sb.from(tabla).delete().eq("automatizacion_id", id);
    if (conservar.length > 0) q = q.not("id", "in", `(${conservar.join(",")})`);
    const { error } = await q;
    if (error) throw error;
  };
  await borrarSobrantes("automatizacion_triggers", idsT);
  await borrarSobrantes("automatizacion_acciones", idsA);

  for (const t of input.triggers) {
    const fila = {
      medidor_id: t.medidor_id,
      operador: t.operador,
      valor: t.valor,
      // La constraint exige NULL fuera de 'entre' y un valor dentro.
      valor_hasta: t.operador === "entre" ? (t.valor_hasta ?? null) : null,
      modo: t.modo,
      modo_n: t.modo === "lecturas_multiples" ? (t.modo_n ?? 2) : null,
      // Fuera de los acumulados se limpia: un objetivo colgando en un operador
      // que no lo usa es una regla que se lee de dos maneras. Dentro de ellos
      // solo viaja si el usuario lo tocó —ver el comentario del input—, porque
      // el motor lo viene avanzando por su cuenta.
      // Sin la columna en la base, no se manda: PostgREST rechaza el update
      // entero por una clave que no existe.
      ...(hayProximoDisparo === false ? {} : (esAcumulado(t.operador)
        ? (t.proximo_disparo !== undefined ? { proximo_disparo: t.proximo_disparo } : {})
        : { proximo_disparo: null })),
    };
    // `armado` queda fuera del update a propósito: es estado del motor, no del
    // formulario. Un disparador nuevo nace armado por el default de la tabla.
    const escribir = (f: Record<string, unknown>) => t.id
      ? sb.from("automatizacion_triggers").update(f).eq("id", t.id)
      : sb.from("automatizacion_triggers").insert({ automatizacion_id: id, ...f });

    let { error } = await escribir(fila);

    // Guardar puede ser lo PRIMERO que toque la tabla en esta sesión, así que
    // la bandera todavía puede estar en null y `fila` llevar la columna. Se
    // reintenta sin ella en vez de estallar: es el mismo "la migración no
    // corrió" que ya cubre la lectura.
    if (error && esColumnaFaltante(error.code)) {
      hayProximoDisparo = false;
      const { proximo_disparo: _omitido, ...sinColumna } = fila;
      void _omitido;
      ({ error } = await escribir(sinColumna));
    }
    if (error) throw error;
  }

  for (const [i, a] of input.acciones.entries()) {
    const fila = {
      tipo: a.tipo,
      config: a.config,
      retrigger_minutos: a.retrigger_minutos,
      solo_si_anterior_cerrada: a.solo_si_anterior_cerrada,
      orden: i,
    };
    const { error } = a.id
      ? await sb.from("automatizacion_acciones").update(fila).eq("id", a.id)
      : await sb.from("automatizacion_acciones").insert({ automatizacion_id: id, ...fila });
    if (error) throw error;
  }

  // Las condiciones sí se borran y reinsertan: no guardan estado del motor, así
  // que un id nuevo no pierde nada. Es el DELETE+INSERT que en triggers y
  // acciones estaba mal y acá es correcto.
  await reemplazarCondiciones(id, input.condiciones);
}

async function reemplazarCondiciones(
  id: string,
  condiciones: AutomatizacionInput["condiciones"],
): Promise<void> {
  // Mientras la tabla no exista, guardar una regla SIN condiciones tiene que
  // seguir funcionando: es todo lo que se podía hacer antes de esta función y
  // fallar ahí rompería el alta que ya andaba. Con condiciones sí se falla,
  // porque guardar en silencio una regla a la que le falta su filtro haría que
  // actúe de más, que es el error caro.
  if (hayCondiciones === false && condiciones.length === 0) return;

  const sb = createClient();
  const { error: eDel } = await sb
    .from("automatizacion_condiciones").delete().eq("automatizacion_id", id);
  // 42P01 = la tabla no existe todavía.
  if (eDel && eDel.code === "42P01" && condiciones.length === 0) {
    hayCondiciones = false;
    return;
  }
  if (eDel) throw eDel;

  if (condiciones.length === 0) return;

  const { error } = await sb.from("automatizacion_condiciones").insert(
    condiciones.map((c, i) => ({
      automatizacion_id: id,
      tipo: c.tipo,
      config: c.config,
      negado: c.negado,
      orden: i,
    })),
  );
  if (error) throw error;
}

async function insertarHijos(id: string, input: AutomatizacionInput): Promise<void> {
  const sb = createClient();

  const filas = (conProximo: boolean) => input.triggers.map(t => ({
    automatizacion_id: id,
    medidor_id: t.medidor_id,
    operador: t.operador,
    valor: t.valor,
    // La constraint exige NULL fuera de 'entre' y un valor dentro.
    valor_hasta: t.operador === "entre" ? (t.valor_hasta ?? null) : null,
    modo: t.modo,
    modo_n: t.modo === "lecturas_multiples" ? (t.modo_n ?? 2) : null,
    // Nueva: `null` deja que la primera lectura fije el objetivo, que es lo
    // correcto para un medidor que ya viene marcando algo.
    ...(conProximo ? {
      proximo_disparo: esAcumulado(t.operador) ? (t.proximo_disparo ?? null) : null,
    } : {}),
  }));

  let { error: eT } = await sb.from("automatizacion_triggers")
    .insert(filas(hayProximoDisparo !== false));

  // Igual que en el update: crear puede ser lo primero que toque la tabla, así
  // que la bandera todavía puede no saber que la columna no está.
  if (eT && esColumnaFaltante(eT.code)) {
    hayProximoDisparo = false;
    ({ error: eT } = await sb.from("automatizacion_triggers").insert(filas(false)));
  }
  if (eT) throw eT;

  // Antes del early-return de abajo: una regla sin acciones igual puede tener
  // condiciones guardadas, y colgarlas después del `return` las perdía.
  await reemplazarCondiciones(id, input.condiciones);

  if (input.acciones.length === 0) return;

  const { error: eA } = await sb.from("automatizacion_acciones").insert(
    input.acciones.map((a, i) => ({
      automatizacion_id: id,
      tipo: a.tipo,
      config: a.config,
      retrigger_minutos: a.retrigger_minutos,
      solo_si_anterior_cerrada: a.solo_si_anterior_cerrada,
      orden: i,
    })),
  );
  if (eA) throw eA;
}

export async function toggleAutomatizacion(id: string, activa: boolean): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("automatizaciones").update({ activa }).eq("id", id);
  if (error) throw error;
}

/** Borrado real: los hijos caen por CASCADE y el historial con ellos. */
export async function deleteAutomatizacion(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("automatizaciones").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Qué medidor queda elegido al cambiar el activo del disparador.
 *
 * El activo es un filtro de la UI —el disparador se guarda solo con
 * `medidor_id`—, así que esta función existe para responder la única pregunta
 * con enjundia del filtro: qué pasa con el medidor que ya estaba elegido.
 *
 *  - Sin activo (se quitó el filtro) el medidor se respeta: quitar un filtro no
 *    puede borrar lo que el usuario ya eligió.
 *  - Si el medidor pertenece al activo nuevo, se queda.
 *  - Si no, y el activo tiene exactamente uno, se elige solo. Es el caso normal
 *    —un activo, un medidor— y pedir un segundo clic para la única opción
 *    posible es trabajo por gusto.
 *  - Si no, y hay varios (o ninguno), se suelta y el usuario elige.
 */
export function medidorTrasCambiarActivo(
  medidorActual: string,
  activoId: string,
  medidores: { id: string; activo_id?: string | null }[],
): string {
  if (!activoId) return medidorActual;
  const suyos = medidores.filter(m => m.activo_id === activoId);
  if (suyos.some(m => m.id === medidorActual)) return medidorActual;
  return suyos.length === 1 ? suyos[0].id : "";
}

/**
 * Agrupa las filas guardadas por medidor.
 *
 * En la base cada condición es una fila de `automatizacion_triggers` con su
 * `medidor_id`; el constructor las muestra agrupadas —un medidor, sus
 * condiciones unidas por O— porque es como se piensan y porque repetir el
 * selector de medidor en cada fila era el mismo dato N veces.
 *
 * El orden de los grupos sigue al de la primera fila de cada medidor, para que
 * reabrir la regla no baraje las tarjetas.
 */
export function agruparTriggersPorMedidor<T extends { medidor_id: string }>(
  filas: T[],
): { medidor_id: string; condiciones: T[] }[] {
  const porMedidor = new Map<string, { medidor_id: string; condiciones: T[] }>();
  for (const f of filas) {
    if (!porMedidor.has(f.medidor_id)) {
      porMedidor.set(f.medidor_id, { medidor_id: f.medidor_id, condiciones: [] });
    }
    porMedidor.get(f.medidor_id)!.condiciones.push(f);
  }
  return [...porMedidor.values()];
}
