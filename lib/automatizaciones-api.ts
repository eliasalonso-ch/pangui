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
import type { OTLink } from "@/types/ordenes";

export type OperadorTrigger = "mayor_igual" | "menor_igual" | "igual" | "entre";
export type ModoTrigger = "una_lectura" | "una_lectura_reset" | "lecturas_multiples";
export type TipoAccion = "crear_ot" | "crear_solicitud" | "cambiar_estado_activo" | "enviar_notificacion";
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

export interface AutomatizacionAccion {
  id: string;
  automatizacion_id: string;
  tipo: TipoAccion;
  config: ConfigCrearOT;
  retrigger_minutos: number;
  solo_si_anterior_cerrada: boolean;
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
}

const OPERADOR_TEXTO: Record<OperadorTrigger, string> = {
  mayor_igual: "es mayor o igual a",
  menor_igual: "es menor o igual a",
  igual:       "es igual a",
  entre:       "está entre",
};

export const OPERADORES: { value: OperadorTrigger; label: string }[] = [
  { value: "mayor_igual", label: "Es mayor o igual a" },
  { value: "menor_igual", label: "Es menor o igual a" },
  { value: "igual",       label: "Es igual a" },
  { value: "entre",       label: "Está entre" },
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
  return `${OPERADOR_TEXTO[t.operador]} ${t.valor}${sufijo}`;
}

const AUTO_SELECT = `
  id, workspace_id, nombre, descripcion, activa, ultima_ejecucion_at, creado_por, created_at,
  automatizacion_triggers ( id, automatizacion_id, medidor_id, operador, valor, valor_hasta, modo, modo_n, armado ),
  automatizacion_acciones ( id, automatizacion_id, tipo, config, retrigger_minutos, solo_si_anterior_cerrada, orden )
`;

/** Todas las del espacio, con sus disparadores y acciones ya embebidos. */
export async function fetchAutomatizaciones(workspaceId: string): Promise<AutomatizacionCompleta[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("automatizaciones")
    .select(AUTO_SELECT)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Embebidos y no en tres consultas: la lista muestra la condición de cada
  // fila, así que resolverlos después costaría un viaje por automatización.
  return ((data ?? []) as unknown as (Automatizacion & {
    automatizacion_triggers: AutomatizacionTrigger[];
    automatizacion_acciones: AutomatizacionAccion[];
  })[]).map(({ automatizacion_triggers, automatizacion_acciones, ...resto }) => ({
    ...resto,
    triggers: automatizacion_triggers ?? [],
    acciones: (automatizacion_acciones ?? []).sort((a, b) => a.orden - b.orden),
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
    config: ConfigCrearOT;
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
    };
    // `armado` queda fuera del update a propósito: es estado del motor, no del
    // formulario. Un disparador nuevo nace armado por el default de la tabla.
    const { error } = t.id
      ? await sb.from("automatizacion_triggers").update(fila).eq("id", t.id)
      : await sb.from("automatizacion_triggers").insert({ automatizacion_id: id, ...fila });
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
}

async function insertarHijos(id: string, input: AutomatizacionInput): Promise<void> {
  const sb = createClient();

  const { error: eT } = await sb.from("automatizacion_triggers").insert(
    input.triggers.map(t => ({
      automatizacion_id: id,
      medidor_id: t.medidor_id,
      operador: t.operador,
      valor: t.valor,
      // La constraint exige NULL fuera de 'entre' y un valor dentro.
      valor_hasta: t.operador === "entre" ? (t.valor_hasta ?? null) : null,
      modo: t.modo,
      modo_n: t.modo === "lecturas_multiples" ? (t.modo_n ?? 2) : null,
    })),
  );
  if (eT) throw eT;

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
