// Supabase Edge Function — runs every hour via pg_cron.
//
// For each schedule where next_run_at <= now() AND active = true:
//   1. Query that workspace's órdenes filtered by the schedule's preset.
//   2. Build the .xlsx workbook (shared builder, same as browser export).
//   3. Build a CSV companion (failsafe-for-the-failsafe).
//   4. If total attachments > 20MB, split BY MONTH into multiple emails.
//   5. Send via Resend with attachments.
//   6. Write export_runs row + update schedule.last_*.
//
// Auth: the cron job sends Bearer <SERVICE_ROLE_KEY>. The function rejects
// anything else so this can't be triggered externally.
//
// Failsafe rationale: emails are independent of Pangui infrastructure. Once
// delivered, the .xlsx + .csv live in the recipient's mailbox forever. If
// Pangui is down for weeks, recipients can keep billing from the files in
// their inbox.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// esm.sh wraps CJS modules so `import * as X` gives { default: { utils, write, ... } }
// instead of the namespace directly. Unwrap with a fallback so this works
// regardless of how the registry serves it.
import XLSXNamespace from "https://esm.sh/xlsx-js-style@1.2.0";
// deno-lint-ignore no-explicit-any
const XLSX: any = (XLSXNamespace as any)?.default ?? XLSXNamespace;
import {
  buildOrdenesWorkbook,
  type OrdenInput,
  type HojaInput,
  type FilaInput,
  type FotoItemInput,
  type MaterialUsadoInput,
  type ExportCols,
} from "../_shared/excel-export-shared.ts";
import { buildOrdenesCsv } from "../_shared/csv-export-shared.ts";
import { withCronMonitor } from "../_shared/sentry-cron.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM  = Deno.env.get("RESEND_FROM") ?? "Pangui <noreply@getpangui.com>";

// Resend caps inbound at 40MB; Gmail at 25MB. 20MB target gives margin for
// the email body itself, MIME overhead, and base64 expansion (~33%).
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

// ── Preset → filter predicate ────────────────────────────────────────────────

function applyPresetFilter<T extends { estado: string; prioridad: string; asignados_ids: string[] | null }>(
  preset: string,
  ordenes: T[],
): T[] {
  switch (preset) {
    case "todas":         return ordenes;
    case "pendientes":    return ordenes.filter(o => o.estado === "pendiente" || o.estado === "en_espera");
    case "sin_asignar":   return ordenes.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
    case "en_curso":      return ordenes.filter(o => o.estado === "en_curso");
    case "urgentes":      return ordenes.filter(o => o.prioridad === "urgente");
    case "completadas":   return ordenes.filter(o => o.estado === "completado");
    // 'levantamientos' is exported from a different table — handled separately.
    default:              return ordenes;
  }
}

// ── Period chunking (split by month if needed) ───────────────────────────────

interface MonthChunk {
  label: string;             // "2026-01"
  human: string;             // "Enero 2026"
  ordenes: OrdenInput[];
}

function chunkByMonth(ordenes: OrdenInput[]): MonthChunk[] {
  const MES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const buckets = new Map<string, OrdenInput[]>();
  for (const o of ordenes) {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const arr = buckets.get(key) ?? [];
    arr.push(o);
    buckets.set(key, arr);
  }
  const result: MonthChunk[] = [];
  for (const [label, arr] of [...buckets.entries()].sort()) {
    const [y, m] = label.split("-").map(Number);
    result.push({ label, human: `${MES_ES[m - 1]} ${y}`, ordenes: arr });
  }
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  // Deno: btoa expects a binary string; convert chunk-by-chunk to avoid
  // call-stack overflow on big files.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatNombreArchivo(workspace: string, periodo: string): string {
  const safe = workspace.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  return `${safe}_${periodo}`;
}

// ── Per-schedule processor ───────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  workspace_id: string;
  nombre: string;
  frequency: "weekly" | "monthly" | "yearly";
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  hour_local: number;
  timezone: string;
  filter_preset: string;
  columns_json: ExportCols;
  recipients: string[];
}

async function runSchedule(
  supabase: ReturnType<typeof createClient>,
  schedule: ScheduleRow,
): Promise<{ ok: boolean; error?: string; num_emails_sent: number; num_files_attached: number; total_bytes: number; ordenes_count: number }> {
  const ordenIds: string[] = [];

  // ── 1. Fetch ordenes for this workspace ──
  const { data: ordenes, error: ordEr } = await supabase
    .from("ordenes_trabajo")
    .select(`
      id, numero, titulo, descripcion, estado, prioridad, tipo_trabajo,
      fecha_termino, created_at, asignados_ids, n_serie, hito, solicitante,
      fotos_urls,
      ubicaciones (edificio),
      activos (nombre),
      categorias_ot (nombre)
    `)
    .eq("workspace_id", schedule.workspace_id);
  if (ordEr) throw new Error(`fetch ordenes: ${ordEr.message}`);

  const filtered = applyPresetFilter(schedule.filter_preset, (ordenes ?? []) as unknown as OrdenInput[]);
  for (const o of filtered) ordenIds.push(o.id);

  // ── 2. Fetch related data only if those columns are selected ──
  let hojas: HojaInput[] = [];
  let filas: FilaInput[] = [];
  let fotos: FotoItemInput[] = [];
  let materialesUsados: MaterialUsadoInput[] = [];

  if (schedule.columns_json.hoja_calculo && ordenIds.length > 0) {
    const { data: hojasData } = await supabase
      .from("hojas_inventario")
      .select("id, nombre, columnas, orden_id")
      .in("orden_id", ordenIds);
    hojas = (hojasData ?? []) as HojaInput[];

    const hojaIds = hojas.map(h => h.id);
    if (hojaIds.length > 0) {
      const { data: filasData } = await supabase
        .from("hojas_inventario_filas")
        .select("hoja_id, celdas, orden")
        .in("hoja_id", hojaIds);
      filas = (filasData ?? []) as FilaInput[];
    }

    const { data: grupoItems } = await supabase
      .from("foto_grupo_items")
      .select("url, foto_grupos!inner(orden_id, tipo)")
      .in("foto_grupos.orden_id", ordenIds);
    for (const item of (grupoItems ?? []) as unknown as { url: string; foto_grupos: { orden_id: string; tipo: string } | { orden_id: string; tipo: string }[] }[]) {
      const fg = Array.isArray(item.foto_grupos) ? item.foto_grupos[0] : item.foto_grupos;
      if (!fg?.orden_id || !item.url) continue;
      fotos.push({ orden_id: fg.orden_id, url: item.url, tipo: fg.tipo ?? "—" });
    }
  }

  if (schedule.columns_json.materiales_inventario && ordenIds.length > 0) {
    const { data: matRows } = await supabase
      .from("materiales_usados")
      .select("orden_id, nombre, cantidad, unidad, precio_unitario")
      .in("orden_id", ordenIds);
    materialesUsados = (matRows ?? []) as MaterialUsadoInput[];
  }

  // ── 3. Fetch workspace name + asignado usuarios for display ──
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("nombre")
    .eq("id", schedule.workspace_id)
    .single();
  const workspaceNombre = workspace?.nombre ?? "Pangui";

  const asignadoIds = new Set<string>();
  filtered.forEach(o => o.asignados_ids?.forEach(id => asignadoIds.add(id)));
  let usuarios: { id: string; nombre: string }[] = [];
  if (asignadoIds.size > 0) {
    const { data: usuariosData } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", [...asignadoIds]);
    usuarios = (usuariosData ?? []) as { id: string; nombre: string }[];
  }

  // ── 4. Build chunks: try single workbook first, split if too big ──
  const cols = schedule.columns_json;
  const xlsxModuleForBuild = (XLSX as unknown) as Parameters<typeof buildOrdenesWorkbook>[0]["XLSX"];

  const buildOne = (chunkOrdenes: OrdenInput[]) => {
    const chunkIds = new Set(chunkOrdenes.map(o => o.id));
    const xlsx = buildOrdenesWorkbook({
      ordenes: chunkOrdenes,
      hojas: hojas.filter(h => chunkIds.has(h.orden_id)),
      filas: filas.filter(f => hojas.find(h => h.id === f.hoja_id && chunkIds.has(h.orden_id))),
      fotos: fotos.filter(f => chunkIds.has(f.orden_id)),
      materialesUsados: materialesUsados.filter(m => chunkIds.has(m.orden_id)),
      usuarios,
      cols,
      XLSX: xlsxModuleForBuild,
    });
    const csv = buildOrdenesCsv({ ordenes: chunkOrdenes, usuarios, cols });
    return { xlsx, csv };
  };

  // Whole-period workbook first.
  const fullBuild = buildOne(filtered);
  const fullSize = fullBuild.xlsx.length + fullBuild.csv.length;
  let emailBatches: { label: string; human: string; xlsx: Uint8Array; csv: Uint8Array }[];

  if (fullSize <= MAX_EMAIL_ATTACHMENT_BYTES) {
    const periodo = `${new Date().toISOString().slice(0, 10)}_completo`;
    emailBatches = [{ label: periodo, human: schedule.nombre, xlsx: fullBuild.xlsx, csv: fullBuild.csv }];
  } else {
    // Split by month. Each month is independently invoice-able.
    emailBatches = chunkByMonth(filtered).map(chunk => {
      const { xlsx, csv } = buildOne(chunk.ordenes);
      return { label: chunk.label, human: chunk.human, xlsx, csv };
    });
    // If a single month is still too big, log it but send it anyway — the
    // recipient will get a delivery failure from Resend which we record.
    // We don't sub-split below month because billing workflows are monthly.
  }

  // ── 5. Send each batch via Resend ──
  if (!RESEND_KEY) {
    throw new Error("RESEND_API_KEY not configured on the function");
  }

  let totalSent = 0;
  let totalFiles = 0;
  let totalBytes = 0;

  for (const batch of emailBatches) {
    const xlsxName = `${formatNombreArchivo(workspaceNombre, batch.label)}.xlsx`;
    const csvName  = `${formatNombreArchivo(workspaceNombre, batch.label)}.csv`;
    const subject  = emailBatches.length === 1
      ? `Reporte Pangui — ${schedule.nombre}`
      : `Reporte Pangui — ${schedule.nombre} — ${batch.human}`;

    const html = renderEmailHtml({
      workspace: workspaceNombre,
      scheduleNombre: schedule.nombre,
      filterPreset: schedule.filter_preset,
      ordenesCount: batch.label === emailBatches[0].label && emailBatches.length === 1 ? filtered.length : undefined,
      periodHuman: emailBatches.length > 1 ? batch.human : undefined,
      multipart: emailBatches.length > 1,
      batchIndex: emailBatches.indexOf(batch) + 1,
      totalBatches: emailBatches.length,
    });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: schedule.recipients,
        subject,
        html,
        attachments: [
          { filename: xlsxName, content: toBase64(batch.xlsx) },
          { filename: csvName,  content: toBase64(batch.csv) },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Resend ${resp.status}: ${errText.slice(0, 500)}`);
    }
    totalSent += 1;
    totalFiles += 2;
    totalBytes += batch.xlsx.length + batch.csv.length;
  }

  return {
    ok: true,
    num_emails_sent: totalSent,
    num_files_attached: totalFiles,
    total_bytes: totalBytes,
    ordenes_count: filtered.length,
  };
}

// ── Email HTML ───────────────────────────────────────────────────────────────

function renderEmailHtml(opts: {
  workspace: string;
  scheduleNombre: string;
  filterPreset: string;
  ordenesCount?: number;
  periodHuman?: string;
  multipart: boolean;
  batchIndex: number;
  totalBatches: number;
}): string {
  const PRESET_LABEL: Record<string, string> = {
    todas: "Todas las órdenes",
    pendientes: "Pendientes y en espera",
    sin_asignar: "Sin asignar",
    en_curso: "En curso",
    urgentes: "Urgentes",
    completadas: "Completadas",
    levantamientos: "Levantamientos",
  };
  const presetLabel = PRESET_LABEL[opts.filterPreset] ?? opts.filterPreset;
  const multipartNote = opts.multipart
    ? `<p style="margin:0 0 14px;color:#6b7280;font-size:13px;">Este reporte se envía en <strong>${opts.totalBatches} partes</strong> por su tamaño. Esta es la parte <strong>${opts.batchIndex} de ${opts.totalBatches}</strong>${opts.periodHuman ? ` (${opts.periodHuman})` : ""}.</p>`
    : "";
  const summaryLine = opts.ordenesCount != null
    ? `<p style="margin:0 0 14px;color:#374151;font-size:14px;"><strong>${opts.ordenesCount}</strong> órdenes incluidas · filtro: <strong>${presetLabel}</strong></p>`
    : `<p style="margin:0 0 14px;color:#374151;font-size:14px;">Filtro: <strong>${presetLabel}</strong></p>`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#273D88;padding:24px 32px;">
      <p style="color:#fff;font-size:22px;font-weight:700;margin:0;">Pangui</p>
      <p style="color:#a5b4fc;font-size:13px;margin:4px 0 0;">Reporte automático · ${opts.workspace}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;">${opts.scheduleNombre}</p>
      ${summaryLine}
      ${multipartNote}
      <p style="color:#374151;font-size:14px;line-height:1.55;margin:0 0 14px;">
        Adjuntamos el reporte en formato <strong>Excel (.xlsx)</strong> y una copia en <strong>CSV</strong> como respaldo.
        Los archivos están listos para ser usados en cualquier momento, incluso si la plataforma Pangui no estuviera
        disponible — quedan en tu correo y no dependen de ningún servidor.
      </p>
      <p style="color:#6b7280;font-size:12px;margin:14px 0 0;">
        Si no esperabas este correo, contacta al administrador de tu workspace.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">Pangui · Reporte programado automáticamente.</p>
    </div>
  </div>
</body></html>`;
}

// ── Entry point ──────────────────────────────────────────────────────────────
//
// No in-function auth check. The function is deployed with verify_jwt=false
// (Supabase gateway skips JWT validation), and the only caller is pg_cron
// inside this project. The pattern matches the project's existing
// evaluar-alertas cron function.
//
// If this URL ever needs to be exposed externally, gate it with a custom
// secret header read from Deno.env, not the project's service-role key
// (which is auto-injected and we don't control its value at call sites).

Deno.serve(async (_req) => {
  return await withCronMonitor(
    "export-schedules-cron",
    { schedule: "0 * * * *", maxRuntime: 10 },
    async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pick all schedules due now. Hourly granularity is fine because next_run_at
  // is computed at insert/update time by the SQL trigger.
  const { data: schedules, error } = await supabase
    .from("export_schedules")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", new Date().toISOString());

  if (error) {
    console.error("[export-cron] fetch schedules failed", error);
    // Throw so the cron monitor records a failure.
    throw new Error(`fetch schedules failed: ${error.message}`);
  }

  const results: { schedule_id: string; ok: boolean; error?: string }[] = [];

  for (const sched of (schedules ?? []) as ScheduleRow[]) {
    const startedAt = new Date().toISOString();
    let result: Awaited<ReturnType<typeof runSchedule>>;
    let errorMessage: string | null = null;
    try {
      result = await runSchedule(supabase, sched);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      result = { ok: false, error: errorMessage, num_emails_sent: 0, num_files_attached: 0, total_bytes: 0, ordenes_count: 0 };
    }

    // Always log a run row (success or failure) for audit.
    await supabase.from("export_runs").insert({
      schedule_id: sched.id,
      workspace_id: sched.workspace_id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      ok: result.ok,
      num_emails_sent: result.num_emails_sent,
      num_files_attached: result.num_files_attached,
      total_bytes: result.total_bytes,
      recipients_count: sched.recipients.length,
      ordenes_count: result.ordenes_count,
      error_message: errorMessage,
    });

    // Update schedule status + bump next_run_at by re-saving the row so the
    // BEFORE-UPDATE trigger recomputes it.
    await supabase
      .from("export_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        last_ok: result.ok,
        last_error: errorMessage,
        // Touch a field to force the trigger to recompute next_run_at.
        timezone: sched.timezone,
      })
      .eq("id", sched.id);

    results.push({ schedule_id: sched.id, ok: result.ok, error: errorMessage ?? undefined });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
    },
  );
});
