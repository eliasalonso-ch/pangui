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
  opciones, rol_firmante
`;

const PROCEDIMIENTO_SELECT = `
  id, workspace_id, nombre, descripcion, categoria, activo,
  bloquea_cierre_ot, created_by, created_at, updated_at,
  pasos:procedimiento_pasos(${PASO_SELECT})
`;

const LIST_SELECT = `
  id, nombre, descripcion, categoria, activo, bloquea_cierre_ot, created_at,
  pasos_count:procedimiento_pasos(count)
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
      bloquea_cierre_ot: form.bloquea_cierre_ot,
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
      bloquea_cierre_ot: form.bloquea_cierre_ot,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await upsertPasos(id, form.pasos);
  return getProcedimiento(id);
}

async function upsertPasos(procedimientoId: string, pasos: PasoFormItem[]) {
  const sb = createClient();
  // Delete existing and re-insert — simplest approach for ordered steps
  const { error: delErr } = await sb
    .from("procedimiento_pasos")
    .delete()
    .eq("procedimiento_id", procedimientoId);
  if (delErr) throw new Error(delErr.message);

  if (pasos.length === 0) return;

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
  }));

  const { error } = await sb.from("procedimiento_pasos").insert(rows);
  if (error) throw new Error(error.message);
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
        pasos_count:procedimiento_pasos(count),
        pasos:procedimiento_pasos(${PASO_SELECT})
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
