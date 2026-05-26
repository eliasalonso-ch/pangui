"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Download, FileSpreadsheet, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Field = "codigo" | "nombre" | "unidad" | "cantidad" | "precio_unitario" | "descripcion" | "ignorar";

interface ColumnMap {
  col:   number;
  field: Field;
}

interface ImportTemplate {
  id:             string;
  nombre:         string;
  tipo:           "materiales";
  hoja:           string | null;
  rango:          string;
  columnas:       ColumnMap[];
  archivo_url:    string | null;
  archivo_nombre: string | null;
}

// Normalized row written to the template — keys match template Field values.
type ExportRow = Partial<Record<Exclude<Field, "ignorar">, string | number | null>>;

interface HojaColumna { id: string; label: string; tipo: "texto" | "numero"; }
interface HojaInfo   { id: string; nombre: string; columnas: HojaColumna[]; }

type Source = "materiales" | "hoja";

interface Props {
  ordenId:     string;
  ordenNumero: number | null;
  workspaceId: string;
  source?:     Source;
  onClose:     () => void;
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

// Match a hoja column label to a template Field. Case-insensitive, accent-
// stripped, and with sensible synonyms ("ítem" → nombre, "precio" → precio_unitario).
function fieldFromLabel(label: string): Exclude<Field, "ignorar"> | null {
  const k = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (["codigo", "código", "sku", "ref", "referencia"].includes(k)) return "codigo";
  if (["nombre", "item", "ítem", "descripcion item", "material", "producto"].includes(k)) return "nombre";
  if (["unidad", "ud", "u", "um"].includes(k)) return "unidad";
  if (["cantidad", "qty", "cant"].includes(k)) return "cantidad";
  if (["precio", "precio unitario", "valor", "valor unitario", "costo", "costo unitario"].includes(k)) return "precio_unitario";
  if (["descripcion", "descripción", "detalle", "obs", "observacion", "observación"].includes(k)) return "descripcion";
  return null;
}

// ── Component ────────────────────────────────────────────────────────────

export default function ExportarMaterialesModal({ ordenId, ordenNumero, workspaceId, source = "materiales", onClose }: Props) {
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [rows, setRows]   = useState<ExportRow[]>([]);
  const [hojas, setHojas] = useState<HojaInfo[]>([]);
  const [hojaId, setHojaId] = useState<string | null>(null);
  const [hojaColumnas, setHojaColumnas] = useState<HojaColumna[]>([]);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const template = useMemo(() => templates.find(t => t.id === templateId) ?? null, [templates, templateId]);

  // Load templates + initial source data.
  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: tpls } = await sb
        .from("import_templates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("tipo", "materiales")
        .not("archivo_url", "is", null)
        .order("created_at", { ascending: false });
      const list = (tpls as ImportTemplate[]) ?? [];
      setTemplates(list);
      if (list.length === 1) setTemplateId(list[0].id);

      if (source === "materiales") {
        const { data: parts } = await sb
          .from("orden_partes")
          .select("cantidad, parte:partes!parte_id(codigo, nombre, unidad, precio_unitario, descripcion)")
          .eq("orden_id", ordenId)
          .order("created_at", { ascending: true });
        const out: ExportRow[] = ((parts as any[]) ?? []).map(p => {
          const parte = Array.isArray(p.parte) ? p.parte[0] : p.parte;
          return {
            codigo:          parte?.codigo          ?? null,
            nombre:          parte?.nombre          ?? null,
            unidad:          parte?.unidad          ?? null,
            cantidad:        p.cantidad             ?? null,
            precio_unitario: parte?.precio_unitario ?? null,
            descripcion:     parte?.descripcion     ?? null,
          };
        });
        setRows(out);
      } else {
        const { data: hojasData } = await sb
          .from("hojas_inventario")
          .select("id, nombre, columnas")
          .eq("workspace_id", workspaceId)
          .eq("orden_id", ordenId)
          .order("created_at");
        const hs = ((hojasData as any[]) ?? []).map(h => ({ id: h.id, nombre: h.nombre, columnas: h.columnas as HojaColumna[] }));
        setHojas(hs);
        if (hs.length === 1) setHojaId(hs[0].id);
      }
      setLoading(false);
    }
    load();
  }, [workspaceId, ordenId, source]);

  // When the user picks a hoja, load its filas and translate them to ExportRow.
  useEffect(() => {
    if (source !== "hoja" || !hojaId) { setRows([]); setHojaColumnas([]); return; }
    const hoja = hojas.find(h => h.id === hojaId);
    if (!hoja) return;
    setHojaColumnas(hoja.columnas);
    const sb = createClient();
    sb.from("hojas_inventario_filas")
      .select("celdas, orden")
      .eq("hoja_id", hojaId)
      .order("orden")
      .then(({ data }) => {
        const filas = ((data as { celdas: Record<string, string>; orden: number }[]) ?? []);
        const out: ExportRow[] = filas.map(f => {
          const row: ExportRow = {};
          for (const col of hoja.columnas) {
            const field = fieldFromLabel(col.label);
            if (!field) continue;
            const raw = f.celdas?.[col.id] ?? null;
            if (raw == null || raw === "") { row[field] = null; continue; }
            if (field === "cantidad" || field === "precio_unitario") {
              const n = parseFloat(String(raw).replace(",", "."));
              row[field] = isFinite(n) ? n : null;
            } else {
              row[field] = String(raw);
            }
          }
          return row;
        });
        // Drop fully-empty rows so an empty trailing fila in the hoja doesn't
        // bloat the export.
        setRows(out.filter(r => Object.values(r).some(v => v != null && v !== "")));
      });
  }, [source, hojaId, hojas]);

  async function doExport() {
    if (!template || !template.archivo_url) return;
    setExporting(true);
    setErr(null);
    try {
      const range = parseRange(template.rango);
      if (!range) throw new Error("El rango de la plantilla no es válido.");

      // Surgical zip edit: we unzip the .xlsm, mutate only the cells we're
      // writing, and re-zip. Everything else (formatting, macros, drawings,
      // shared strings, theme) is byte-identical to the original. This is the
      // only approach that round-trips .xlsm faithfully — both xlsx-js-style
      // and ExcelJS strip the VBA project on write.
      const res = await fetch(template.archivo_url);
      if (!res.ok) throw new Error("No se pudo descargar el archivo de la plantilla.");
      const buf = await res.arrayBuffer();

      const { editXlsxCells } = await import("@/lib/xlsx-surgical");
      type CellEdit = Parameters<typeof editXlsxCells>[1][number];
      const edits: CellEdit[] = [];
      for (let i = 0; i < rows.length; i++) {
        const m = rows[i];
        const rowNumber = range.start.row + i + 1; // surgical lib is 1-indexed
        for (const cm of template.columnas) {
          if (cm.field === "ignorar") continue;
          const colNumber = range.start.col + cm.col + 1;
          const value = m[cm.field] ?? null;
          edits.push({ row: rowNumber, col: colNumber, value });
        }
      }

      const outBytes = await editXlsxCells(buf, edits, { sheetName: template.hoja });

      const origName = template.archivo_nombre ?? "plantilla.xlsx";
      const dotIdx = origName.lastIndexOf(".");
      const baseName = dotIdx > 0 ? origName.slice(0, dotIdx) : origName;
      const ext = (dotIdx > 0 ? origName.slice(dotIdx + 1) : "xlsx").toLowerCase();

      const blob = new Blob([outBytes as BlobPart], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const otTag = ordenNumero != null ? `-OT${ordenNumero}` : "";
      a.href = url;
      a.download = `${baseName}${otTag}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDone(true);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Error desconocido";
      setErr(`No se pudo generar el archivo. ${msg}`);
    }
    setExporting(false);
  }

  // Diagnostic: which template fields are populated by the hoja's columns?
  const hojaMappingPreview = useMemo(() => {
    if (source !== "hoja") return null;
    const mapped = hojaColumnas
      .map(c => ({ label: c.label, field: fieldFromLabel(c.label) }))
      .filter(x => x.field);
    return mapped;
  }, [source, hojaColumnas]);

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
          width: "min(620px, 100%)", maxHeight: "calc(100vh - 48px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.25)", overflow: "hidden",
        }}
      >
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <Download size={18} style={{ color: "var(--brand)" }} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>
            Exportar {source === "hoja" ? "hoja de cálculo" : "materiales"} a Excel
          </h2>
          <button onClick={onClose} style={iconBtnStyle} title="Cerrar"><X size={14} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "30px 20px" }}>
              <CheckCircle2 size={32} style={{ color: "var(--success)" }} />
              <p style={{ margin: "12px 0 4px", fontSize: 14, fontWeight: 700, color: "var(--fg-1)" }}>
                Archivo generado
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-4)" }}>
                Revisa la carpeta de descargas de tu navegador.
              </p>
            </div>
          ) : loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
              <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 10px" }}>
              <FileSpreadsheet size={28} style={{ color: "var(--fg-4)" }} />
              <p style={{ margin: "10px 0 4px", fontSize: 13, fontWeight: 600, color: "var(--fg-2)" }}>
                No hay plantillas con archivo disponible
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-4)" }}>
                Pide a un administrador que edite la plantilla y vuelva a subir el archivo de muestra.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {source === "hoja" && hojas.length === 0 && (
                <div style={{ textAlign: "center", padding: "10px" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--fg-3)" }}>
                    Esta OT aún no tiene ninguna hoja de cálculo.
                  </p>
                </div>
              )}

              {source === "hoja" && hojas.length > 1 && (
                <div>
                  <label style={labelStyle}>Hoja de cálculo</label>
                  <select
                    value={hojaId ?? ""}
                    onChange={e => setHojaId(e.target.value || null)}
                    style={inputStyle}
                  >
                    <option value="" disabled>Selecciona una hoja…</option>
                    {hojas.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </div>
              )}

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

              {source === "hoja" && hojaMappingPreview && hojaMappingPreview.length > 0 && (
                <div style={{
                  padding: 10, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--surface-2)", fontSize: 11, color: "var(--fg-3)",
                }}>
                  <strong style={{ color: "var(--fg-2)" }}>Mapeo automático:</strong>{" "}
                  {hojaMappingPreview.map((m, i) => (
                    <span key={m.label}>
                      {i > 0 && " · "}
                      {m.label} → {m.field}
                    </span>
                  ))}
                </div>
              )}

              <div style={{
                padding: 12, borderRadius: 10, border: "1px solid var(--border)",
                background: "var(--surface-2)", fontSize: 12, color: "var(--fg-2)",
                lineHeight: 1.5,
              }}>
                <strong style={{ color: "var(--fg-1)" }}>{rows.length}</strong> fila(s)
                {template ? <> se escribirán en <strong style={{ color: "var(--fg-1)" }}>{template.archivo_nombre ?? "el archivo"}</strong> a partir de la fila <strong>{(parseRange(template.rango)?.start.row ?? 0) + 1}</strong>.</> : "."}
              </div>

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
              onClick={doExport}
              disabled={exporting || !template || rows.length === 0}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 14px", borderRadius: 8,
                border: "none",
                background: (!template || rows.length === 0) ? "var(--fg-5)" : "var(--brand)",
                color: "white", fontSize: 13, fontWeight: 600,
                cursor: exporting || !template || rows.length === 0 ? "default" : "pointer",
                fontFamily: "inherit", opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Generar Excel
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
