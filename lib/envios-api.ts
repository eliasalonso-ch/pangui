/**
 * Envío de OTs a contratistas con su propio workspace.
 *
 * La OT nunca se copia: vive en el workspace del dueño y el contratista la ve
 * por `ot_envios` (ver supabase/migrations/20261014230000_envios_contratista.sql).
 * Las reglas viven en la base; acá solo hay lecturas y llamadas a las RPC.
 */
import { createClient } from "@/lib/supabase";
import { insertActividad } from "@/lib/ordenes-api";

export type OTEnvio = {
  orden_id: string;
  vinculo_id: string;
  workspace_origen: string;
  workspace_destino: string;
  activo: boolean;
  nota: string | null;
  nombre_origen: string;
  nombre_destino: string;
  enviado_at: string;
};

export type VinculoContratista = {
  id: string;
  proveedor_id: string;
  email_invitado: string;
  estado: "invitado" | "activo" | "revocado";
  workspace_dueno: string;
  workspace_contratista: string | null;
  proveedor: { nombre: string } | null;
};

export type InvitacionContratista = { id: string; cliente: string; created_at: string };

/** Una conexión vista desde mi lado (RPC mis_vinculos). */
export type MiVinculo = {
  id: string;
  /** Solo desde el lado dueño: el proveedor al que cuelga el vínculo. */
  proveedor_id: string | null;
  contraparte: string;
  contraparte_es: "contratista" | "cliente";
  estado: "invitado" | "activo" | "revocado";
  email_invitado: string;
  aceptado_at: string | null;
  revocado_at: string | null;
  /** Fui yo quien cortó, hace menos de 30 días, y soy owner/admin. */
  puedo_reconectar: boolean;
  ots_abiertas: number;
};

/** Días que el lado que cortó tiene para deshacerlo (igual que en la base). */
export const DIAS_PARA_RECONECTAR = 30;

const VINCULO_SELECT =
  "id, proveedor_id, email_invitado, estado, workspace_dueno, workspace_contratista, proveedor:proveedores(nombre)";

/**
 * Envíos activos de una OT. El dueño ve uno por proveedor; un proveedor ve
 * solo el suyo (RLS).
 */
export async function fetchEnvios(ordenId: string): Promise<OTEnvio[]> {
  const { data, error } = await createClient()
    .from("ot_envios")
    .select("*")
    .eq("orden_id", ordenId)
    .eq("activo", true)
    .order("enviado_at");
  if (error) throw error;
  return (data ?? []) as OTEnvio[];
}

/** Contratistas conectados a los que este workspace puede enviar OTs. */
export async function fetchVinculosActivos(wsId: string): Promise<VinculoContratista[]> {
  const { data, error } = await createClient()
    .from("vinculos_contratista")
    .select(VINCULO_SELECT)
    .eq("workspace_dueno", wsId)
    .eq("estado", "activo");
  if (error) throw error;
  return (data ?? []) as unknown as VinculoContratista[];
}

export async function fetchMisVinculos(): Promise<MiVinculo[]> {
  return ((await rpc("mis_vinculos", {})) ?? []) as MiVinculo[];
}

/**
 * El vínculo que importa para la ficha de un proveedor: el vivo (invitado o
 * activo) o, si no hay, un corte reciente que este lado aún puede deshacer.
 */
export async function fetchVinculoDeProveedor(proveedorId: string): Promise<MiVinculo | null> {
  const delProveedor = (await fetchMisVinculos()).filter(v => v.proveedor_id === proveedorId);
  return delProveedor.find(v => v.estado !== "revocado")
    ?? delProveedor.find(v => v.puedo_reconectar)
    ?? null;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export const invitarContratista = (proveedorId: string, email: string) =>
  rpc("invitar_contratista", { p_proveedor_id: proveedorId, p_email: email }) as Promise<string>;
export const aceptarInvitacion = (id: string) => rpc("aceptar_vinculo_contratista", { p_id: id });
export const revocarVinculo = (id: string) => rpc("revocar_vinculo_contratista", { p_id: id });
/** Devuelve cuántas OTs abiertas volvieron al contratista. */
export const reconectarVinculo = (id: string) =>
  rpc("reconectar_vinculo_contratista", { p_id: id }) as Promise<number>;
// Enviar/retirar invalidan el caché de la bandeja para que el filtro "Origen"
// no quede 30 s atrasado (vence el caché sin vaciarlo: las filas no pierden
// su origen mientras llega el refetch).
export const enviarOT = (ordenId: string, vinculoId: string, nota: string) =>
  rpc("enviar_ot_contratista", { p_orden_id: ordenId, p_vinculo_id: vinculoId, p_nota: nota })
    .finally(() => { if (recibidasCache) recibidasCache.at = 0; });
/** Retira la OT de un proveedor; sin vinculoId, de todos. */
export const retirarEnvio = (ordenId: string, vinculoId?: string) =>
  rpc("retirar_envio_ot", { p_orden_id: ordenId, p_vinculo_id: vinculoId ?? null })
    .finally(() => { if (recibidasCache) recibidasCache.at = 0; });

export async function fetchInvitaciones(): Promise<InvitacionContratista[]> {
  return ((await rpc("mis_invitaciones_contratista", {})) ?? []) as InvitacionContratista[];
}

/**
 * El cliente devuelve la OT al contratista con una observación. Queda en espera
 * con el motivo en la actividad, que es lo que muestran la tarjeta y el detalle.
 */
export async function observarOT(ordenId: string, userId: string, texto: string): Promise<void> {
  const { error } = await createClient()
    .from("ordenes_trabajo")
    .update({ estado: "en_espera", en_ejecucion: false, pausado_at: new Date().toISOString() })
    .eq("id", ordenId);
  if (error) throw error;
  await insertActividad(ordenId, userId, "estado_cambiado", `Observada: ${texto.trim()}`);
}

// ── Alcance de la bandeja ────────────────────────────────────────────────────
// Las listas filtran por workspace_id por rendimiento. Un contratista además
// ve las OTs que le enviaron, que viven en el workspace del cliente: se suman
// esos workspaces al filtro y RLS deja pasar solo las OTs enviadas.

type Recibidas = {
  wsId: string;
  at: number;
  porOrden: Map<string, string>;
  origenes: string[];
  /** OTs propias con algún envío activo a un proveedor. */
  enviadas: Set<string>;
};
let recibidasCache: Recibidas | null = null;
// Las listas se piden varias veces por carga (página, snapshot, calendario).
const RECIBIDAS_TTL_MS = 30_000;

/** Workspaces cuyas OTs entran en la bandeja de `wsId`: el propio y sus clientes. */
export async function workspacesDeBandeja(wsId: string): Promise<string[]> {
  if (recibidasCache?.wsId !== wsId || Date.now() - recibidasCache.at >= RECIBIDAS_TTL_MS) {
    // Las dos direcciones en una consulta: lo recibido arma el alcance y lo
    // enviado alimenta el filtro "Origen".
    const { data, error } = await createClient()
      .from("ot_envios")
      .select("orden_id, workspace_origen, workspace_destino, nombre_origen")
      .or(`workspace_destino.eq.${wsId},workspace_origen.eq.${wsId}`)
      .eq("activo", true);
    // Sin envíos legibles la bandeja sigue funcionando con lo propio: un fallo
    // acá no puede dejar a nadie sin sus OTs.
    if (error) return [wsId];
    const rows = data ?? [];
    const recibidas = rows.filter((r) => r.workspace_destino === wsId);
    recibidasCache = {
      wsId,
      at: Date.now(),
      porOrden: new Map(recibidas.map((r) => [r.orden_id as string, r.nombre_origen as string])),
      origenes: [...new Set(recibidas.map((r) => r.workspace_origen as string))],
      enviadas: new Set(rows.filter((r) => r.workspace_origen === wsId).map((r) => r.orden_id as string)),
    };
  }
  return [wsId, ...recibidasCache.origenes];
}

/** Nombre del cliente si la OT fue recibida; undefined si es propia. */
export function clienteDeOT(ordenId: string): string | undefined {
  return recibidasCache?.porOrden.get(ordenId);
}

export type OrigenOT = "propia" | "recibida" | "enviada";

/** De dónde viene la OT para el filtro "Origen" de la bandeja. */
export function origenDeOT(ordenId: string): OrigenOT {
  if (recibidasCache?.porOrden.has(ordenId)) return "recibida";
  if (recibidasCache?.enviadas.has(ordenId)) return "enviada";
  return "propia";
}

/** Hay envíos en alguna dirección: el filtro "Origen" solo se ofrece entonces. */
export function hayEnvios(): boolean {
  return Boolean(recibidasCache && (recibidasCache.porOrden.size || recibidasCache.enviadas.size));
}
