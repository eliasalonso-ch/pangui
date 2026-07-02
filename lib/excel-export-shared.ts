// Shared Excel export builder.
//
// MAINTAINER NOTE: this file is mirrored at
// supabase/functions/_shared/excel-export-shared.ts (Deno needs .ts import
// extensions, which break Next.js). When you change either copy, sync both.
//
// Builds the .xlsx workbook from a pure data shape. Runs in two environments:
//   - Browser  (OrdenesBandeja calls it, passes the dynamically-imported XLSX
//              from "xlsx-js-style").
//   - Deno     (the export-schedules-cron Edge Function calls it, passes its
//              own XLSX import from "https://esm.sh/xlsx-js-style").
//
// The caller is responsible for:
//   - Importing xlsx-js-style (different URL per environment).
//   - Querying Supabase for ordenes, hojas, filas, foto_grupo_items.
//   - Resolving usuario names for asignados.
//   - Deciding which columns to include (cols object).
//
// This module is data-only: it does NOT call fetch, Supabase, or any I/O.
// It does NOT touch the filesystem. It returns an ArrayBuffer (or Buffer in
// Node) ready to attach to an email or stream to the browser.
//
// IMPORTANT: do not add any imports here that aren't usable in Deno. Keep
// this file framework-agnostic. parseDescMeta is duplicated as a small local
// helper to avoid pulling in a browser-only utils.js module.

// ── Public input/output types ────────────────────────────────────────────────

export interface OrdenInput {
  id: string;
  numero: number | null;
  titulo: string | null;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  tipo_trabajo: string | null;
  fecha_termino: string | null;
  created_at: string;
  asignados_ids: string[] | null;
  n_serie?: string | null;
  hito?: string | null;
  solicitante?: string | null;
  ubicaciones?: { edificio: string | null } | null;
  activos?: { nombre: string | null } | null;
  categorias_ot?: { nombre: string | null } | null;
  fotos_urls?: string[] | null;
}

export interface HojaInput {
  id: string;
  orden_id: string;
  nombre: string;
  columnas: { id: string; label: string }[];
}

export interface FilaInput {
  hoja_id: string;
  celdas: Record<string, string>;
  orden: number;
}

export interface FotoItemInput {
  orden_id: string;
  url: string;
  tipo: string;
}

export interface UsuarioInput {
  id: string;
  nombre: string;
}

export type ExportColKey =
  | "numero" | "n_serie" | "hito" | "titulo" | "estado" | "prioridad" | "tipo_trabajo"
  | "descripcion" | "solicitante"
  | "categoria" | "ubicacion" | "activo" | "asignados" | "creado" | "fecha_limite" | "resumen"
  | "hoja_calculo" | "materiales_inventario";

export type ExportCols = Partial<Record<ExportColKey, boolean>>;

export interface MaterialUsadoInput {
  orden_id: string;
  nombre: string;
  cantidad: number;
  unidad: string | null;
  precio_unitario: number | null;
}

export interface BuildWorkbookOptions {
  ordenes: OrdenInput[];
  hojas?: HojaInput[];
  filas?: FilaInput[];
  fotos?: FotoItemInput[];
  materialesUsados?: MaterialUsadoInput[];
  usuarios: UsuarioInput[];
  cols: ExportCols;
  // The xlsx-js-style module is injected because its import path differs
  // between Node/Next.js and Deno.
  XLSX: XlsxModule;
}

// ── XLSX module surface we depend on ─────────────────────────────────────────

// We only reach into a small subset of xlsx-js-style; type the surface we use
// so we don't import the package's full types in Deno builds.
export interface XlsxModule {
  utils: {
    book_new: () => unknown;
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    aoa_to_sheet: (rows: (string | number)[][]) => Record<string, unknown>;
    sheet_add_aoa: (
      ws: Record<string, unknown>,
      rows: (string | number)[][],
      opts: { origin: number | string }
    ) => void;
    encode_cell: (addr: { r: number; c: number }) => string;
    decode_range: (s: string) => { s: { r: number; c: number }; e: { r: number; c: number } };
    encode_range: (r: { s: { r: number; c: number }; e: { r: number; c: number } }) => string;
  };
  write: (wb: unknown, opts: { bookType: "xlsx"; type: "array" | "buffer" }) => ArrayBuffer | Uint8Array;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Sin asignar",
  en_espera: "En espera",
  en_curso: "En curso",
  completado: "Completado",
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
  return s ? new Date(s).toLocaleDateString("es-CL") : "—";
}
function fmtDateTime(s: string | null | undefined): string {
  return s
    ? new Date(s).toLocaleString("es-CL", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";
}

// Lightweight descripcion parser — handles the "N° OT: X\nSolicitante: Y\n..."
// header format used elsewhere in the app. Duplicated here so this module
// doesn't depend on lib/utils.js (which assumes browser context).
interface DescMeta {
  nOT: string | null;
  solicitante: string | null;
  hito: string | null;
  descripcion: string | null;
}
function parseDescMeta(raw: string | null | undefined): DescMeta {
  const result: DescMeta = { nOT: null, solicitante: null, hito: null, descripcion: null };
  if (!raw) return result;
  const lines = raw.split(/\r?\n/);
  const bodyLines: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (inBody) { bodyLines.push(line); continue; }
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const value = m[2].trim();
      if (key.startsWith("n°") || key.startsWith("n ot") || key.startsWith("not")) result.nOT = value;
      else if (key === "solicitante") result.solicitante = value;
      else if (key === "hito") result.hito = value;
      else { inBody = true; bodyLines.push(line); }
    } else if (line.trim() === "") {
      // blank line ends the header
      inBody = true;
    } else {
      inBody = true;
      bodyLines.push(line);
    }
  }
  const body = bodyLines.join("\n").trim();
  if (body) result.descripcion = body;
  return result;
}

// ── Style tokens (shared between browser + Deno) ─────────────────────────────

const S = {
  headerDark: {
    font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    fill:  { fgColor: { rgb: "0F172A" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "1E3A8A" } } },
  },
  headerBrand: {
    font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    fill:  { fgColor: { rgb: "1E3A8A" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "2563EB" } } },
  },
  rowEven: {
    fill: { fgColor: { rgb: "F8FAFC" } },
    font: { sz: 10, color: { rgb: "0F172A" } },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
    alignment: { vertical: "center" },
  },
  rowOdd: {
    fill: { fgColor: { rgb: "FFFFFF" } },
    font: { sz: 10, color: { rgb: "0F172A" } },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
    alignment: { vertical: "center" },
  },
  rowMuted: (even: boolean) => ({
    fill: { fgColor: { rgb: even ? "F8FAFC" : "FFFFFF" } },
    font: { sz: 10, color: { rgb: "94A3B8" } },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
    alignment: { vertical: "center" },
  }),
  badge: (color: string, bg: string) => ({
    font:  { bold: true, sz: 10, color: { rgb: color } },
    fill:  { fgColor: { rgb: bg } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
  }),
  totalRow: {
    font:  { bold: true, sz: 10, color: { rgb: "1D4ED8" } },
    fill:  { fgColor: { rgb: "DBEAFE" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { top: { style: "medium", color: { rgb: "2563EB" } }, bottom: { style: "thin", color: { rgb: "BFDBFE" } } },
  },
  kpiHeader: {
    font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
    fill:  { fgColor: { rgb: "1E3A8A" } },
    alignment: { horizontal: "center", vertical: "center" },
  },
  kpiLabel: {
    font:  { bold: true, sz: 10, color: { rgb: "64748B" } },
    fill:  { fgColor: { rgb: "F1F5F9" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
  kpiValue: {
    font:  { sz: 10, color: { rgb: "0F172A" } },
    fill:  { fgColor: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
  },
  kpiValueBig: {
    font:  { bold: true, sz: 14, color: { rgb: "1E3A8A" } },
    fill:  { fgColor: { rgb: "EFF6FF" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "BFDBFE" } } },
  },
} as const;

const estadoColors: Record<string, { font: string; fill: string }> = {
  pendiente:  { font: "92400E", fill: "FFFBEB" },
  en_espera:  { font: "7C3AED", fill: "F5F3FF" },
  en_curso:   { font: "1D4ED8", fill: "EFF6FF" },
  completado: { font: "065F46", fill: "ECFDF5" },
};
const prioColors: Record<string, { font: string; fill: string }> = {
  urgente: { font: "B91C1C", fill: "FEE2E2" },
  alta:    { font: "B45309", fill: "FEF3C7" },
  media:   { font: "1D4ED8", fill: "DBEAFE" },
  baja:    { font: "475569", fill: "F1F5F9" },
  ninguna: { font: "94A3B8", fill: "F8FAFC" },
};

// ── Internal style helpers parameterized by XLSX module ──────────────────────

function makeStyleHelpers(XLSX: XlsxModule) {
  function applyStyle(ws: Record<string, unknown>, addr: string, style: Record<string, unknown>) {
    if (ws[addr] && typeof ws[addr] === "object") {
      (ws[addr] as Record<string, unknown>).s = style;
    }
  }
  function styleRow(ws: Record<string, unknown>, rowIdx: number, nCols: number, style: Record<string, unknown>) {
    for (let c = 0; c < nCols; c++) {
      applyStyle(ws, XLSX.utils.encode_cell({ r: rowIdx, c }), style);
    }
  }
  return { applyStyle, styleRow };
}

// ── Column definitions (mirrors what's in OrdenesBandeja UI) ─────────────────

interface ColDef {
  key: ExportColKey;
  header: string;
  width: number;
  getValue: (o: OrdenInput, meta: DescMeta, usuariosById: Map<string, string>) => string | number;
  estadoBadge?: boolean;
  prioBadge?: boolean;
  mutableIfEmpty?: (o: OrdenInput) => boolean;
}

const COL_DEFS: ColDef[] = [
  { key: "numero",       header: "ID",            width: 8,  getValue: o => o.numero ?? "—" },
  { key: "n_serie",      header: "N° OT",         width: 22, getValue: (o, m) => o.n_serie || m.nOT || "—" },
  { key: "hito",         header: "ITO",           width: 20, getValue: (o, m) => o.hito || m.hito || "—" },
  { key: "titulo",       header: "Título",        width: 40, getValue: o => o.titulo ?? "—" },
  { key: "estado",       header: "Estado",        width: 14, getValue: o => ESTADO_LABEL[o.estado] ?? o.estado, estadoBadge: true },
  { key: "fecha_limite", header: "Fecha término", width: 14, getValue: o => fmtDate(o.fecha_termino), mutableIfEmpty: o => !o.fecha_termino },
  { key: "ubicacion",    header: "Ubicación",     width: 34, getValue: o => o.ubicaciones?.edificio ?? "—" },
  { key: "descripcion",  header: "Descripción",   width: 52, getValue: (_o, m) => m.descripcion || "—" },
  { key: "solicitante",  header: "Solicitante",   width: 26, getValue: (o, m) => o.solicitante || m.solicitante || "—" },
  { key: "prioridad",    header: "Prioridad",     width: 12, getValue: o => PRIORIDAD_LABEL[o.prioridad] ?? o.prioridad, prioBadge: true },
  { key: "tipo_trabajo", header: "Tipo",          width: 14, getValue: o => o.tipo_trabajo ? (TIPO_LABEL[o.tipo_trabajo] ?? o.tipo_trabajo) : "—" },
  { key: "categoria",    header: "Categoría",     width: 20, getValue: o => o.categorias_ot?.nombre ?? "—" },
  { key: "activo",       header: "Activo",        width: 22, getValue: o => o.activos?.nombre ?? "—" },
  { key: "asignados",    header: "Asignados",     width: 30,
    getValue: (o, _m, u) => Array.isArray(o.asignados_ids) && o.asignados_ids.length > 0
      ? o.asignados_ids.map(id => u.get(id) ?? id).join(", ")
      : "Sin asignar",
    mutableIfEmpty: o => !o.asignados_ids?.length },
  { key: "creado",       header: "Creado",        width: 13, getValue: o => fmtDate(o.created_at) },
];

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Build a complete workbook from data. Returns the bytes — the caller decides
 * whether to write to a file (browser) or attach to an email (server).
 *
 * The shape mirrors the existing OrdenesBandeja behavior:
 *   - Sheet 1: "Órdenes de trabajo" — list with hyperlinked IDs.
 *   - Sheet 2: "Resumen" (KPIs)             — if cols.resumen.
 *   - Per-OT sheet ("OT-{numero}") — if cols.hoja_calculo AND that OT has hoja/fotos.
 *   - "Materiales" — if cols.materiales_inventario.
 */
export function buildOrdenesWorkbook(opts: BuildWorkbookOptions): Uint8Array {
  const { ordenes, hojas = [], filas = [], fotos = [], materialesUsados = [], usuarios, cols, XLSX } = opts;
  const { applyStyle, styleRow } = makeStyleHelpers(XLSX);

  // Pre-resolve names and metadata once.
  const usuariosById = new Map(usuarios.map(u => [u.id, u.nombre]));
  const metaMap = new Map(ordenes.map(o => [o.id, parseDescMeta(o.descripcion)]));
  const activeCols = COL_DEFS.filter(c => cols[c.key]);

  // Group hojas/filas/fotos by OT for fast lookup during per-OT sheet build.
  const otHojas = new Map<string, HojaInput[]>();
  for (const h of hojas) {
    const list = otHojas.get(h.orden_id) ?? [];
    list.push(h);
    otHojas.set(h.orden_id, list);
  }
  const filasByHojaId = new Map<string, FilaInput[]>();
  for (const f of filas) {
    const list = filasByHojaId.get(f.hoja_id) ?? [];
    list.push(f);
    filasByHojaId.set(f.hoja_id, list);
  }
  const otFotos = new Map<string, FotoItemInput[]>();
  for (const f of fotos) {
    const list = otFotos.get(f.orden_id) ?? [];
    list.push(f);
    otFotos.set(f.orden_id, list);
  }
  // Legacy fotos_urls.
  for (const ot of ordenes) {
    const legacy = ot.fotos_urls;
    if (!legacy?.length) continue;
    const list = otFotos.get(ot.id) ?? [];
    for (const url of legacy) list.push({ orden_id: ot.id, url, tipo: "legacy" });
    otFotos.set(ot.id, list);
  }

  // Reserve OT sheet names (Excel limit: 31 chars, no : \ / ? * [ ])
  const otSheetName = new Map<string, string>();
  if (cols.hoja_calculo) {
    const usedNames = new Set<string>(["Órdenes de trabajo", "Resumen", "Materiales"]);
    const sanitize = (s: string) => s.replace(/[:\\/?*\[\]]/g, "_").slice(0, 31);
    for (const ot of ordenes) {
      const hasHoja  = (otHojas.get(ot.id)?.length ?? 0) > 0;
      const hasFotos = (otFotos.get(ot.id)?.length ?? 0) > 0;
      if (!hasHoja && !hasFotos) continue;
      const base = sanitize(`OT-${ot.numero ?? ot.id.slice(0, 6)}`);
      let name = base;
      let n = 2;
      while (usedNames.has(name)) {
        const suffix = `-${n++}`;
        name = sanitize(base.slice(0, 31 - suffix.length) + suffix);
      }
      usedNames.add(name);
      otSheetName.set(ot.id, name);
    }
  }

  // ── Materiales sheet data prepared up-front (so we know matFirstRow per OT) ──
  let matSheetData: { matData: (string | number)[][]; matHeaders: string[] } | null = null;
  const matFirstRow = new Map<string, number>();
  if (cols.materiales_inventario && materialesUsados.length > 0) {
    const matHeaders = ["ID", "N° OT (SF)", "Material", "Cantidad", "Unidad", "Precio unitario", "Total"];
    const matData: (string | number)[][] = [matHeaders];
    for (const mat of materialesUsados) {
      const ot = ordenes.find(o => o.id === mat.orden_id);
      if (!ot) continue;
      const otNSerie = ot.n_serie ?? metaMap.get(ot.id)?.nOT ?? "—";
      if (!matFirstRow.has(mat.orden_id)) matFirstRow.set(mat.orden_id, matData.length);
      const total = mat.precio_unitario != null ? mat.cantidad * mat.precio_unitario : "";
      matData.push([ot.numero ?? "—", otNSerie, mat.nombre, mat.cantidad, mat.unidad ?? "—", mat.precio_unitario ?? "—", total]);
    }
    matSheetData = { matData, matHeaders };
  }

  const S_link = (even: boolean) => ({
    font: { bold: true, sz: 10, color: { rgb: "1D4ED8" }, underline: true },
    fill: { fgColor: { rgb: even ? "EFF6FF" : "DBEAFE" } },
    border: { bottom: { style: "thin", color: { rgb: "BFDBFE" } } },
    alignment: { vertical: "center" },
  });

  // ── SHEET 1: Órdenes de trabajo ──────────────────────────────────────────
  const headers = activeCols.map(c => c.header);
  const dataRows = ordenes.map(o => activeCols.map(c => {
    const meta = metaMap.get(o.id) ?? parseDescMeta(o.descripcion);
    return c.getValue(o, meta, usuariosById);
  }));

  const wsOrd = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  wsOrd["!cols"]   = activeCols.map(c => ({ wch: c.width }));
  wsOrd["!rows"]   = [{ hpt: 22 }, ...dataRows.map(() => ({ hpt: 18 }))];
  wsOrd["!freeze"] = { xSplit: 0, ySplit: 1 };

  styleRow(wsOrd, 0, activeCols.length, S.headerDark);
  const idColIdx = activeCols.findIndex(c => c.key === "numero");

  dataRows.forEach((_, i) => {
    const rIdx = i + 1;
    const even = i % 2 === 0;
    styleRow(wsOrd, rIdx, activeCols.length, even ? S.rowEven : S.rowOdd);

    activeCols.forEach((c, colIdx) => {
      const addr = XLSX.utils.encode_cell({ r: rIdx, c: colIdx });
      const o = ordenes[i];
      if (c.estadoBadge) {
        const ec = estadoColors[o.estado] ?? { font: "475569", fill: "F8FAFC" };
        applyStyle(wsOrd, addr, S.badge(ec.font, ec.fill));
      } else if (c.prioBadge) {
        const pc = prioColors[o.prioridad] ?? prioColors.ninguna;
        applyStyle(wsOrd, addr, S.badge(pc.font, pc.fill));
      } else if (c.mutableIfEmpty?.(o)) {
        applyStyle(wsOrd, addr, S.rowMuted(even));
      }
    });

    // Hyperlink ID cell → per-OT sheet (preferred) or Materiales (fallback).
    if (idColIdx >= 0) {
      const ot = ordenes[i];
      const idAddr = XLSX.utils.encode_cell({ r: rIdx, c: idColIdx });
      const idVal = ot.numero ?? "—";
      const otSheet = otSheetName.get(ot.id);
      const matRow  = matFirstRow.get(ot.id);
      const linkTarget = otSheet
        ? `#'${otSheet}'!A1`
        : matRow != null
        ? `#'Materiales'!A${matRow + 1}`
        : null;
      if (linkTarget) {
        const tooltip = otSheet
          ? "→ Hoja de cálculo + Fotos (filtrado)"
          : "→ Materiales";
        wsOrd[idAddr] = { v: idVal, t: "s", l: { Target: linkTarget, Tooltip: tooltip } };
        applyStyle(wsOrd, idAddr, S_link(even));
      }
    }
  });

  // Total row
  const totalRowIdx = dataRows.length + 1;
  const totAddr = XLSX.utils.encode_cell({ r: totalRowIdx, c: 0 });
  wsOrd[totAddr] = { v: `Total: ${ordenes.length} órdenes`, t: "s" };
  applyStyle(wsOrd, totAddr, S.totalRow);
  const sheetRange = XLSX.utils.decode_range((wsOrd["!ref"] as string) ?? "A1");
  sheetRange.e.r = totalRowIdx;
  wsOrd["!ref"] = XLSX.utils.encode_range(sheetRange);
  for (let c = 1; c < activeCols.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
    wsOrd[addr] = { v: "", t: "s" };
    applyStyle(wsOrd, addr, S.totalRow);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsOrd, "Órdenes de trabajo");

  // ── SHEET 2: Resumen (KPIs) ─────────────────────────────────────────────
  if (cols.resumen) {
    const total      = ordenes.length;
    const completado = ordenes.filter(o => o.estado === "completado").length;
    const enCurso    = ordenes.filter(o => o.estado === "en_curso").length;
    const pendiente  = ordenes.filter(o => o.estado === "pendiente").length;
    const enEspera   = ordenes.filter(o => o.estado === "en_espera").length;
    const urgentes   = ordenes.filter(o => o.prioridad === "urgente").length;
    const vencidas   = ordenes.filter(o =>
      o.estado !== "completado" && o.fecha_termino && new Date(o.fecha_termino) < new Date()
    ).length;
    const sinAsignar = ordenes.filter(o => !o.asignados_ids?.length).length;

    const byTipo: Record<string, number> = {};
    ordenes.forEach(o => { if (o.tipo_trabajo) byTipo[o.tipo_trabajo] = (byTipo[o.tipo_trabajo] ?? 0) + 1; });
    const byUbic: Record<string, number> = {};
    ordenes.forEach(o => {
      const label = o.ubicaciones?.edificio ?? "Sin ubicación";
      byUbic[label] = (byUbic[label] ?? 0) + 1;
    });

    const kpiData: (string | number)[][] = [
      ["RESUMEN DEL REPORTE", ""],
      ["", ""],
      ["ESTADOS", ""],
      ["Total de órdenes", total],
      ["Completadas", completado],
      ["En curso", enCurso],
      ["Sin asignar (pendiente)", pendiente],
      ["En espera", enEspera],
      ["", ""],
      ["ALERTAS", ""],
      ["Urgentes", urgentes],
      ["Vencidas (sin completar)", vencidas],
      ["Sin asignar", sinAsignar],
      ["", ""],
      ["POR TIPO DE TRABAJO", ""],
      ...Object.entries(byTipo).map(([k, v]) => [TIPO_LABEL[k] ?? k, v]),
      ["", ""],
      ["POR UBICACIÓN (Top 10)", ""],
      ...Object.entries(byUbic).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10).map(([k, v]) => [k, v]),
      ["", ""],
      ["Exportado el", fmtDateTime(new Date().toISOString())],
    ];

    const wsKpi = XLSX.utils.aoa_to_sheet(kpiData);
    wsKpi["!cols"]   = [{ wch: 34 }, { wch: 18 }];
    wsKpi["!rows"]   = kpiData.map(() => ({ hpt: 18 }));
    wsKpi["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

    applyStyle(wsKpi, "A1", S.kpiHeader);
    applyStyle(wsKpi, "B1", S.kpiHeader);

    const sectionKeys = new Set(["ESTADOS", "ALERTAS", "POR TIPO DE TRABAJO", "POR UBICACIÓN (Top 10)"]);
    kpiData.forEach((row, i) => {
      if (i === 0) return;
      const k = row[0];
      if (typeof k !== "string" || k === "") return;
      if (sectionKeys.has(k)) {
        applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 0 }), S.headerBrand);
        applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 1 }), S.headerBrand);
      } else if (typeof row[1] === "number" && i >= 3 && i <= 8) {
        applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 0 }), S.kpiLabel);
        applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 1 }), S.kpiValueBig);
      } else {
        applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 0 }), S.kpiLabel);
        applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 1 }), S.kpiValue);
      }
    });

    XLSX.utils.book_append_sheet(wb, wsKpi, "Resumen");
  }

  // ── Per-OT sheets (hoja rows + fotos section) ────────────────────────────
  if (cols.hoja_calculo) {
    for (const ot of ordenes) {
      const sheetName = otSheetName.get(ot.id);
      if (!sheetName) continue;

      const otHojasArr = otHojas.get(ot.id) ?? [];
      const otFotosArr = otFotos.get(ot.id) ?? [];

      const otNumero = ot.numero ?? "—";
      const otNSerie = ot.n_serie ?? metaMap.get(ot.id)?.nOT ?? "—";
      const otTitulo = ot.titulo ?? "Sin título";

      const rows: (string | number)[][] = [];
      const blockStyles: { row: number; nCols: number; style: Record<string, unknown> }[] = [];
      const backlinkCells: { row: number; col: number }[] = [];
      const hyperlinkCells: { row: number; col: number; url: string }[] = [];
      const widestRow = (() => {
        let w = 4;
        for (const h of otHojasArr) w = Math.max(w, (h.columnas?.length ?? 0));
        return Math.max(w, 4);
      })();

      rows.push([`OT-${otNumero}  ·  ${otTitulo}`]);
      blockStyles.push({ row: rows.length - 1, nCols: widestRow, style: S.kpiHeader });
      rows.push([`N° OT (SF): ${otNSerie}`]);
      blockStyles.push({ row: rows.length - 1, nCols: widestRow, style: S.kpiLabel });
      rows.push(["← Volver a Órdenes"]);
      backlinkCells.push({ row: rows.length - 1, col: 0 });
      rows.push([""]);

      for (const hoja of otHojasArr) {
        const hojaFilas = filasByHojaId.get(hoja.id) ?? [];

        rows.push([`Hoja: ${hoja.nombre}`]);
        blockStyles.push({ row: rows.length - 1, nCols: widestRow, style: S.headerBrand });

        const headersH = (hoja.columnas ?? []).map(c => c.label);
        rows.push(headersH.length > 0 ? headersH : ["(sin columnas)"]);
        blockStyles.push({ row: rows.length - 1, nCols: Math.max(headersH.length, 1), style: S.headerDark });

        if (hojaFilas.length === 0) {
          rows.push(["(sin filas)"]);
          blockStyles.push({ row: rows.length - 1, nCols: Math.max(headersH.length, 1), style: S.rowMuted(true) });
        } else {
          hojaFilas.forEach((fila, idx) => {
            const row = (hoja.columnas ?? []).map(c => fila.celdas?.[c.id] ?? "");
            rows.push(row.length > 0 ? row : [""]);
            blockStyles.push({
              row: rows.length - 1,
              nCols: Math.max(headersH.length, 1),
              style: idx % 2 === 0 ? S.rowEven : S.rowOdd,
            });
          });
        }

        rows.push([""]);
      }

      rows.push(["Fotos"]);
      blockStyles.push({ row: rows.length - 1, nCols: widestRow, style: S.kpiHeader });
      if (otFotosArr.length === 0) {
        rows.push(["(sin fotos)"]);
        blockStyles.push({ row: rows.length - 1, nCols: widestRow, style: S.rowMuted(true) });
      } else {
        rows.push(["#", "Tipo", "URL"]);
        blockStyles.push({ row: rows.length - 1, nCols: 3, style: S.headerDark });
        otFotosArr.forEach((foto, idx) => {
          rows.push([idx + 1, foto.tipo, foto.url]);
          blockStyles.push({
            row: rows.length - 1,
            nCols: 3,
            style: idx % 2 === 0 ? S.rowEven : S.rowOdd,
          });
          hyperlinkCells.push({ row: rows.length - 1, col: 2, url: foto.url });
        });
      }

      const wsOt = XLSX.utils.aoa_to_sheet(rows);
      wsOt["!cols"] = Array.from({ length: widestRow }, (_, i) => ({
        wch: i === 0 ? 18 : i === widestRow - 1 ? 60 : 24,
      }));
      wsOt["!rows"] = rows.map(() => ({ hpt: 18 }));
      wsOt["!freeze"] = { xSplit: 0, ySplit: 4 };

      for (const { row, nCols, style } of blockStyles) {
        styleRow(wsOt, row, nCols, style);
      }
      for (const { row, col } of backlinkCells) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        wsOt[addr] = {
          v: "← Volver a Órdenes",
          t: "s",
          l: { Target: `#'Órdenes de trabajo'!A1`, Tooltip: "Volver a la lista de órdenes" },
        };
        applyStyle(wsOt, addr, S_link(false));
      }
      for (const { row, col, url } of hyperlinkCells) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        wsOt[addr] = {
          v: url,
          t: "s",
          l: { Target: url },
          s: { font: { color: { rgb: "1D4ED8" }, underline: true, sz: 10 } },
        };
      }

      XLSX.utils.book_append_sheet(wb, wsOt, sheetName);
    }
  }

  // ── Materiales sheet ────────────────────────────────────────────────────
  if (matSheetData) {
    const { matData, matHeaders } = matSheetData;
    const wsMat = XLSX.utils.aoa_to_sheet(matData);
    wsMat["!cols"]   = [8, 22, 28, 12, 12, 16, 14].map(wch => ({ wch }));
    wsMat["!rows"]   = matData.map(() => ({ hpt: 18 }));
    wsMat["!freeze"] = { xSplit: 0, ySplit: 1 };
    styleRow(wsMat, 0, matHeaders.length, S.headerDark);
    for (let r = 1; r < matData.length; r++) {
      const even = r % 2 === 0;
      styleRow(wsMat, r, matHeaders.length, even ? S.rowEven : S.rowOdd);
      const idAddr = XLSX.utils.encode_cell({ r, c: 0 });
      const idVal  = matData[r][0];
      wsMat[idAddr] = { v: idVal, t: "s", l: { Target: `#'Órdenes de trabajo'!A${r + 1}`, Tooltip: "← Volver a Órdenes" } };
      applyStyle(wsMat, idAddr, S_link(even));
    }
    if (matData.length > 1) {
      const totalRow = ["", "", "TOTAL", "", "", "", matData.slice(1).reduce((sum, r) => sum + (typeof r[6] === "number" ? r[6] : 0), 0)];
      const totalIdx = matData.length;
      XLSX.utils.sheet_add_aoa(wsMat, [totalRow], { origin: totalIdx });
      styleRow(wsMat, totalIdx, matHeaders.length, S.totalRow);
    }
    XLSX.utils.book_append_sheet(wb, wsMat, "Materiales");
  }

  // Return the bytes — caller decides what to do with them.
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}
