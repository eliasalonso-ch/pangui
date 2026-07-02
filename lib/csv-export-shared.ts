// CSV companion for the .xlsx export.
//
// Plain-text, RFC-4180 compatible. Opens in anything: Excel, Google Sheets,
// Numbers, accounting software, text editors. The .xlsx is the primary
// artifact; this CSV is the failsafe-for-the-failsafe — if Excel itself
// ever fails to open the .xlsx, the CSV remains usable.
//
// Pure module: no fetch, no Supabase, no I/O. Same input shape as
// excel-export-shared so callers can build both from the same data.

import type { OrdenInput, UsuarioInput, ExportCols } from "./excel-export-shared";

// Single flat sheet — one row per OT. We deliberately do NOT include hojas /
// fotos / per-OT detail in the CSV: the format can't represent multi-tab
// data cleanly. The recipient gets the headline view here and falls back to
// opening the .xlsx for the drill-down.

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Sin asignar", en_espera: "En espera",
  en_curso: "En curso", completado: "Completado",
};
const PRIORIDAD_LABEL: Record<string, string> = {
  urgente: "Urgente", alta: "Alta", media: "Media", baja: "Baja", ninguna: "—",
};
const TIPO_LABEL: Record<string, string> = {
  reactiva: "Reactiva", preventiva: "Preventiva",
  emergencia: "Emergencia",
  presupuesto: "Presupuesto", levantamiento: "Levantamiento",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  // Date-only strings ("2026-07-02") parse as UTC midnight; rendering them in a
  // negative-offset TZ (Chile UTC-4) rolls back a day. Parse the Y-M-D as local.
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL");
}
// ponytail: no dedicated completed-at column exists; app convention is
// updated_at when estado === "completado" (see lib/ot-metrics.ts).
function fmtCompletadoDate(o: { estado: string; updated_at?: string | null }): string {
  return o.estado === "completado" ? fmtDate(o.updated_at) : "";
}

// Escape a field for RFC-4180 CSV: wrap in quotes if it contains comma,
// quote, or newline; double any internal quotes.
function csvField(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvField).join(",");
}

export interface BuildCsvOptions {
  ordenes: OrdenInput[];
  usuarios: UsuarioInput[];
  cols: ExportCols;
}

/**
 * Build a UTF-8 BOM-prefixed CSV. The BOM ensures Excel opens it with the
 * correct encoding on Windows without needing a manual "import" step.
 */
export function buildOrdenesCsv(opts: BuildCsvOptions): Uint8Array {
  const { ordenes, usuarios, cols } = opts;
  const usuariosById = new Map(usuarios.map(u => [u.id, u.nombre]));

  type ColRow = { key: keyof ExportCols & string; header: string; get: (o: OrdenInput) => string | number };
  const allCols: ColRow[] = [
    { key: "numero",       header: "ID",            get: o => o.numero ?? "" },
    { key: "n_serie",      header: "N° OT",         get: o => o.n_serie ?? "" },
    { key: "hito",         header: "ITO",           get: o => o.hito ?? "" },
    { key: "titulo",       header: "Título",        get: o => o.titulo ?? "" },
    { key: "estado",       header: "Estado",        get: o => ESTADO_LABEL[o.estado] ?? o.estado },
    { key: "fecha_limite",       header: "Fecha vencimiento",  get: o => fmtDate(o.fecha_termino) },
    { key: "fecha_completacion", header: "Fecha completación", get: o => fmtCompletadoDate(o) },
    { key: "creado",             header: "Creado",             get: o => fmtDate(o.created_at) },
    { key: "ubicacion",    header: "Ubicación",     get: o => o.ubicaciones?.edificio ?? "" },
    { key: "descripcion",  header: "Descripción",   get: o => (o.descripcion ?? "").replace(/\s+/g, " ").trim() },
    { key: "solicitante",  header: "Solicitante",   get: o => o.solicitante ?? "" },
    { key: "prioridad",    header: "Prioridad",     get: o => PRIORIDAD_LABEL[o.prioridad] ?? o.prioridad },
    { key: "tipo_trabajo", header: "Tipo",          get: o => o.tipo_trabajo ? (TIPO_LABEL[o.tipo_trabajo] ?? o.tipo_trabajo) : "" },
    { key: "categoria",    header: "Categoría",     get: o => o.categorias_ot?.nombre ?? "" },
    { key: "activo",       header: "Activo",        get: o => o.activos?.nombre ?? "" },
    { key: "asignados",    header: "Asignados",
      get: o => (o.asignados_ids ?? []).map(id => usuariosById.get(id) ?? id).join("; ") },
  ];

  const activeCols = allCols.filter(c => cols[c.key as keyof ExportCols]);
  if (activeCols.length === 0) {
    // Fallback: always include ID + title so the CSV is never empty.
    activeCols.push(
      { key: "numero", header: "ID", get: o => o.numero ?? "" },
      { key: "titulo", header: "Título", get: o => o.titulo ?? "" },
    );
  }

  const lines: string[] = [];
  lines.push(csvRow(activeCols.map(c => c.header)));
  for (const o of ordenes) {
    lines.push(csvRow(activeCols.map(c => c.get(o))));
  }

  // UTF-8 BOM + CRLF line endings — what Excel for Windows expects.
  const text = "﻿" + lines.join("\r\n") + "\r\n";
  return new TextEncoder().encode(text);
}
