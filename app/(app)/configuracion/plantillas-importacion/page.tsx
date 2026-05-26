"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, Trash2, Pencil, FileSpreadsheet, Upload, X, Check,
  AlertCircle, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadToR2 } from "@/lib/r2";
import { esAdmin } from "@/lib/roles";

// ── Types ────────────────────────────────────────────────────────────────

type Field = "codigo" | "nombre" | "unidad" | "cantidad" | "precio_unitario" | "descripcion" | "ignorar";

interface ColumnMap {
  col:   number; // 0-indexed offset within the selected range
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
  created_at:     string;
  updated_at:     string;
}

interface SheetGrid {
  name: string;
  // Cell values indexed by row, then column (both 0-indexed).
  rows: (string | number | null)[][];
}

const FIELD_LABEL: Record<Field, string> = {
  codigo:          "Código",
  nombre:          "Nombre",
  unidad:          "Unidad",
  cantidad:        "Cantidad",
  precio_unitario: "Precio unitario",
  descripcion:     "Descripción",
  ignorar:         "— Ignorar —",
};

const REQUIRED_FIELDS: Field[] = ["nombre", "unidad", "cantidad"];

// ── Helpers ──────────────────────────────────────────────────────────────

// Convert a 0-indexed column number to an A1 letter (0 → "A", 26 → "AA").
function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (true) {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
    if (x < 0) break;
  }
  return s;
}

// Parse "B5" → { col: 1, row: 4 }. Returns null on invalid input.
function parseA1(s: string): { col: number; row: number } | null {
  const m = s.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

// Parse "B5:E50" → { start, end } in 0-indexed. Single cell ("B5") also works
// and is treated as a 1×1 range.
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

// ── Page ─────────────────────────────────────────────────────────────────

export default function PlantillasImportacionPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [myId, setMyId]               = useState<string>("");
  const [rol, setRol]                 = useState<string>("");
  const [loading, setLoading]         = useState(true);
  const [templates, setTemplates]     = useState<ImportTemplate[]>([]);
  const [err, setErr]                 = useState<string | null>(null);

  // Editor state
  const [editorOpen, setEditorOpen]       = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setMyId(user.id);

      const { data: perfil } = await sb
        .from("usuarios")
        .select("rol, workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!perfil?.workspace_id) { setLoading(false); return; }
      setRol(perfil.rol ?? "");
      setWorkspaceId(perfil.workspace_id);

      if (!esAdmin(perfil.rol)) { setLoading(false); return; }

      const { data: tpls } = await sb
        .from("import_templates")
        .select("*")
        .eq("workspace_id", perfil.workspace_id)
        .order("created_at", { ascending: false });

      setTemplates((tpls as ImportTemplate[]) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function reload() {
    if (!workspaceId) return;
    const sb = createClient();
    const { data } = await sb
      .from("import_templates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    setTemplates((data as ImportTemplate[]) ?? []);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("¿Eliminar esta plantilla? Las importaciones futuras dejarán de usarla.")) return;
    const sb = createClient();
    const { error } = await sb.from("import_templates").delete().eq("id", id);
    if (error) { setErr("No se pudo eliminar la plantilla."); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }

  if (!esAdmin(rol)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", padding: 24 }}>
        <p style={{ color: "var(--fg-3)", fontSize: 14 }}>Solo administradores pueden gestionar plantillas de importación.</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", background: "var(--surface-0)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 64px" }}>
        <button
          type="button"
          onClick={() => router.push("/configuracion")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14,
            background: "transparent", border: "none", color: "var(--fg-3)",
            fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit",
          }}
        >
          <ChevronLeft size={14} /> Configuración
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--fg-1)" }}>
          Plantillas de importación
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
          Define cómo se mapean los Excel de tu empresa para importar materiales a las OTs.
          Los miembros podrán usar estas plantillas al subir un archivo desde una OT.
        </p>

        {err && (
          <div style={{
            marginTop: 16, padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--danger)", background: "var(--danger-bg, rgba(239,68,68,0.08))",
            color: "var(--danger)", fontSize: 13,
          }}>
            {err}
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => { setEditingId(null); setEditorOpen(true); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 36, padding: "0 14px", borderRadius: 8,
              background: "var(--brand)", color: "white", border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={14} /> Nueva plantilla
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {templates.length === 0 ? (
            <div style={{
              padding: "40px 24px", textAlign: "center",
              border: "1px dashed var(--border)", borderRadius: 12,
              background: "var(--surface-1)",
            }}>
              <FileSpreadsheet size={28} style={{ color: "var(--fg-4)" }} />
              <p style={{ margin: "12px 0 4px", fontSize: 14, fontWeight: 600, color: "var(--fg-2)" }}>
                Aún no hay plantillas
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-4)" }}>
                Sube un Excel de muestra y define qué celdas corresponden a cada campo.
              </p>
            </div>
          ) : (
            <div style={{
              border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden",
              background: "var(--surface-1)",
            }}>
              {templates.map((t, i) => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}>
                  <FileSpreadsheet size={18} style={{ color: "var(--brand)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{t.nombre}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fg-4)" }}>
                      {t.tipo === "materiales" ? "Materiales" : t.tipo} · Rango {t.rango}
                      {t.hoja ? ` · Hoja "${t.hoja}"` : ""} · {t.columnas.filter(c => c.field !== "ignorar").length} columna(s) mapeada(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingId(t.id); setEditorOpen(true); }}
                    style={iconBtnStyle}
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.id)}
                    style={{ ...iconBtnStyle, color: "var(--danger)" }}
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editorOpen && workspaceId && (
        <TemplateEditor
          workspaceId={workspaceId}
          myId={myId}
          existing={editingId ? templates.find(t => t.id === editingId) ?? null : null}
          onClose={() => { setEditorOpen(false); setEditingId(null); }}
          onSaved={async () => {
            setEditorOpen(false);
            setEditingId(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 8,
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--fg-3)", cursor: "pointer", fontFamily: "inherit",
};

// ── Template editor modal ────────────────────────────────────────────────

interface TemplateEditorProps {
  workspaceId: string;
  myId:        string;
  existing:    ImportTemplate | null;
  onClose:     () => void;
  onSaved:     () => void;
}

function TemplateEditor({ workspaceId, myId, existing, onClose, onSaved }: TemplateEditorProps) {
  const [nombre, setNombre] = useState(existing?.nombre ?? "");
  const [rango, setRango]   = useState(existing?.rango ?? "");
  const [hoja, setHoja]     = useState<string>(existing?.hoja ?? "");
  const [columnas, setColumnas] = useState<ColumnMap[]>(existing?.columnas ?? []);
  const [sheets, setSheets]     = useState<SheetGrid[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>(existing?.hoja ?? "");
  const [parsing, setParsing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  // Sample file the admin uploaded in this session. Kept so we can ship it to
  // R2 when they save the template (export needs the original file).
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsedRange = useMemo(() => parseRange(rango), [rango]);
  const grid        = useMemo(() => sheets.find(s => s.name === activeSheet) ?? sheets[0] ?? null, [sheets, activeSheet]);

  // Auto-size columnas array to match the selected range width.
  useEffect(() => {
    if (!parsedRange) return;
    const width = parsedRange.end.col - parsedRange.start.col + 1;
    setColumnas(prev => {
      const next: ColumnMap[] = [];
      for (let i = 0; i < width; i++) {
        const found = prev.find(c => c.col === i);
        next.push(found ?? { col: i, field: "ignorar" });
      }
      return next;
    });
  }, [parsedRange?.start.col, parsedRange?.start.row, parsedRange?.end.col, parsedRange?.end.row]);

  async function onFile(file: File) {
    setParsing(true);
    setErr(null);
    setSampleFile(file);
    try {
      const XLS = (await import("xlsx-js-style")).default;
      const buf = await file.arrayBuffer();
      const wb = XLS.read(buf, { type: "array", cellDates: false, cellFormula: false });
      const out: SheetGrid[] = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const ref = ws["!ref"];
        if (!ref) return { name, rows: [] };
        const range = XLS.utils.decode_range(ref);
        const rows: (string | number | null)[][] = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
          const row: (string | number | null)[] = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLS.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (!cell) row.push(null);
            else if (typeof cell.v === "number" || typeof cell.v === "string") row.push(cell.v);
            else if (cell.v == null) row.push(null);
            else row.push(String(cell.v));
          }
          rows.push(row);
        }
        return { name, rows };
      });
      setSheets(out);
      if (out.length > 0 && !activeSheet) {
        setActiveSheet(out[0].name);
      }
    } catch (e) {
      setErr("No se pudo leer el archivo. Asegúrate de que es un .xlsx válido.");
    }
    setParsing(false);
  }

  function setField(col: number, field: Field) {
    setColumnas(prev => prev.map(c => c.col === col ? { ...c, field } : c));
  }

  const missingRequired = REQUIRED_FIELDS.filter(req => !columnas.some(c => c.field === req));

  async function save() {
    if (!nombre.trim()) { setErr("Ponle un nombre a la plantilla."); return; }
    if (!parsedRange)   { setErr("Ingresa un rango válido (ej. B5:E50)."); return; }
    if (missingRequired.length > 0) {
      setErr(`Faltan campos requeridos: ${missingRequired.map(f => FIELD_LABEL[f]).join(", ")}`);
      return;
    }
    // Block duplicate non-ignorar field assignments.
    const seen = new Set<Field>();
    for (const c of columnas) {
      if (c.field === "ignorar") continue;
      if (seen.has(c.field)) {
        setErr(`El campo "${FIELD_LABEL[c.field]}" está asignado a más de una columna.`);
        return;
      }
      seen.add(c.field);
    }

    setSaving(true);
    setErr(null);

    // Upload the sample file when present so exports can fill it later.
    // Editing an existing template without picking a new file keeps the old URL.
    let archivoUrl    = existing?.archivo_url    ?? null;
    let archivoNombre = existing?.archivo_nombre ?? null;
    if (sampleFile) {
      try {
        archivoUrl    = await uploadToR2(sampleFile, `import-templates/${workspaceId}`);
        archivoNombre = sampleFile.name;
      } catch (e) {
        setSaving(false);
        setErr("No se pudo subir el archivo de muestra.");
        return;
      }
    }
    if (!existing && !archivoUrl) {
      setSaving(false);
      setErr("Sube el archivo de muestra antes de guardar.");
      return;
    }

    const sb = createClient();
    const payload = {
      workspace_id:   workspaceId,
      nombre:         nombre.trim(),
      tipo:           "materiales" as const,
      hoja:           hoja.trim() || null,
      rango:          rango.trim(),
      columnas,
      archivo_url:    archivoUrl,
      archivo_nombre: archivoNombre,
      created_by:     myId,
    };
    const op = existing
      ? sb.from("import_templates").update(payload).eq("id", existing.id)
      : sb.from("import_templates").insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) { setErr("No se pudo guardar la plantilla."); return; }
    onSaved();
  }

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
          width: "min(1100px, 100%)", height: "calc(100vh - 48px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.25)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>
            {existing ? "Editar plantilla" : "Nueva plantilla"}
          </h2>
          <button onClick={onClose} style={{ ...iconBtnStyle, width: 32, height: 32 }} title="Cerrar">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* Left: config */}
          <div style={{
            width: 360, flexShrink: 0, padding: 20, overflowY: "auto",
            borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <Field label="Nombre">
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder='ej. "Materiales estándar"'
                style={inputStyle}
              />
            </Field>

            <Field label="Archivo de muestra">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  ...inputStyle, display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", background: "var(--surface-1)", color: "var(--fg-2)",
                }}
              >
                <Upload size={13} />
                {sheets.length > 0 ? "Cambiar archivo…" : "Seleccionar Excel…"}
                {parsing && <Loader2 size={13} className="animate-spin" style={{ marginLeft: "auto" }} />}
              </button>
              <p style={{ margin: "4px 2px 0", fontSize: 11, color: "var(--fg-4)" }}>
                El archivo solo se usa para vista previa; no se sube al servidor.
              </p>
            </Field>

            {sheets.length > 1 && (
              <Field label="Hoja">
                <select
                  value={activeSheet}
                  onChange={e => { setActiveSheet(e.target.value); setHoja(e.target.value); }}
                  style={inputStyle}
                >
                  {sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </Field>
            )}

            <Field label="Rango (A1)">
              <input
                value={rango}
                onChange={e => setRango(e.target.value.toUpperCase())}
                placeholder="ej. B5:E50"
                style={inputStyle}
              />
              <p style={{ margin: "4px 2px 0", fontSize: 11, color: "var(--fg-4)" }}>
                La primera fila del rango es la primera fila de datos (sin encabezado).
              </p>
            </Field>

            {parsedRange && (
              <Field label="Mapeo de columnas">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {columnas.map(c => (
                    <div key={c.col} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        flex: "0 0 80px", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
                        padding: "6px 8px", background: "var(--surface-2)", borderRadius: 6,
                        textAlign: "center",
                      }}>
                        Col {colLetter(parsedRange.start.col + c.col)}
                      </span>
                      <select
                        value={c.field}
                        onChange={e => setField(c.col, e.target.value as Field)}
                        style={{ ...inputStyle, flex: 1, height: 30 }}
                      >
                        {(Object.keys(FIELD_LABEL) as Field[]).map(f => (
                          <option key={f} value={f}>{FIELD_LABEL[f]}{REQUIRED_FIELDS.includes(f) ? " *" : ""}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {missingRequired.length > 0 && (
                  <p style={{
                    margin: "8px 2px 0", fontSize: 11, color: "var(--danger)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <AlertCircle size={11} /> Faltan: {missingRequired.map(f => FIELD_LABEL[f]).join(", ")}
                  </p>
                )}
              </Field>
            )}

            {err && (
              <div style={{
                padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--danger)", background: "var(--danger-bg, rgba(239,68,68,0.08))",
                color: "var(--danger)", fontSize: 12,
              }}>
                {err}
              </div>
            )}
          </div>

          {/* Right: spreadsheet preview */}
          <div style={{ flex: 1, minWidth: 0, padding: 16, overflow: "auto", background: "var(--surface-0)" }}>
            {grid ? (
              <SpreadsheetPreview grid={grid} range={parsedRange} />
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                height: "100%", color: "var(--fg-4)", gap: 8,
              }}>
                <FileSpreadsheet size={36} />
                <p style={{ fontSize: 13, margin: 0 }}>Sube un Excel de muestra para ver la cuadrícula.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 36, padding: "0 14px", borderRadius: 8,
              border: "none", background: "var(--brand)", color: "white",
              fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 700, color: "var(--fg-3)",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, padding: "0 10px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-1)",
  color: "var(--fg-1)", fontSize: 13, fontFamily: "inherit", outline: "none",
};

// ── Spreadsheet preview ──────────────────────────────────────────────────

interface SpreadsheetPreviewProps {
  grid:  SheetGrid;
  range: { start: { col: number; row: number }; end: { col: number; row: number } } | null;
}

function SpreadsheetPreview({ grid, range }: SpreadsheetPreviewProps) {
  // Compute display bounds: at least the range, with some surrounding context.
  const maxRows = Math.min(grid.rows.length, 60);
  const maxCols = Math.max(
    range ? range.end.col + 2 : 0,
    ...grid.rows.slice(0, maxRows).map(r => r.length),
  );

  function inRange(r: number, c: number): boolean {
    if (!range) return false;
    return r >= range.start.row && r <= range.end.row && c >= range.start.col && c <= range.end.col;
  }

  return (
    <div style={{ display: "inline-block", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-mono, monospace)" }}>
        <thead>
          <tr>
            <th style={cellHeaderStyle}></th>
            {Array.from({ length: maxCols }, (_, c) => (
              <th key={c} style={cellHeaderStyle}>{colLetter(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }, (_, r) => (
            <tr key={r}>
              <td style={{ ...cellHeaderStyle, textAlign: "right" }}>{r + 1}</td>
              {Array.from({ length: maxCols }, (_, c) => {
                const v = grid.rows[r]?.[c] ?? null;
                const hl = inRange(r, c);
                return (
                  <td key={c} style={{
                    padding: "3px 6px",
                    border: "1px solid var(--border)",
                    background: hl ? "var(--brand-tint)" : "var(--surface-1)",
                    color: hl ? "var(--brand-fg)" : "var(--fg-2)",
                    minWidth: 60, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {v == null ? "" : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellHeaderStyle: React.CSSProperties = {
  padding: "3px 6px", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--fg-4)",
  fontWeight: 600, fontSize: 10, textAlign: "center",
};
