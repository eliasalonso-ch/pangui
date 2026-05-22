import { createClient } from "@/lib/supabase";
import type {
  Procedimiento,
  ProcedimientoListItem,
  ProcedimientoPaso,
  ProcedimientoEjecucion,
  PasoRespuesta,
  OTProcedimiento,
  ProcedimientoForm,
  PasoFormItem,
  EstadoEjecucion,
  RespPendiente,
} from "@/types/procedimientos";

const PASO_SELECT = `
  id, procedimiento_id, orden, tipo, titulo, descripcion,
  requerido, unidad, valor_min, valor_max, moneda, multilinea,
  opciones, rol_firmante,
  peso, condicion_paso_id, condicion_operador, condicion_valor,
  requiere_nota_si, requiere_foto_si,
  genera_correctiva, correctiva_plantilla,
  medidor_id, iso14224_taxonomia, sub_procedimiento_id, multimedia_url
`;

// Disambiguation: procedimiento_pasos has two FKs to procedimientos
// (procedimiento_id for "I belong to this proc" and sub_procedimiento_id for
// "I embed this proc as a child step"). PostgREST returns HTTP 300 if we
// don't pick which one to follow. Use the !fkname form everywhere we embed
// pasos under a procedimiento.
const PASOS_FK = "procedimiento_pasos!procedimiento_pasos_procedimiento_id_fkey";

const PROCEDIMIENTO_SELECT = `
  id, workspace_id, nombre, descripcion, categoria, activo,
  bloquea_cierre_ot, auto_adjuntar, created_by, created_at, updated_at,
  version, iso_categoria, puntaje_minimo, puntaje_maximo, hereda_a_hijos,
  pasos:${PASOS_FK}(${PASO_SELECT})
`;

const LIST_SELECT = `
  id, nombre, descripcion, categoria, activo, bloquea_cierre_ot, auto_adjuntar, created_at,
  version, iso_categoria, hereda_a_hijos,
  pasos_count:${PASOS_FK}(count)
`;

// ── Library ───────────────────────────────────────────────────────────────────

export async function listProcedimientos(workspaceId: string): Promise<ProcedimientoListItem[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("procedimientos")
    .select(LIST_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => ({
    ...p,
    pasos_count: p.pasos_count?.[0]?.count ?? 0,
  }));
}

export async function getProcedimiento(id: string): Promise<Procedimiento> {
  const sb = createClient();
  const { data, error } = await sb
    .from("procedimientos")
    .select(PROCEDIMIENTO_SELECT)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const proc = data as any;
  return {
    ...proc,
    pasos: (proc.pasos ?? []).sort((a: ProcedimientoPaso, b: ProcedimientoPaso) => a.orden - b.orden),
  };
}

export async function createProcedimiento(
  workspaceId: string,
  userId: string,
  form: ProcedimientoForm,
): Promise<Procedimiento> {
  const sb = createClient();
  const { data: proc, error } = await sb
    .from("procedimientos")
    .insert({
      workspace_id: workspaceId,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria.trim() || null,
      iso_categoria: form.iso_categoria?.trim() || null,
      bloquea_cierre_ot: form.bloquea_cierre_ot,
      auto_adjuntar: form.auto_adjuntar,
      hereda_a_hijos: form.hereda_a_hijos ?? false,
      puntaje_minimo: form.puntaje_minimo ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await upsertPasos(proc.id, form.pasos);
  return getProcedimiento(proc.id);
}

export async function updateProcedimiento(
  id: string,
  form: ProcedimientoForm,
): Promise<Procedimiento> {
  const sb = createClient();
  const { error } = await sb
    .from("procedimientos")
    .update({
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria.trim() || null,
      iso_categoria: form.iso_categoria?.trim() || null,
      bloquea_cierre_ot: form.bloquea_cierre_ot,
      auto_adjuntar: form.auto_adjuntar,
      hereda_a_hijos: form.hereda_a_hijos ?? false,
      puntaje_minimo: form.puntaje_minimo ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await upsertPasos(id, form.pasos);
  return getProcedimiento(id);
}

async function upsertPasos(procedimientoId: string, pasos: PasoFormItem[]) {
  const sb = createClient();
  // Delete-and-re-insert: simplest correctness story for ordered steps.
  // Trade-off: any FK refs (condicion_paso_id, sub_procedimiento_id) inside
  // the same procedure must be resolved AFTER insert via a second pass,
  // because old paso UUIDs are wiped and new UUIDs assigned.
  const { error: delErr } = await sb
    .from("procedimiento_pasos")
    .delete()
    .eq("procedimiento_id", procedimientoId);
  if (delErr) throw new Error(delErr.message);

  if (pasos.length === 0) return;

  // First pass: insert with condicion_paso_id = NULL; capture the new ids.
  const rows = pasos.map((p, i) => ({
    procedimiento_id: procedimientoId,
    orden: i + 1,
    tipo: p.tipo,
    titulo: p.titulo.trim(),
    descripcion: p.descripcion.trim() || null,
    requerido: p.requerido,
    unidad: p.unidad.trim() || null,
    valor_min: p.valor_min !== "" ? parseFloat(p.valor_min) : null,
    valor_max: p.valor_max !== "" ? parseFloat(p.valor_max) : null,
    moneda: p.moneda || "CLP",
    multilinea: p.multilinea,
    opciones: p.opciones.length > 0 ? p.opciones.filter(o => o.trim()) : null,
    rol_firmante: p.rol_firmante.trim() || null,
    // New ISO/MaintainX fields (all optional on the DB with defaults).
    peso: p.peso ?? 0,
    condicion_paso_id: null,        // resolved in pass 2
    condicion_operador: p.condicion_operador ?? null,
    condicion_valor: p.condicion_valor ?? null,
    requiere_nota_si: p.requiere_nota_si && p.requiere_nota_si.length > 0
      ? { on: p.requiere_nota_si }
      : null,
    requiere_foto_si: p.requiere_foto_si && p.requiere_foto_si.length > 0
      ? { on: p.requiere_foto_si }
      : null,
    genera_correctiva: p.genera_correctiva ?? false,
    correctiva_plantilla: p.correctiva_plantilla ?? null,
    medidor_id: p.medidor_id ?? null,
    iso14224_taxonomia: p.iso14224_taxonomia ?? null,
    sub_procedimiento_id: p.sub_procedimiento_id ?? null,
    multimedia_url: p.multimedia_url ?? null,
  }));

  const { data: inserted, error } = await sb
    .from("procedimiento_pasos")
    .insert(rows)
    .select("id, orden");
  if (error) throw new Error(error.message);

  // Pass 2: resolve intra-procedure FK references (condicion_paso_id) by
  // mapping draft tempIds → orden → new paso UUIDs.
  const tempIdByOrden = new Map<number, string>();
  pasos.forEach((p, i) => tempIdByOrden.set(i + 1, p.tempId));
  const idByTempId = new Map<string, string>();
  for (const row of inserted ?? []) {
    const tid = tempIdByOrden.get(row.orden);
    if (tid) idByTempId.set(tid, row.id);
  }

  const updates: { id: string; condicion_paso_id: string }[] = [];
  pasos.forEach((p) => {
    if (!p.condicion_tempid) return;
    const targetId = idByTempId.get(p.tempId);
    const refId = idByTempId.get(p.condicion_tempid);
    if (targetId && refId) updates.push({ id: targetId, condicion_paso_id: refId });
  });

  for (const u of updates) {
    const { error: upErr } = await sb
      .from("procedimiento_pasos")
      .update({ condicion_paso_id: u.condicion_paso_id })
      .eq("id", u.id);
    if (upErr) throw new Error(upErr.message);
  }
}

export async function archiveProcedimiento(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("procedimientos")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── OT attachment ─────────────────────────────────────────────────────────────

export async function getOTProcedimientos(ordenId: string): Promise<OTProcedimiento[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ot_procedimientos")
    .select(`
      id, orden_id, procedimiento_id, adjuntado_por, adjuntado_at,
      procedimiento:procedimientos(
        id, nombre, descripcion, bloquea_cierre_ot,
        version, iso_categoria, puntaje_minimo, hereda_a_hijos,
        pasos_count:${PASOS_FK}(count),
        pasos:${PASOS_FK}(${PASO_SELECT})
      )
    `)
    .eq("orden_id", ordenId)
    .order("adjuntado_at");
  if (error) throw new Error(error.message);

  const base = (data ?? []).map((row: any) => ({
    ...row,
    procedimiento: row.procedimiento
      ? {
          ...row.procedimiento,
          pasos_count: row.procedimiento.pasos_count?.[0]?.count ?? 0,
          pasos: (row.procedimiento.pasos ?? []).sort(
            (a: ProcedimientoPaso, b: ProcedimientoPaso) => a.orden - b.orden,
          ),
        }
      : null,
    ejecucion: null,
  }));

  // Fetch ejecuciones for this orden
  const procIds = base.map((r: OTProcedimiento) => r.procedimiento_id);
  if (procIds.length === 0) return base;

  const { data: ejecs, error: ejErr } = await sb
    .from("procedimiento_ejecuciones")
    .select(`
      id, procedimiento_id, orden_id, iniciado_por, completado_por,
      estado, iniciado_at, completado_at, created_at,
      respuestas:paso_respuestas(*)
    `)
    .eq("orden_id", ordenId)
    .in("procedimiento_id", procIds);
  if (ejErr) throw new Error(ejErr.message);

  const ejecByProc: Record<string, ProcedimientoEjecucion> = {};
  for (const e of ejecs ?? []) {
    ejecByProc[e.procedimiento_id] = e as ProcedimientoEjecucion;
  }

  return base.map((row: OTProcedimiento) => ({
    ...row,
    ejecucion: ejecByProc[row.procedimiento_id] ?? null,
  }));
}

export async function attachProcedimiento(
  ordenId: string,
  procedimientoId: string,
  userId: string,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("ot_procedimientos").insert({
    orden_id: ordenId,
    procedimiento_id: procedimientoId,
    adjuntado_por: userId,
  });
  if (error) throw new Error(error.message);
}

export async function detachProcedimiento(ordenId: string, procedimientoId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ot_procedimientos")
    .delete()
    .eq("orden_id", ordenId)
    .eq("procedimiento_id", procedimientoId);
  if (error) throw new Error(error.message);
}

// ── Execution ────────────────────────────────────────────────────────────────

export async function startEjecucion(
  procedimientoId: string,
  ordenId: string,
  userId: string,
): Promise<ProcedimientoEjecucion> {
  const sb = createClient();

  // Idempotent: return existing if already started
  const { data: existing } = await sb
    .from("procedimiento_ejecuciones")
    .select("id")
    .eq("procedimiento_id", procedimientoId)
    .eq("orden_id", ordenId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from("procedimiento_ejecuciones")
      .select("*, respuestas:paso_respuestas(*)")
      .eq("id", existing.id)
      .single();
    if (error) throw new Error(error.message);
    return data as ProcedimientoEjecucion;
  }

  const { data, error } = await sb
    .from("procedimiento_ejecuciones")
    .insert({
      procedimiento_id: procedimientoId,
      orden_id: ordenId,
      iniciado_por: userId,
      estado: "en_curso" as EstadoEjecucion,
      iniciado_at: new Date().toISOString(),
    })
    .select("*, respuestas:paso_respuestas(*)")
    .single();
  if (error) throw new Error(error.message);
  return data as ProcedimientoEjecucion;
}

export async function saveRespuesta(
  ejecucionId: string,
  pasoId: string,
  userId: string,
  payload: RespPendiente,
): Promise<PasoRespuesta> {
  const sb = createClient();
  const { data, error } = await sb
    .from("paso_respuestas")
    .upsert(
      {
        ejecucion_id: ejecucionId,
        paso_id: pasoId,
        respondido_por: userId,
        respondido_at: new Date().toISOString(),
        ...payload,
      },
      { onConflict: "ejecucion_id,paso_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PasoRespuesta;
}

export async function completeEjecucion(
  ejecucionId: string,
  userId: string,
): Promise<ProcedimientoEjecucion> {
  const sb = createClient();
  const { data, error } = await sb
    .from("procedimiento_ejecuciones")
    .update({
      estado: "completado" as EstadoEjecucion,
      completado_por: userId,
      completado_at: new Date().toISOString(),
    })
    .eq("id", ejecucionId)
    .select("*, respuestas:paso_respuestas(*)")
    .single();
  if (error) throw new Error(error.message);
  return data as ProcedimientoEjecucion;
}

// ── Corrective action trigger ────────────────────────────────────────────────
// Returns the new corrective sub-OT id, or null if no corrective was created
// (paso doesn't generate one, or the answer isn't a fail, or already triggered).
// Best-effort: the RPC is idempotent so it's safe to call multiple times.
export async function maybeTriggerCorrectiva(args: {
  respuestaId: string;
  paso: ProcedimientoPaso;
  answer: RespPendiente;
}): Promise<string | null> {
  if (!args.paso.genera_correctiva) return null;
  if (!isFailAnswer(args.paso, args.answer)) return null;
  const sb = createClient();
  const { data, error } = await sb.rpc("crear_correctiva_desde_paso", { p_respuesta_id: args.respuestaId });
  if (error) {
    // Surface but don't throw — the user already saved the respuesta.
    console.warn("crear_correctiva_desde_paso failed:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

// "Fail" semantics per type:
//   - si_no_na: valor_texto = "no"
//   - inspeccion: any item.result = "fail"
//   - opcion_multiple: valor_texto matches a configured fail option (we treat
//     "fail" / "no" / "poor" / "replace" / "reemplazar" as conventional names)
//   - numero / medidor: outside valor_min..valor_max range
// Keep this conservative — only the obvious cases trigger.
function isFailAnswer(paso: ProcedimientoPaso, a: RespPendiente): boolean {
  const FAIL_TOKENS = new Set(["fail", "no", "poor", "replace", "reemplazar", "malo", "deficiente"]);
  switch (paso.tipo) {
    case "si_no_na":
      return (a.valor_texto ?? "").toLowerCase() === "no";
    case "opcion_multiple":
      return FAIL_TOKENS.has((a.valor_texto ?? "").toLowerCase());
    case "inspeccion": {
      const items = (a.valor_json as { items?: { result?: string }[] } | null)?.items ?? [];
      return items.some(i => (i.result ?? "").toLowerCase() === "fail");
    }
    case "numero":
    case "medidor": {
      const v = a.valor_medido;
      if (v == null) return false;
      const min = paso.valor_min, max = paso.valor_max;
      return (min != null && v < min) || (max != null && v > max);
    }
    default:
      return false;
  }
}
