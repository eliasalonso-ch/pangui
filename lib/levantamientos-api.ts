import { createClient } from "@/lib/supabase";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import type {
  Levantamiento,
  LevantamientoDetalle,
  LevantamientoSeccion,
  LevantamientoItem,
  LevantamientoFotoGrupo,
  LevantamientoFotoItem,
  LevantamientoActividad,
  EstadoLevantamiento,
  TipoItemLevantamiento,
  ActividadLevantamientoTipo,
} from "@/types/levantamientos";

// ── Select fragment ───────────────────────────────────────────────────────────

export const LEV_SELECT = `
  id, titulo, descripcion, numero, estado,
  sociedad_id, ubicacion_id, lugar,
  creado_por, asignado_a,
  resultado_notas, orden_id,
  created_at, updated_at, enviado_revision_at, revisado_at,
  ubicaciones(id, edificio, piso, sociedad_id, sociedades(nombre)),
  sociedad:sociedades!sociedad_id(id, nombre),
  creador:usuarios!creado_por(id, nombre),
  asignado:usuarios!asignado_a(id, nombre)
`;

// ── List ──────────────────────────────────────────────────────────────────────

export async function fetchLevantamientos(wsId: string): Promise<Levantamiento[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("levantamientos")
    .select(LEV_SELECT)
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as Levantamiento[];
}

// ── Single ────────────────────────────────────────────────────────────────────

export async function fetchLevantamiento(id: string): Promise<LevantamientoDetalle> {
  const sb = createClient();
  const [levRow, secciones, fotoGrupos, actividad] = await Promise.all([
    sb.from("levantamientos").select(LEV_SELECT).eq("id", id).single(),
    sb.from("levantamiento_secciones")
      .select("*, items:levantamiento_items(*)")
      .eq("levantamiento_id", id)
      .order("orden_display", { ascending: true }),
    sb.from("levantamiento_foto_grupos")
      .select("*, items:levantamiento_foto_items(*)")
      .eq("levantamiento_id", id)
      .order("orden_display", { ascending: true }),
    sb.from("levantamiento_actividad")
      .select("*, usuario:usuarios!usuario_id(id, nombre)")
      .eq("levantamiento_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (levRow.error) throw levRow.error;
  return {
    ...(levRow.data as unknown as Levantamiento),
    secciones: (secciones.data ?? []) as unknown as LevantamientoSeccion[],
    foto_grupos: (fotoGrupos.data ?? []) as unknown as LevantamientoFotoGrupo[],
    actividad: (actividad.data ?? []) as unknown as LevantamientoActividad[],
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createLevantamiento(payload: {
  workspaceId: string;
  creadoPor: string;
  titulo: string;
  descripcion?: string;
  ubicacionId?: string | null;
  sociedadId?: string | null;
  lugar?: string;
  asignadoA?: string | null;
}): Promise<Levantamiento> {
  const sb = createClient();
  const { data, error } = await sb
    .from("levantamientos")
    .insert({
      workspace_id: payload.workspaceId,
      creado_por: payload.creadoPor,
      titulo: payload.titulo.trim(),
      descripcion: payload.descripcion?.trim() ?? null,
      estado: "creado" as EstadoLevantamiento,
      ubicacion_id: payload.ubicacionId ?? null,
      sociedad_id: payload.sociedadId ?? null,
      lugar: payload.lugar?.trim() || null,
      asignado_a: payload.asignadoA ?? null,
    })
    .select(LEV_SELECT)
    .single();
  if (error) throw error;
  await insertActividad(sb, data.id, "creado", payload.creadoPor, null);
  return data as unknown as Levantamiento;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateLevantamiento(
  id: string,
  patch: Partial<Pick<Levantamiento, "titulo" | "descripcion" | "ubicacion_id" | "sociedad_id" | "lugar" | "asignado_a">>,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamientos").update(patch).eq("id", id);
  if (error) throw error;
}

// ── Estado transition ─────────────────────────────────────────────────────────

export async function setLevantamientoEstado(
  id: string,
  estado: EstadoLevantamiento,
  userId: string,
  comentario?: string | null,
): Promise<void> {
  const sb = createClient();
  const patch: Record<string, unknown> = { estado };
  if (estado === "en_revision") patch.enviado_revision_at = new Date().toISOString();
  if (estado === "aprobado" || estado === "no_viable" || estado === "requiere_info") {
    patch.revisado_at = new Date().toISOString();
    if (comentario) patch.resultado_notas = comentario;
  }
  const { error } = await sb.from("levantamientos").update(patch).eq("id", id);
  if (error) throw error;

  const tipoMap: Record<EstadoLevantamiento, ActividadLevantamientoTipo> = {
    creado:        "creado",
    en_terreno:    "estado_cambiado",
    en_revision:   "enviado_revision",
    aprobado:      "aprobado",
    no_viable:     "no_viable",
    requiere_info: "requiere_info",
  };
  await insertActividad(sb, id, tipoMap[estado], userId, comentario ?? null);
}

export async function linkOrdenToLevantamiento(id: string, ordenId: string, userId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamientos").update({ orden_id: ordenId, estado: "aprobado" as EstadoLevantamiento }).eq("id", id);
  if (error) throw error;
  await insertActividad(sb, id, "ot_creada", userId, null);
}

// ── Secciones ─────────────────────────────────────────────────────────────────

export async function createSeccion(levantamientoId: string, titulo: string, ordenDisplay: number): Promise<LevantamientoSeccion> {
  const sb = createClient();
  const { data, error } = await sb
    .from("levantamiento_secciones")
    .insert({ levantamiento_id: levantamientoId, titulo, orden_display: ordenDisplay })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as LevantamientoSeccion), items: [] };
}

export async function updateSeccion(id: string, titulo: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamiento_secciones").update({ titulo }).eq("id", id);
  if (error) throw error;
}

export async function deleteSeccion(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamiento_secciones").delete().eq("id", id);
  if (error) throw error;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function upsertItem(payload: {
  id?: string;
  seccionId: string;
  campo: string;
  tipo: TipoItemLevantamiento;
  valorTexto?: string | null;
  valorNumero?: number | null;
  valorBool?: boolean | null;
  unidad?: string | null;
  ordenDisplay: number;
}): Promise<LevantamientoItem> {
  const sb = createClient();
  const row = {
    seccion_id: payload.seccionId,
    campo: payload.campo,
    tipo: payload.tipo,
    valor_texto: payload.valorTexto ?? null,
    valor_numero: payload.valorNumero ?? null,
    valor_bool: payload.valorBool ?? null,
    unidad: payload.unidad ?? null,
    orden_display: payload.ordenDisplay,
  };
  if (payload.id) {
    const { data, error } = await sb.from("levantamiento_items").update(row).eq("id", payload.id).select().single();
    if (error) throw error;
    return data as LevantamientoItem;
  }
  const { data, error } = await sb.from("levantamiento_items").insert(row).select().single();
  if (error) throw error;
  return data as LevantamientoItem;
}

export async function deleteItem(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamiento_items").delete().eq("id", id);
  if (error) throw error;
}

// ── Foto groups ───────────────────────────────────────────────────────────────

export async function createFotoGrupo(
  levantamientoId: string,
  workspaceId: string,
  userId: string,
  titulo: string,
  descripcion: string,
  ordenDisplay: number,
): Promise<LevantamientoFotoGrupo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("levantamiento_foto_grupos")
    .insert({ levantamiento_id: levantamientoId, workspace_id: workspaceId, created_by: userId, titulo, descripcion, orden_display: ordenDisplay })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as LevantamientoFotoGrupo), items: [] };
}

export async function deleteFotoGrupo(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamiento_foto_grupos").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadFotoLevantamiento(levantamientoId: string, file: File): Promise<string> {
  return uploadToR2(file, `levantamientos/${levantamientoId}/fotos`);
}

export async function addFotoToGrupo(grupoId: string, url: string, ordenDisplay: number): Promise<LevantamientoFotoItem> {
  const sb = createClient();
  const { data, error } = await sb.from("levantamiento_foto_items").insert({ grupo_id: grupoId, url, orden_display: ordenDisplay }).select().single();
  if (error) throw error;
  return data as LevantamientoFotoItem;
}

export async function removeFotoFromGrupo(itemId: string, url?: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamiento_foto_items").delete().eq("id", itemId);
  if (error) throw error;
  if (url) await deleteFromR2(url).catch(() => {});
}

// ── Activity ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertActividad(sb: any, levantamientoId: string, tipo: ActividadLevantamientoTipo, userId: string | null, comentario: string | null): Promise<void> {
  await sb.from("levantamiento_actividad").insert({ levantamiento_id: levantamientoId, tipo, usuario_id: userId, comentario });
}

export async function addComentario(levantamientoId: string, userId: string, comentario: string): Promise<void> {
  const sb = createClient();
  await insertActividad(sb, levantamientoId, "comentario", userId, comentario);
}

export async function deleteLevantamiento(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("levantamientos").delete().eq("id", id);
  if (error) throw error;
}
