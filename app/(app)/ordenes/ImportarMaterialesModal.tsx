"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Upload, FileSpreadsheet, Loader2, Check, AlertCircle, CheckCircle2, PlusCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase";

// Mirrors the shape stored in import_templates.columnas.
type Field = "codigo" | "nombre" | "unidad" | "cantidad" | "precio_unitario" | "descripcion" | "ignorar";

interface ColumnMap {
  col:   number;
  field: Field;
}

interface ImportTemplate {
  id:           string;
  nombre:       string;
  tipo:         "materiales";
  hoja:         string | null;
  rango:        string;
  columnas:    ColumnMap[];
}

interface ParsedRow {
  rowIndex:        number;
  codigo:          string | null;
  nombre:          string | null;
  unidad:          string | null;
  cantidad:        number | null;
  precio_unitario: number | null;
  descripcion:     string | null;
  errors:          string[];
  // After matching: null = will create new parte, otherwise the existing parte id.
  matchedParteId:  string | null;
}

interface Props {
  ordenId:     string;
  workspaceId: string;
  myId:        string;
  onClose:     () => void;
  // Called after successful import so the parent can refresh ordenPartes.
  onImported:  () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseA1(s: string): { col: number; row: number } | null {
  const m = s.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

function parseRange(s: string): { start: { col: number; row: number }; end: { col: number; row: number } } | null {
  const parts = s.split(":");
  if (parts.length === 1) {
    const a = parseA1(parts[0]);
    if (!a) return null;
    return { start: a, end: a };
  }
  if (parts.length !== 2) return null;
  const a = parseA1(parts[0]);
  const b = parseA1(parts[1]);
  if (!a || !b) return null;
  return {
    start: { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) },
    end:   { col: Math.max(a.col, b.col), row: Math.max(a.row, b.row) },
  };
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    // Excel locale-friendly: allow "1.234,56" → 1234.56 or "1,234.56" → 1234.56.
    const cleaned = v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
}

function toText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

// ── Component ────────────────────────────────────────────────────────────

export default function ImportarMaterialesModal({ ordenId, workspaceId, myId, onClose, onImported }: Props) {
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loadingTpls, setLoadingTpls] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [matched, setMatched] = useState(false);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; partesCreated: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = useMemo(() => templates.find(t => t.id === templateId) ?? null, [templates, templateId]);

  // Load workspace templates.
  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data } = await sb
        .from("import_templates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("tipo", "materiales")
        .order("created_at", { ascending: false });
      const tpls = (data as ImportTemplate[]) ?? [];
      setTemplates(tpls);
      if (tpls.length === 1) setTemplateId(tpls[0].id);
      setLoadingTpls(false);
    }
    load();
  }, [workspaceId]);

  // Parse the file once both file and template are ready.
  async function parseFile(f: File, tpl: ImportTemplate) {
    setParsing(true);
    setErr(null);
    setRows([]);
    setMatched(false);
    try {
      const XLS = (await import("xlsx-js-style")).default;
      const buf = await f.arrayBuffer();
      const wb = XLS.read(buf, { type: "array", cellDates: false, cellFormula: false });
      const sheetName = tpl.hoja && wb.SheetNames.includes(tpl.hoja) ? tpl.hoja : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) { setErr(`No se encontró la hoja "${sheetName}".`); setParsing(false); return; }
      const range = parseRange(tpl.rango);
      if (!range) { setErr(`El rango "${tpl.rango}" de la plantilla no es válido.`); setParsing(false); return; }

      const parsed: ParsedRow[] = [];
      for (let r = range.start.row; r <= range.end.row; r++) {
        const rowValues: (unknown)[] = [];
        for (let c = range.start.col; c <= range.end.col; c++) {
          const addr = XLS.utils.encode_cell({ r, c });
          const cell = ws[addr];
          rowValues.push(cell?.v ?? null);
        }
        // Skip completely empty rows.
        if (rowValues.every(v => v == null || (typeof v === "string" && v.trim() === ""))) continue;

        const row: ParsedRow = {
          rowIndex: r + 1,
          codigo: null, nombre: null, unidad: null,
          cantidad: null, precio_unitario: null, descripcion: null,
          errors: [], matchedParteId: null,
        };
        for (const cm of tpl.columnas) {
          const v = rowValues[cm.col];
          if (cm.field === "ignorar") continue;
          if (cm.field === "cantidad" || cm.field === "precio_unitario") {
            row[cm.field] = toNumber(v);
          } else {
            row[cm.field] = toText(v);
          }
        }
        if (!row.nombre)   row.errors.push("Falta nombre");
        if (!row.unidad)   row.errors.push("Falta unidad");
        if (row.cantidad == null || row.cantidad <= 0) row.errors.push("Cantidad inválida");
        parsed.push(row);
      }
      setRows(parsed);
      // Now match against existing partes.
      await matchAgainstCatalog(parsed);
    } catch (e) {
      setErr("No se pudo leer el archivo. Asegúrate de que es un .xlsx válido.");
    }
    setParsing(false);
  }

  async function matchAgainstCatalog(parsed: ParsedRow[]) {
    // Match by codigo when present, otherwise by nombre. Both keys are
    // normalized (lowercase + trim) so casing/whitespace doesn't fragment
    // the catalog.
    const codigos = Array.from(new Set(parsed.map(p => p.codigo).filter((s): s is string => !!s)));
    const nombres = Array.from(new Set(parsed.filter(p => !p.codigo).map(p => p.nombre).filter((s): s is string => !!s)));
    if (codigos.length === 0 && nombres.length === 0) { setMatched(true); return; }
    const sb = createClient();
    const byCodigo = new Map<string, string>();
    const byNombre = new Map<string, string>();
    if (codigos.length > 0) {
      const { data } = await sb
        .from("partes")
        .select("id, codigo")
        .eq("workspace_id", workspaceId)
        .in("codigo", codigos);
      for (const p of (data as { id: string; codigo: string }[]) ?? []) {
        byCodigo.set(p.codigo.toLowerCase().trim(), p.id);
      }
    }
    if (nombres.length > 0) {
      const { data } = await sb
        .from("partes")
        .select("id, nombre")
        .eq("workspace_id", workspaceId)
        .in("nombre", nombres);
      for (const p of (data as { id: string; nombre: string }[]) ?? []) {
        byNombre.set(p.nombre.toLowerCase().trim(), p.id);
      }
    }
    setRows(parsed.map(r => {
      if (r.codigo) {
        return { ...r, matchedParteId: byCodigo.get(r.codigo.toLowerCase().trim()) ?? null };
      }
      if (r.nombre) {
        return { ...r, matchedParteId: byNombre.get(r.nombre.toLowerCase().trim()) ?? null };
      }
      return r;
    }));
    setMatched(true);
  }

  // Trigger parse whenever file + template are present.
  useEffect(() => {
    if (file && template) parseFile(file, template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.name, template?.id]);

  const validRows = useMemo(() => rows.filter(r => r.errors.length === 0), [rows]);
  const willCreatePartes = useMemo(() => validRows.filter(r => !r.matchedParteId).length, [validRows]);

  async function doImport() {
    if (!template) return;
    if (validRows.length === 0) return;
    setImporting(true);
    setErr(null);
    try {
      const sb = createClient();

      // Step 1: create catalog entries for unmatched rows.
      // codigo is NOT NULL on partes, so when the Excel doesn't supply one we
      // auto-generate from the nombre (lowercased, non-alphanumerics dropped)
      // plus a short suffix to avoid collisions. We rely on row-index ordering
      // — Supabase preserves it on .insert().select() — to backfill ids.
      const newPartesRows = validRows.filter(r => !r.matchedParteId);
      if (newPartesRows.length > 0) {
        const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
        const inserts = newPartesRows.map((r, i) => ({
          workspace_id:    workspaceId,
          codigo:          r.codigo ?? `${slug(r.nombre ?? "material")}-${Date.now().toString(36)}-${i}`,
          nombre:          r.nombre!,
          unidad:          r.unidad!,
          descripcion:     r.descripcion,
          precio_unitario: r.precio_unitario ?? 0,
          stock_actual:    0,
          stock_minimo:    0,
          activo:          true,
          tags:            [],
        }));
        const { data: inserted, error: insErr } = await sb
          .from("partes")
          .insert(inserts)
          .select("id");
        if (insErr) throw insErr;
        const insertedIds = ((inserted as { id: string }[]) ?? []);
        if (insertedIds.length !== newPartesRows.length) {
          throw new Error("La cantidad de partes creadas no coincide con la esperada.");
        }
        newPartesRows.forEach((r, i) => { r.matchedParteId = insertedIds[i].id; });
      }

      // Step 2: insert orden_partes for every valid row.
      const opInserts = validRows
        .filter(r => r.matchedParteId)
        .map(r => ({
          orden_id: ordenId,
          parte_id: r.matchedParteId!,
          cantidad: r.cantidad!,
        }));
      if (opInserts.length > 0) {
        const { error: opErr } = await sb.from("orden_partes").insert(opInserts);
        if (opErr) throw opErr;
      }

      setDone({ created: opInserts.length, partesCreated: newPartesRows.length });
      onImported();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setErr(`No se pudo completar la importación. ${msg}`.trim());
    }
    setImporting(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--surface-1)", borderRadius: 14,
          width: "min(900px, 100%)", maxHeight: "calc(100vh - 48px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.25)", overflow: "hidden",
        }}
      >
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <FileSpreadsheet size={18} style={{ color: "var(--brand)" }} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>
            Importar materiales desde Excel
          </h2>
          <button onClick={onClose} style={iconBtnStyle} title="Cerrar"><X size={14} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <CheckCircle2 size={36} style={{ color: "var(--success)" }} />
              <p style={{ margin: "12px 0 4px", fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>
                Importación completada
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--fg-3)" }}>
                Se añadieron <strong>{done.created}</strong> materiales a la OT.
                {done.partesCreated > 0 && <> Se crearon <strong>{done.partesCreated}</strong> nueva(s) entrada(s) en el catálogo.</>}
              </p>
            </div>
          ) : loadingTpls ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <FileSpreadsheet size={28} style={{ color: "var(--fg-4)" }} />
              <p style={{ margin: "12px 0 4px", fontSize: 14, fontWeight: 600, color: "var(--fg-2)" }}>
                No hay plantillas de importación
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-4)" }}>
                Pide a un administrador que configure una plantilla en Configuración → Plantillas de importación.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Template picker */}
              {templates.length > 1 && (
                <div>
                  <label style={labelStyle}>Plantilla</label>
                  <select
                    value={templateId ?? ""}
                    onChange={e => setTemplateId(e.target.value || null)}
                    style={inputStyle}
                  >
                    <option value="" disabled>Selecciona una plantilla…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
              )}

              {/* File picker */}
              <div>
                <label style={labelStyle}>Archivo Excel</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!templateId}
                  style={{
                    ...inputStyle, display: "flex", alignItems: "center", gap: 6,
                    cursor: templateId ? "pointer" : "default",
                    background: "var(--surface-1)", color: "var(--fg-2)",
                    opacity: templateId ? 1 : 0.6,
                  }}
                >
                  <Upload size={13} />
                  {file ? file.name : "Seleccionar archivo…"}
                  {parsing && <Loader2 size={13} className="animate-spin" style={{ marginLeft: "auto" }} />}
                </button>
              </div>

              {/* Preview */}
              {rows.length > 0 && matched && (
                <div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    margin: "0 0 8px", fontSize: 12, color: "var(--fg-3)",
                  }}>
                    <span><strong style={{ color: "var(--fg-1)" }}>{validRows.length}</strong> de {rows.length} fila(s) listas para importar</span>
                    {willCreatePartes > 0 && (
                      <span style={{
                        marginLeft: "auto",
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 999,
                        background: "var(--brand-tint)", color: "var(--brand-fg)",
                        fontSize: 11, fontWeight: 600,
                      }}>
                        <PlusCircle size={11} />
                        Se crearán {willCreatePartes} parte(s) nueva(s) en el catálogo
                      </span>
                    )}
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "auto", maxHeight: 360 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                        <tr>
                          <th style={thStyle}>Fila</th>
                          <th style={thStyle}>Código</th>
                          <th style={thStyle}>Nombre</th>
                          <th style={thStyle}>Unidad</th>
                          <th style={thStyle}>Cantidad</th>
                          <th style={thStyle}>Precio</th>
                          <th style={thStyle}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.rowIndex} style={{
                            background: r.errors.length > 0 ? "var(--danger-bg, rgba(239,68,68,0.05))" : "var(--surface-1)",
                          }}>
                            <td style={tdStyle}>{r.rowIndex}</td>
                            <td style={tdStyle}>{r.codigo ?? "—"}</td>
                            <td style={tdStyle}>{r.nombre ?? "—"}</td>
                            <td style={tdStyle}>{r.unidad ?? "—"}</td>
                            <td style={tdStyle}>{r.cantidad ?? "—"}</td>
                            <td style={tdStyle}>{r.precio_unitario ?? "—"}</td>
                            <td style={tdStyle}>
                              {r.errors.length > 0 ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--danger)" }}>
                                  <AlertCircle size={11} /> {r.errors.join(", ")}
                                </span>
                              ) : r.matchedParteId ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--success)" }}>
                                  <Check size={11} /> Existe
                                </span>
                              ) : (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--brand-fg)" }}>
                                  <PlusCircle size={11} /> Nuevo
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {err && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  border: "1px solid var(--danger)", background: "var(--danger-bg, rgba(239,68,68,0.08))",
                  color: "var(--danger)", fontSize: 12,
                }}>
                  {err}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 36, padding: "0 14px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface-1)",
              color: "var(--fg-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {done ? "Cerrar" : "Cancelar"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={doImport}
              disabled={importing || validRows.length === 0}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 14px", borderRadius: 8,
                border: "none", background: validRows.length === 0 ? "var(--fg-5)" : "var(--brand)",
                color: "white", fontSize: 13, fontWeight: 600,
                cursor: importing || validRows.length === 0 ? "default" : "pointer", fontFamily: "inherit",
                opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Importar {validRows.length} material{validRows.length === 1 ? "" : "es"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 8,
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--fg-3)", cursor: "pointer", fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "var(--fg-3)",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, padding: "0 10px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-1)",
  color: "var(--fg-1)", fontSize: 13, fontFamily: "inherit", outline: "none",
};

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700,
  color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 12, color: "var(--fg-1)",
  borderBottom: "1px solid var(--border)",
};
