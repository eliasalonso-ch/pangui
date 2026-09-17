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

export const MODOS: { value: ModoTrigger; label: string; ayuda: string }[] = [
  { value: "una_lectura", label: "Una lectura",
    ayuda: "Se activa cada vez que una lectura cumple la condición." },
  { value: "una_lectura_reset", label: "Una lectura, luego reiniciar",
    ayuda: "No se vuelve a activar hasta que la condición se despeje y se cumpla de nuevo." },
  { value: "lecturas_multiples", label: "Lecturas múltiples",
    ayuda: "Se activa cuando un número definido de las últimas lecturas cumplen la condición." },
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
    medidor_id: string;
    operador: OperadorTrigger;
    valor: number;
    valor_hasta?: number | null;
    modo: ModoTrigger;
    modo_n?: number | null;
  }[];
  acciones: {
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

  const { error: eT } = await sb.from("automatizacion_triggers").delete().eq("automatizacion_id", id);
  if (eT) throw eT;
  const { error: eA } = await sb.from("automatizacion_acciones").delete().eq("automatizacion_id", id);
  if (eA) throw eA;

  await insertarHijos(id, input);
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
