import { createClient } from "@/lib/supabase";
import { ensureOtCategoria } from "@/lib/cuotas-client";
import type {
  OrdenTrabajo, OrdenListItem, ActividadOT, ActividadTipo,
  Estado, Prioridad, TipoTrabajo, ClasificacionOT, Recurrencia, RecurrenciaConfig, OTLink,
} from "@/types/ordenes";
import {
  notifyOTCreada,
  notifyOTEstadoCambiado,
} from "@/lib/notificar";

// ITOs (inspector milestones) is an Electrilam-exclusive feature — the ITO field
// is shown only for this workspace. Mirrors the mobile gate in constants/index.ts.
// ponytail: single-tenant gate, promote to a workspaces feature-flag column if a
// second workspace ever needs it.
export const ELECTRILAM_WORKSPACE_ID = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

// ── Desc-meta helpers ─────────────────────────────────────────────────────────

export interface DescMeta {
  nOT:            string | null;
  solicitante:    string | null;
  hito:           string | null;
  ubicacionTexto: string | null;
  lugar:          string | null;
  descripcion:    string | null;
}

export function parseDescMeta(raw: string | null): DescMeta {
  const empty: DescMeta = { nOT: null, solicitante: null, hito: null, ubicacionTexto: null, lugar: null, descripcion: null };
  if (!raw) return empty;
  const parts = raw.split("\n\n");
  const firstLine = parts[0];
  const rest = parts.slice(1).join("\n\n") || null;
  const hasMeta =
    firstLine.includes("N° OT: ") ||
    firstLine.includes("Solicitante: ") ||
    firstLine.includes("Hito: ") ||
    firstLine.includes("Ubicación: ") ||
    firstLine.includes("Lugar: ");
  if (!hasMeta) return { ...empty, descripcion: raw };
  const result: DescMeta = { ...empty, descripcion: rest };
  firstLine.split(" | ").forEach(seg => {
    if (seg.startsWith("N° OT: "))      result.nOT = seg.slice("N° OT: ".length);
    if (seg.startsWith("Solicitante: "))result.solicitante = seg.slice("Solicitante: ".length);
    if (seg.startsWith("Hito: "))       result.hito = seg.slice("Hito: ".length);
    if (seg.startsWith("Ubicación: "))  result.ubicacionTexto = seg.slice("Ubicación: ".length);
    if (seg.startsWith("Lugar: "))      result.lugar = seg.slice("Lugar: ".length);
  });
  return result;
}

export function buildDescripcion(opts: {
  nOT: string;
  solicitante: string;
  hito: string;
  body: string;
}): string {
  const segs: string[] = [];
  if (opts.nOT.trim())          segs.push(`N° OT: ${opts.nOT.trim()}`);
  if (opts.solicitante.trim())  segs.push(`Solicitante: ${opts.solicitante.trim()}`);
  if (opts.hito.trim())         segs.push(`Hito: ${opts.hito.trim()}`);
  const header = segs.join(" | ");
  const body = opts.body.trim();
  if (header && body) return `${header}\n\n${body}`;
  if (header) return header;
  return body;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProximaEjecucion(recurrencia: Recurrencia, fechaBase?: string | null, config?: RecurrenciaConfig | null): string | null {
  if (recurrencia === "ninguna") return null;
  const d = fechaBase ? new Date(`${fechaBase.slice(0, 10)}T12:00:00`) : new Date();
  const interval = Math.max(1, Number(config?.interval ?? 1));
  const weekdays = config?.weekdays ?? [];
  switch (recurrencia) {
    case "diaria":
      d.setDate(d.getDate() + 1);
      if (weekdays.length) while (!weekdays.includes(d.getDay())) d.setDate(d.getDate() + 1);
      else d.setDate(d.getDate() + interval - 1);
      break;
    case "semanal":
      if (weekdays.length) {
        const delta = (weekdays[0] - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + (delta === 0 ? interval * 7 : delta + (interval - 1) * 7));
      } else d.setDate(d.getDate() + interval * 7);
      break;
    case "quincenal": d.setDate(d.getDate() + 15); break;
    case "mensual":
    case "mensual_fecha":
    case "mensual_dia": {
      const day = Math.min(31, Math.max(1, Number(config?.day_of_month ?? config?.month_day ?? d.getDate())));
      d.setMonth(d.getMonth() + interval, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
      break;
    }
    case "anual":     d.setFullYear(d.getFullYear() + interval); break;
    case "personalizada":
      if (config?.unit === "week") {
        if (weekdays.length) {
          const delta = (weekdays[0] - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + (delta === 0 ? interval * 7 : delta + (interval - 1) * 7));
        } else d.setDate(d.getDate() + interval * 7);
      } else if (config?.unit === "month") {
        const day = Math.min(31, Math.max(1, Number(config?.day_of_month ?? config?.month_day ?? d.getDate())));
        d.setDate(1); d.setMonth(d.getMonth() + interval);
        d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      } else if (config?.unit === "year") d.setFullYear(d.getFullYear() + interval);
      else d.setDate(d.getDate() + interval);
      break;
  }
  return d.toISOString();
}

// ── Select fragments ──────────────────────────────────────────────────────────

export const ORDEN_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, clasificacion,
  fecha_inicio, fecha_termino, created_at, updated_at,
  creado_por, asignados_ids, workspace_id,
  n_serie, solicitante, solicitante_telefono, solicitante_email, hito, presupuesto,
  numero, categoria_id, categoria_ids, ubicacion_id, activo_id, lugar_id, sociedad_id,
  iniciado_at, pausado_at, en_ejecucion, tiempo_total_segundos,
  recurrencia, recurrencia_config, proxima_ejecucion, recurrencia_origen_id, recurrencia_iteracion, parent_id,
  requiere_materiales, requiere_hoja, requiere_fotos,
  imagen_url, fotos_urls, links,
  activos (id, nombre),
  ubicaciones (id, edificio, detalle, sociedad_id, sociedades(nombre)),
  lugar:lugares!lugar_id(id, nombre, imagen_url),
  sociedad:sociedades!sociedad_id(id, nombre, imagen_url),
  categorias_ot (id, nombre, icono, color),
  creador:usuarios!creado_por (id, nombre)
`;

export const LIST_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, clasificacion,
  fecha_inicio, fecha_termino, recurrencia, recurrencia_config, proxima_ejecucion,
  recurrencia_origen_id, recurrencia_iteracion, created_at, updated_at,
  n_serie, solicitante, hito,
  categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids,
  numero, parent_id,
  iniciado_at, en_ejecucion, tiempo_total_segundos,
  categorias_ot (nombre, icono, color),
  ubicaciones (edificio, detalle),
  activos (nombre)
`;

// ── Fetch ─────────────────────────────────────────────────────────────────────

export const ORDENES_PAGE_SIZE = 300;

export async function fetchOrdenesPage(wsId: string, beforeCreatedAt?: string | null): Promise<OrdenListItem[]> {
  const sb = createClient();
  let query = sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("workspace_id", wsId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(ORDENES_PAGE_SIZE);

  if (beforeCreatedAt) query = query.lt("created_at", beforeCreatedAt);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as OrdenListItem[];
}

// Max rows a text search returns. A query matching more than this is too broad;
// the UI nudges the user to refine rather than paginating search results.
export const ORDENES_SEARCH_LIMIT = 300;

// Server-side text search across the workspace's parent OTs — so search finds
// any matching OT regardless of what the infinite-scroll list has loaded.
// Matches titulo, descripcion (which embeds "N° OT:"/"Solicitante:" meta), and
// the solicitante column — the same fields the old in-memory search covered.
export async function searchOrdenes(wsId: string, rawQuery: string): Promise<OrdenListItem[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  // Escape PostgREST `or`/`ilike` metacharacters so a literal %, _, comma, or
  // parenthesis in the query can't break the filter syntax or inject terms.
  const safe = q.replace(/[\\%_,()]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("workspace_id", wsId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .or(`titulo.ilike.${pattern},descripcion.ilike.${pattern},solicitante.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(ORDENES_SEARCH_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as OrdenListItem[];
}

export async function fetchOrdenes(wsId: string): Promise<OrdenListItem[]> {
  return fetchOrdenesPage(wsId);
}

// Fetches EVERY parent OT for the workspace by paging through with the same
// keyset (created_at) the bandeja uses. Exports must serialize the full server
// set — not the in-memory paginated list — or they silently drop orders the
// user never scrolled far enough to load (e.g. older completadas).
export async function fetchAllOrdenesForExport(wsId: string): Promise<OrdenListItem[]> {
  const all: OrdenListItem[] = [];
  const seen = new Set<string>();
  let before: string | null = null;
  // Hard ceiling so a bad cursor can never loop forever.
  for (let page = 0; page < 100; page++) {
    const rows: OrdenListItem[] = await fetchOrdenesPage(wsId, before);
    for (const r of rows) {
      if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
    }
    if (rows.length < ORDENES_PAGE_SIZE) break; // last page
    before = rows[rows.length - 1]?.created_at ?? null;
    if (!before) break;
  }
  return all;
}

// Fetches a SINGLE OT in the list-row shape (LIST_SELECT, joins intact). Used
// when a realtime UPDATE arrives: the raw payload.new only carries the OT's own
// columns, so blind-merging it would wipe the joined relations (categorias_ot,
// ubicaciones, activos) and could flip a filtered field with a stale shape.
// Refetching keeps the row correct so it stays / leaves the filter accurately.
export async function fetchOrdenListItem(id: string): Promise<OrdenListItem | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as OrdenListItem | null;
}

export async function fetchOrden(id: string): Promise<OrdenTrabajo | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(ORDEN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as OrdenTrabajo | null;
}

export async function fetchSubOrdenes(parentId: string): Promise<OrdenTrabajo[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(ORDEN_SELECT)
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OrdenTrabajo[];
}

export async function fetchActividad(ordenId: string): Promise<ActividadOT[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("actividad_ot")
    .select("id, orden_id, tipo, comentario, foto_url, audio_url, usuario_id, created_at, usuario:usuarios!usuario_id(id, nombre)")
    .eq("orden_id", ordenId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ActividadOT[];
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createOrden(payload: {
  workspaceId: string;
  creadoPor: string;
  titulo: string;
  descripcion?: string;
  n_serie?: string | null;
  solicitante?: string | null;
  solicitante_telefono?: string | null;
  solicitante_email?: string | null;
  hito?: string | null;
  presupuesto?: string | null;
  prioridad: Prioridad;
  tipo_trabajo: TipoTrabajo | "";
  clasificacion?: ClasificacionOT | null;
  categoria_id?: string | null;
  categoria_ids?: string[] | null;
  recurrencia?: Recurrencia;
  recurrencia_config?: RecurrenciaConfig | null;
  ubicacion_id?: string | null;
  lugar_id?: string | null;
  sociedad_id?: string | null;
  activo_id?: string | null;
  asignados_ids?: string[] | null;
  fecha_inicio?: string | null;
  fecha_termino?: string | null;
  links?: OTLink[];
}): Promise<OrdenTrabajo> {
  const sb = createClient();
  const recurrencia = payload.recurrencia ?? "ninguna";
  const recurrencia_config = recurrencia === "ninguna" ? null : (payload.recurrencia_config ?? null);
  const proxima_ejecucion = calcProximaEjecucion(recurrencia, payload.fecha_inicio, recurrencia_config);

  // Quota gate: count OTs that are preventivas or recurrentes ("repetitivas").
  const esRepetitiva = recurrencia !== "ninguna" || payload.tipo_trabajo === "preventiva";
  if (esRepetitiva) {
    await ensureOtCategoria("repetitivas", "OT repetitivas");
  }

  const { data: ws } = await sb
    .from("workspaces")
    .select("requiere_materiales_global, requiere_hoja_global, requiere_fotos_global, fotos_obligatorias_todas")
    .eq("id", payload.workspaceId)
    .maybeSingle();

  const { data, error } = await sb
    .from("ordenes_trabajo")
    .insert({
      workspace_id:       payload.workspaceId,
      creado_por:         payload.creadoPor,
      titulo:             payload.titulo,
      descripcion:        payload.descripcion ?? "",
      ...(payload.n_serie?.trim()      ? { n_serie:      payload.n_serie.trim()      } : {}),
      ...(payload.solicitante?.trim()  ? { solicitante:  payload.solicitante.trim()  } : {}),
      ...(payload.solicitante_telefono?.trim() ? { solicitante_telefono: payload.solicitante_telefono.trim() } : {}),
      ...(payload.solicitante_email?.trim()    ? { solicitante_email:    payload.solicitante_email.trim()    } : {}),
      ...(payload.hito?.trim()         ? { hito:         payload.hito.trim()         } : {}),
      ...(payload.presupuesto?.trim()  ? { presupuesto:  payload.presupuesto.trim()  } : {}),
      tipo:               "solicitud",
      tipo_trabajo:       payload.tipo_trabajo || "reactiva",
      clasificacion:      payload.clasificacion ?? (payload.tipo_trabajo === "levantamiento" ? "levantamiento" : "ejecucion"),
      estado:             "pendiente",
      prioridad:          payload.prioridad,
      recurrencia,
      recurrencia_config,
      proxima_ejecucion,
      recurrencia_iteracion: recurrencia !== "ninguna" ? 1 : null,
      estado_cobro:       "no_cobrable",
      requiere_materiales: ws?.requiere_materiales_global ?? false,
      requiere_hoja:       ws?.requiere_hoja_global ?? false,
      // fotos_obligatorias_todas is the workspace mandate; requiere_fotos_global
      // is a softer "default on". Either one seeds the new OT's flag — admins
      // can still override per-OT from the detail panel.
      requiere_fotos:      (ws?.fotos_obligatorias_todas ?? false) || (ws?.requiere_fotos_global ?? false),
      ...(payload.categoria_id  ? { categoria_id:  payload.categoria_id  } : {}),
      ...(payload.categoria_ids?.length ? { categoria_ids: payload.categoria_ids } : {}),
      ...(payload.ubicacion_id  ? { ubicacion_id:  payload.ubicacion_id  } : {}),
      ...(payload.lugar_id      ? { lugar_id:      payload.lugar_id      } : {}),
      ...(payload.sociedad_id   ? { sociedad_id:   payload.sociedad_id   } : {}),
      ...(payload.activo_id     ? { activo_id:     payload.activo_id     } : {}),
      ...(payload.asignados_ids?.length ? { asignados_ids: payload.asignados_ids } : {}),
      ...(payload.fecha_inicio  ? { fecha_inicio:  payload.fecha_inicio  } : {}),
      ...(payload.fecha_termino ? { fecha_termino: payload.fecha_termino } : {}),
      links: payload.links?.filter(l => l.url.trim()) ?? [],
    })
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;
  const orden = data as unknown as OrdenTrabajo;

  await insertActividad(orden.id, payload.creadoPor, "creado", payload.titulo);
  if (payload.asignados_ids?.length) {
    await insertActividad(orden.id, payload.creadoPor, "asignado", payload.asignados_ids.join(","));
  }

  notifyOTCreada({
    workspaceId: payload.workspaceId,
    ordenId: orden.id,
    titulo: orden.titulo ?? payload.titulo,
    urgente: payload.prioridad === "urgente",
  });

  return orden;
}

export async function createSubOrden(
  parentId: string,
  titulo: string,
  parent: OrdenTrabajo,
): Promise<OrdenTrabajo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .insert({
      workspace_id:  parent.workspace_id,
      creado_por:    parent.creado_por,
      titulo:        titulo.trim(),
      descripcion:   "",
      tipo:          "solicitud",
      tipo_trabajo:  parent.tipo_trabajo ?? "reactiva",
      estado:        "pendiente",
      prioridad:     parent.prioridad,
      recurrencia:   "ninguna",
      recurrencia_config: null,
      proxima_ejecucion: null,
      estado_cobro:  "no_cobrable",
      parent_id:     parentId,
      asignados_ids: parent.asignados_ids ?? [],
      ubicacion_id:  parent.ubicacion_id ?? null,
      lugar_id:      parent.lugar_id ?? null,
      sociedad_id:   parent.sociedad_id ?? null,
      fecha_inicio:  parent.fecha_inicio ?? null,
      fecha_termino: parent.fecha_termino ?? null,
      // Sub-OTs inherit the parent's requisitos so they behave consistently
      // (the close-gate, fotos warning, etc. all reuse these flags).
      requiere_materiales: parent.requiere_materiales ?? false,
      requiere_hoja:       parent.requiere_hoja ?? false,
      requiere_fotos:      parent.requiere_fotos ?? false,
    })
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;
  const sub = data as unknown as OrdenTrabajo;
  await insertActividad(sub.id, parent.creado_por ?? "", "creado", titulo);
  await inheritProcedimientosToSubOT(parentId, sub.id, parent.creado_por ?? null).catch(() => {
    // Inheritance is best-effort — failure to copy attachments shouldn't
    // block the sub-OT itself. Real failures surface on the procedimientos tab.
  });
  return sub;
}

// Copy attached procedures from a parent OT to a freshly-created sub-OT, but
// only those flagged `hereda_a_hijos = true` on the ot_procedimientos row.
// Idempotent: skips rows that already exist on the child (rare unless this
// runs after another inheritance pass).
async function inheritProcedimientosToSubOT(
  parentId: string,
  childId: string,
  userId: string | null,
): Promise<void> {
  const sb = createClient();
  const { data: parents, error: parentErr } = await sb
    .from("ot_procedimientos")
    .select("procedimiento_id")
    .eq("orden_id", parentId)
    .eq("hereda_a_hijos", true);
  if (parentErr) throw parentErr;
  if (!parents || parents.length === 0) return;

  const { data: existing, error: exErr } = await sb
    .from("ot_procedimientos")
    .select("procedimiento_id")
    .eq("orden_id", childId);
  if (exErr) throw exErr;
  const have = new Set((existing ?? []).map(r => r.procedimiento_id));

  const inserts = parents
    .filter(p => !have.has(p.procedimiento_id))
    .map(p => ({
      orden_id: childId,
      procedimiento_id: p.procedimiento_id,
      adjuntado_por: userId,
      hereda_a_hijos: true, // Propagate the flag so grandchildren keep inheriting.
    }));
  if (inserts.length === 0) return;

  const { error: insErr } = await sb.from("ot_procedimientos").insert(inserts);
  if (insErr) throw insErr;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateOrden(
  id: string,
  userId: string,
  payload: {
    titulo?: string;
    descripcion?: string;
    n_serie?: string | null;
    solicitante?: string | null;
    solicitante_telefono?: string | null;
    solicitante_email?: string | null;
    hito?: string | null;
    presupuesto?: string | null;
    prioridad?: Prioridad;
    tipo_trabajo?: TipoTrabajo | null;
    clasificacion?: ClasificacionOT | null;
    categoria_id?: string | null;
    categoria_ids?: string[] | null;
    recurrencia?: Recurrencia;
    recurrencia_config?: RecurrenciaConfig | null;
    proxima_ejecucion?: string | null;
    fecha_inicio?: string | null;
    fecha_termino?: string | null;
    ubicacion_id?: string | null;
    lugar_id?: string | null;
    sociedad_id?: string | null;
    activo_id?: string | null;
    asignados_ids?: string[] | null;
    links?: OTLink[];
  },
  prevAsignadosIds?: string[] | null,
): Promise<OrdenTrabajo> {
  const sb = createClient();
  const patch = { ...payload };
  if (patch.recurrencia !== undefined) {
    patch.recurrencia_config = patch.recurrencia === "ninguna" ? null : (patch.recurrencia_config ?? null);
    patch.proxima_ejecucion = calcProximaEjecucion(patch.recurrencia, patch.fecha_inicio, patch.recurrencia_config);
  }
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .update(patch)
    .eq("id", id)
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;

  if (payload.prioridad !== undefined) {
    const PRIORIDAD_LABELS: Record<Prioridad, string> = {
      ninguna: "Sin prioridad", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
    };
    await insertActividad(id, userId, "prioridad_cambiada", PRIORIDAD_LABELS[payload.prioridad]);
  }
  if (payload.ubicacion_id !== undefined || payload.lugar_id !== undefined) {
    await insertActividad(id, userId, "ubicacion_cambiada");
  }
  if (payload.asignados_ids !== undefined) {
    const prev = new Set(prevAsignadosIds ?? []);
    const next = new Set(payload.asignados_ids ?? []);
    const added = [...next].filter((uid) => !prev.has(uid));
    if (added.length > 0) {
      await insertActividad(id, userId, "asignado", added.join(","));
    }
  }
  if (payload.titulo !== undefined || payload.descripcion !== undefined || payload.tipo_trabajo !== undefined) {
    await insertActividad(id, userId, "editado");
  }
  return data as unknown as OrdenTrabajo;
}

export async function updateOrdenEstado(
  id: string,
  estado: Estado,
  userId: string,
  ordenCtx?: { titulo: string; workspaceId: string; asignadosIds: string[] },
): Promise<void> {
  const ESTADO_LABELS: Record<Estado, string> = {
    pendiente:   "Abierta",
    en_espera:   "En espera",
    en_curso:    "En curso",
    completado:  "Completada",
  };
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").update({ estado }).eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "estado_cambiado", ESTADO_LABELS[estado]);

  if (ordenCtx) {
    notifyOTEstadoCambiado({
      asignadosIds: ordenCtx.asignadosIds,
      workspaceId: ordenCtx.workspaceId,
      ordenId: id,
      titulo: ordenCtx.titulo,
      estado,
      changedByUserId: userId,
    });
  }
}

export async function updateOrdenPrioridad(id: string, prioridad: Prioridad, userId: string): Promise<void> {
  const PRIORIDAD_LABELS: Record<Prioridad, string> = {
    ninguna: "Sin prioridad",
    baja:    "Baja",
    media:   "Media",
    alta:    "Alta",
    urgente: "Urgente",
  };
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").update({ prioridad }).eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "prioridad_cambiada", PRIORIDAD_LABELS[prioridad]);
}

// ── Timer operations ──────────────────────────────────────────────────────────

export async function iniciarOrden(id: string, userId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ en_ejecucion: true, iniciado_at: new Date().toISOString(), estado: "en_curso" })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "iniciado");
}

export async function pausarOrden(
  id: string,
  userId: string,
  comentario: string,
  segundosAcumulados: number,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion:          false,
      pausado_at:            new Date().toISOString(),
      tiempo_total_segundos: segundosAcumulados,
      estado:                "en_espera",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "pausado", comentario || undefined);
}

export async function reanudarOrden(id: string, userId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion: true,
      pausado_at:   null,
      iniciado_at:  new Date().toISOString(),
      estado:       "en_curso",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "reanudado");
}

export async function completarOrden(
  id: string,
  userId: string,
  comentario: string | undefined,
  segundosAcumulados: number,
  ordenCtx?: { titulo: string; workspaceId: string; asignadosIds: string[] },
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion:          false,
      fecha_termino:         new Date().toISOString(),
      tiempo_total_segundos: segundosAcumulados,
      estado:                "completado",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "completado", comentario);

  if (ordenCtx) {
    notifyOTEstadoCambiado({
      asignadosIds: ordenCtx.asignadosIds,
      workspaceId: ordenCtx.workspaceId,
      ordenId: id,
      titulo: ordenCtx.titulo,
      estado: "completado",
      changedByUserId: userId,
    });
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Soft-delete: send the OT to the trash (papelera). Row + photos are kept so it
// can be restored. A 30-day cron permanently purges old trash.
export async function deleteOrden(id: string): Promise<void> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  if (error) throw error;
}

// Restore an OT from the trash back into the active lists.
export async function restoreOrden(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id);
  if (error) throw error;
}

// ── Marcar como leída/vista (per-user marker) ────────────────────────────────
// Row exists in ordenes_marcadas => marked for the current user. RLS scopes
// every query to auth.uid(), so we never pass user_id on reads.

// Returns the set of OT ids the current user has marked. One query for the whole
// workspace list — the caller intersects with what it's showing.
export async function fetchMarcadasIds(): Promise<Set<string>> {
  const sb = createClient();
  const { data, error } = await sb.from("ordenes_marcadas").select("orden_id");
  if (error) throw error;
  return new Set((data ?? []).map(r => r.orden_id as string));
}

// Toggle the current user's marker for one OT. Returns the new state (true = marked).
export async function toggleMarcada(ordenId: string, marcada: boolean): Promise<boolean> {
  const sb = createClient();
  if (marcada) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error("No autenticado");
    // upsert: idempotent if the row somehow already exists (double-tap).
    const { error } = await sb
      .from("ordenes_marcadas")
      .upsert({ orden_id: ordenId, user_id: user.id }, { onConflict: "orden_id,user_id" });
    if (error) throw error;
    return true;
  }
  const { error } = await sb.from("ordenes_marcadas").delete().eq("orden_id", ordenId);
  if (error) throw error;
  return false;
}

// Permanently delete an OT (hard delete). Owner/admin only at the RLS layer.
export async function purgeOrden(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").delete().eq("id", id);
  if (error) throw error;
}

// Trash list: OTs in the papelera, most-recently-deleted first.
export async function fetchTrashedOrdenes(wsId: string): Promise<OrdenListItem[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("workspace_id", wsId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as OrdenListItem[];
}

// ── Photos ────────────────────────────────────────────────────────────────────

// ── Storage upload ────────────────────────────────────────────────────────────

export async function uploadOrdenFoto(orderId: string, file: File): Promise<string> {
  const { uploadToR2 } = await import("@/lib/r2");
  return uploadToR2(file, `ordenes/${orderId}`);
}

export async function addOrdenFoto(orderId: string, url: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("ordenes_trabajo")
    .select("fotos_urls")
    .eq("id", orderId)
    .single();
  if (fetchError) throw fetchError;

  const current: string[] = (data as { fotos_urls: string[] | null }).fotos_urls ?? [];
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ fotos_urls: [...current, url] })
    .eq("id", orderId);
  if (error) throw error;
}

export async function removeOrdenFoto(orderId: string, url: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("ordenes_trabajo")
    .select("imagen_url, fotos_urls")
    .eq("id", orderId)
    .single();
  if (fetchError) throw fetchError;

  const row = data as { imagen_url: string | null; fotos_urls: string[] | null };

  if (row.imagen_url === url) {
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ imagen_url: null })
      .eq("id", orderId);
    if (error) throw error;
  } else {
    const updated = (row.fotos_urls ?? []).filter((u) => u !== url);
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ fotos_urls: updated })
      .eq("id", orderId);
    if (error) throw error;
  }

  const { deleteFromR2 } = await import("@/lib/r2");
  await deleteFromR2(url);
}

// ── Activity / Comments ───────────────────────────────────────────────────────

export async function addComentario(
  ordenId: string,
  userId: string,
  comentario: string,
  audioUrl?: string | null,
): Promise<void> {
  await insertActividad(ordenId, userId, "comentario", comentario, undefined, audioUrl);
}

export async function insertActividad(
  ordenId: string,
  userId: string,
  tipo: ActividadTipo,
  comentario?: string,
  fotoUrl?: string | null,
  audioUrl?: string | null,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("actividad_ot").insert({
    orden_id:   ordenId,
    usuario_id: userId,
    tipo,
    comentario: comentario ?? null,
    foto_url:   fotoUrl   ?? null,
    audio_url:  audioUrl  ?? null,
  });
  if (error) throw error;
}
