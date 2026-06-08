"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Loader2, User, MapPin, Settings2,
  CalendarDays, Tag, Check, ChevronDown, Building2, Hash, FileUp, Plus, AlertTriangle,
  Camera, ImagePlus, Trash2, Upload, Paperclip, FileText, File, DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import { createOrden, buildDescripcion } from "@/lib/ordenes-api";
import { analytics } from "@/lib/analytics";
import { uploadFotoGrupo, createFotoGrupo, addFotoToGrupo } from "@/lib/foto-grupos-api";
import { uploadToR2 } from "@/lib/r2";
import { buildRecurrenciaConfig, RecurrenceControls, RECURRENCIAS } from "./RecurrenceControls";
import type {
  Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Prioridad, TipoTrabajo, Recurrencia, OTLink,
} from "@/types/ordenes";
import LinksInput from "@/components/LinksInput";
import CategoriaMultiSelect from "@/components/ordenes/CategoriaMultiSelect";

// ── PDF text extraction ───────────────────────────────────────────────────────
//
// We used to parse the Solicitud de Mantención PDF with workspace-specific
// regex (Electrilam's UdeC format). That broke for every other workspace's
// PDF layout. Now we just extract a clean token stream from the PDF and hand
// it off, together with the workspace catalog, to the escanear-orden edge
// function. Gemini both extracts the fields AND fuzzy-matches them against
// the catalog, returning ranked candidates with confidence scores per field.

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  // @ts-ignore
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) fullText += "\n";
      else if (fullText && !fullText.endsWith(" ") && !fullText.endsWith("\n")) fullText += " ";
      fullText += item.str;
      lastY = y;
    }
    fullText += "\n";
  }
  return fullText;
}

// ── AI scan result types ──────────────────────────────────────────────────────

interface ScanCandidate { id: string; name: string; confidence: number }
interface ScanField { extracted: string | null; candidates: ScanCandidate[] }
interface ScanResult {
  titulo:       string | null;
  n_ot:         string | null;
  solicitante:  string | null;
  descripcion:  string | null;
  prioridad:    Prioridad;
  tipo_trabajo: TipoTrabajo | "";
  fecha_inicio: string | null;
  sociedad:   ScanField;
  ubicacion:  ScanField;
  lugar:      ScanField;
  hito:       ScanField;
  categoria:  ScanField;
  activo:     ScanField;
  asignados:  ScanField[];
}

// Confidence tiers used to decide auto-fill vs. suggest vs. manual.
const AUTO_FILL_THRESHOLD = 0.9;
const SUGGEST_THRESHOLD   = 0.6;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  usuarios:    Usuario[];
  ubicaciones: Ubicacion[];
  lugares:     LugarEspecifico[];
  sociedades:  Sociedad[];
  activos:     Activo[];
  categorias:  CategoriaOT[];
  myId:        string;
  wsId:        string;
  onClose:     () => void;
  onCreated:   (orden: { id: string }) => void;
}

interface DraftFoto { file: File; preview: string; }
interface DraftGrupo { id: string; titulo: string; descripcion: string; fotos: DraftFoto[]; }
function genDraftId() { return Math.random().toString(36).slice(2); }

interface FormState {
  titulo:        string;
  n_ot:          string;
  solicitante:   string;
  hito:          string;
  presupuesto:   string;
  descripcion:   string;
  ubicacion_id:  string;
  lugar_id:      string;
  sociedad_id:   string;
  activo_id:     string;
  asignados_ids: string[];
  fecha_termino: string;
  fecha_inicio:  string;
  recurrencia_fin: string;
  recurrencia_intervalo: string;
  recurrencia_dias: number[];
  recurrencia_mes_dia: string;
  recurrencia:   Recurrencia;
  tipo_trabajo:  TipoTrabajo | "";
  prioridad:     Prioridad;
  categoria_id:  string;
  links:         OTLink[];
}

// Raw text from PDF that couldn't be resolved to an existing record
// After an AI scan, each catalog-bound field gets a ScanField. We keep only
// the fields that weren't auto-filled (medium-confidence suggestions to ask
// the user about, or low-confidence ones where we offer "Crear nuevo"). The
// caller drops the entry once the user picks or dismisses it.
interface PdfHints {
  sociedad?:  ScanField;
  ubicacion?: ScanField;
  lugar?:     ScanField;
  hito?:      ScanField;
  categoria?: ScanField;
  activo?:    ScanField;
  asignados?: ScanField[];
}

const BLANK: FormState = {
  titulo: "", n_ot: "", solicitante: "", hito: "", presupuesto: "", descripcion: "",
  ubicacion_id: "", lugar_id: "", sociedad_id: "",
  activo_id: "", asignados_ids: [],
  fecha_termino: "", fecha_inicio: "", recurrencia_fin: "",
  recurrencia_intervalo: "1", recurrencia_dias: [], recurrencia_mes_dia: "1",
  recurrencia: "ninguna", tipo_trabajo: "reactiva",
  prioridad: "ninguna", categoria_id: "",
  links: [],
};

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORIDADES: { value: Prioridad; label: string; activeColor: string }[] = [
  { value: "ninguna", label: "Ninguna", activeColor: "var(--fg-3)" },
  { value: "baja",    label: "Baja",    activeColor: "var(--fg-3)" },
  { value: "media",   label: "Media",   activeColor: "var(--brand)" },
  { value: "alta",    label: "Alta",    activeColor: "var(--warning)" },
  { value: "urgente", label: "Urgente", activeColor: "var(--danger)" },
];

const TIPOS: { value: TipoTrabajo; label: string }[] = [
  { value: "reactiva",      label: "Reactiva" },
  { value: "preventiva",    label: "Preventiva" },
  { value: "emergencia",    label: "Emergencia" },
  { value: "presupuesto",   label: "Presupuesto" },
  { value: "levantamiento", label: "Levantamiento" },
];

// ── Shared field row ──────────────────────────────────────────────────────────

// MaintainX-style field block: sentence-case label stacked above the control,
// no leading icon, rows separated by spacing rather than dividers. `icon` is
// kept as an optional prop so existing call sites compile unchanged (ignored).
function FieldRow({ label, children }: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-2)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Searchable select ─────────────────────────────────────────────────────────

function SearchSelect({ placeholder, value, options, onChange }: {
  placeholder: string;
  value: string;
  options: { id: string; label: string; sub?: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.sub ?? "").toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 13, color: selected ? "var(--fg-1)" : "var(--fg-4)",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
                background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", fontSize: 13, color: "var(--fg-4)",
                background: !value ? "var(--brand-tint)" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Sin asignar
            </button>
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", textAlign: "left",
                  padding: "10px 12px", fontSize: 13,
                  background: value === o.id ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {value === o.id && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--fg-1)" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assignee select ───────────────────────────────────────────────────────────

// ── PdfSuggestion ─────────────────────────────────────────────────────────────
//
// Renders the medium-/low-confidence AI match for a single catalog field as
// an inline card under the corresponding form input. Three states:
//   - candidates with confidence >= SUGGEST_THRESHOLD → list, user picks one
//   - no candidates but extracted text → "Crear nuevo «text»" + dismiss
//   - both → list THEN "Crear nuevo" at the bottom
function PdfSuggestion({
  field, extractedLabel, onPick, onCreate, onDismiss, canCreate,
}: {
  field: ScanField;
  extractedLabel: string;
  onPick: (id: string) => void;
  onCreate?: () => void;
  onDismiss: () => void;
  canCreate: boolean;
}) {
  const usable = field.candidates.filter(c => c.confidence >= SUGGEST_THRESHOLD);
  if (usable.length === 0 && !field.extracted) return null;

  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--warning-bg, #FFFBEB)", border: "1px solid var(--warning, #F59E0B)", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: usable.length > 0 ? 8 : 0 }}>
        <AlertTriangle size={12} style={{ color: "var(--warning, #F59E0B)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)" }}>
          IA detectó <strong>"{field.extracted ?? extractedLabel}"</strong>
          {usable.length > 0 ? " — ¿es alguno de estos?" : " — sin coincidencias"}
        </span>
        <button type="button" onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 2 }}>
          <X size={12} />
        </button>
      </div>
      {usable.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {usable.map(c => (
            <button key={c.id} type="button" onClick={() => onPick(c.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12.5, color: "var(--fg-1)" }}>
              <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 10.5, color: "var(--fg-4)", flexShrink: 0 }}>{Math.round(c.confidence * 100)}%</span>
            </button>
          ))}
        </div>
      )}
      {canCreate && field.extracted && onCreate && (
        <button type="button" onClick={onCreate}
          style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", border: "1px dashed var(--brand)", borderRadius: 6, background: "transparent", color: "var(--brand)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Plus size={11} /> Crear «{field.extracted}»
        </button>
      )}
    </div>
  );
}

function AssigneeSelect({ usuarios, value, onChange }: {
  usuarios: Usuario[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = usuarios.filter(u => u.nombre.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function initials(name: string) {
    const p = name.trim().split(/\s+/);
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
    setOpen(false);
  }

  const selected = value.map(id => usuarios.find(u => u.id === id)).filter(Boolean) as Usuario[];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {selected.map(u => (
            <span key={u.id} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 7px 2px 4px",
              background: "var(--brand-tint)", borderRadius: 20,
              fontSize: 11.5, color: "var(--brand)",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "var(--brand)", color: "var(--fg-on-brand)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700,
              }}>
                {initials(u.nombre)}
              </span>
              {u.nombre}
              <button type="button" onClick={() => toggle(u.id)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--brand)", display: "flex", padding: 0, lineHeight: 1,
              }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 13, color: "var(--fg-4)",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <User size={13} />
        Asignar técnico
        <ChevronDown size={12} style={{ color: "var(--fg-4)", marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, zIndex: 200,
          minWidth: 220, background: "var(--surface-1)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar por nombre…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
                background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.map(u => {
              const sel = value.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 12px",
                    background: sel ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: sel ? "var(--brand)" : "var(--surface-hover)",
                    color: sel ? "var(--fg-on-brand)" : "var(--fg-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(u.nombre)}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)" }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-4)", textTransform: "capitalize" }}>{u.rol}</div>
                  </div>
                  {sel && <Check size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HitoSelect ───────────────────────────────────────────────────────────────

function HitoSelect({ value, onChange, wsId }: {
  value: string;
  onChange: (v: string) => void;
  wsId: string;
}) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [hitos, setHitos]       = useState<{ id: string; nombre: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb.from("hitos").select("id, nombre")
      .eq("workspace_id", wsId).order("nombre");
    setHitos(data ?? []);
  }, [wsId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = hitos.filter(h => h.nombre.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = hitos.some(h => h.nombre.toLowerCase() === query.toLowerCase().trim());
  const canCreate = query.trim().length > 0 && !exactMatch;

  async function handleCreate() {
    const nombre = query.trim();
    if (!nombre) return;
    setCreating(true);
    try {
      const sb = createClient();
      const { data } = await sb.from("hitos").insert({ workspace_id: wsId, nombre })
        .select("id, nombre").single();
      if (data) {
        setHitos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        onChange(data.nombre);
        setQuery("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 13, color: value ? "var(--fg-1)" : "var(--fg-4)",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "Seleccionar o crear hito…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar o crear…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 12.5, outline: "none", color: "var(--fg-1)",
                fontFamily: "inherit", boxSizing: "border-box", background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, color: "var(--fg-4)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                Quitar hito
              </button>
            )}
            {filtered.map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => { onChange(h.nombre); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 13,
                  background: value === h.nombre ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--fg-1)",
                }}
              >
                {value === h.nombre && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                {h.nombre}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 13, fontWeight: 600,
                  background: "var(--brand-tint)", color: "var(--brand)",
                  border: "none", borderTop: "1px solid var(--border)",
                  cursor: creating ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin hitos</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SolicitanteSelect ─────────────────────────────────────────────────────────
// Searchable picker backed by the `solicitantes` catalog (same pattern as
// HitoSelect / the mobile solicitante-list). Stores the chosen *name* string,
// matching how mobile stores it — avoids the free-text duplication problem.

function SolicitanteSelect({ value, onChange, wsId }: {
  value: string;
  onChange: (v: string) => void;
  wsId: string;
}) {
  const [open, setOpen]                 = useState(false);
  const [query, setQuery]               = useState("");
  const [solicitantes, setSolicitantes] = useState<{ id: string; nombre: string }[]>([]);
  const [creating, setCreating]         = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb.from("solicitantes").select("id, nombre")
      .eq("workspace_id", wsId).order("nombre");
    setSolicitantes(data ?? []);
  }, [wsId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = solicitantes.filter(s => s.nombre.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = solicitantes.some(s => s.nombre.toLowerCase() === query.toLowerCase().trim());
  const canCreate = query.trim().length > 0 && !exactMatch;

  async function handleCreate() {
    const nombre = query.trim();
    if (!nombre) return;
    setCreating(true);
    try {
      const sb = createClient();
      const { data } = await sb.from("solicitantes").insert({ workspace_id: wsId, nombre })
        .select("id, nombre").single();
      if (data) {
        setSolicitantes(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        onChange(data.nombre);
        setQuery("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 13, color: value ? "var(--fg-1)" : "var(--fg-4)",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "Seleccionar o crear solicitante…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar o crear…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 12.5, outline: "none", color: "var(--fg-1)",
                fontFamily: "inherit", boxSizing: "border-box", background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, color: "var(--fg-4)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                Quitar solicitante
              </button>
            )}
            {filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.nombre); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 13,
                  background: value === s.nombre ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--fg-1)",
                }}
              >
                {value === s.nombre && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                {s.nombre}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 13, fontWeight: 600,
                  background: "var(--brand-tint)", color: "var(--brand)",
                  border: "none", borderTop: "1px solid var(--border)",
                  cursor: creating ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin solicitantes</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LocationSelect (search + create for ubicaciones) ──────────────────────────

function LocationSelect({ value, options, onChange, wsId, onCreated: onUbicCreated }: {
  value: string;
  options: { id: string; label: string; sub?: string }[];
  onChange: (id: string) => void;
  wsId: string;
  onCreated: (u: Ubicacion) => void;
}) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected   = options.find(o => o.id === value);
  const filtered   = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = options.some(o => o.label.toLowerCase() === query.toLowerCase().trim());
  const canCreate  = query.trim().length > 1 && !exactMatch;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function handleCreate() {
    const nombre = query.trim();
    if (!nombre) return;
    setCreating(true);
    try {
      const sb = createClient();
      const { data } = await sb
        .from("ubicaciones")
        .insert({ workspace_id: wsId, edificio: nombre, activa: true })
        .select("id,edificio,detalle,activa,sociedad_id")
        .single();
      if (data) {
        onUbicCreated(data as Ubicacion);
        onChange(data.id);
        setQuery("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => { setOpen(!open); setQuery(""); }}
        style={{ width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 13, color: selected ? "var(--fg-1)" : "var(--fg-4)", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : "Buscar o crear ubicación…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input autoFocus placeholder="Buscar o crear…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", color: "var(--fg-1)", fontFamily: "inherit", background: "var(--surface-1)" }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, color: "var(--fg-4)", background: !value ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              Sin asignar
            </button>
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, background: value === o.id ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {value === o.id && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--fg-1)" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {canCreate && (
              <button type="button" onClick={handleCreate} disabled={creating}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", fontSize: 13, fontWeight: 600, background: "var(--brand-tint)", color: "var(--brand)", border: "none", borderTop: "1px solid var(--border)", cursor: creating ? "default" : "pointer", fontFamily: "inherit" }}>
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LugarSelect (search + create for lugares específicos) ──────────────────────

function LugarSelect({ value, options, onChange, wsId, ubicacion_id, onCreated: onLugarCreated }: {
  value: string;
  options: { id: string; label: string; sub?: string }[];
  onChange: (id: string) => void;
  wsId: string;
  ubicacion_id: string;
  onCreated: (l: LugarEspecifico) => void;
}) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected   = options.find(o => o.id === value);
  const filtered   = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = options.some(o => o.label.toLowerCase() === query.toLowerCase().trim());
  const canCreate  = query.trim().length > 1 && !exactMatch;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function handleCreate() {
    const nombre = query.trim();
    if (!nombre) return;
    setCreating(true);
    try {
      const sb = createClient();
      const { data } = await sb
        .from("lugares")
        .insert({ workspace_id: wsId, nombre, ubicacion_id: ubicacion_id || null, activo: true })
        .select("id,nombre,ubicacion_id,activo,imagen_url,descripcion,workspace_id,created_at")
        .single();
      if (data) {
        onLugarCreated(data as LugarEspecifico);
        onChange(data.id);
        setQuery("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => { setOpen(!open); setQuery(""); }}
        style={{ width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 13, color: selected ? "var(--fg-1)" : "var(--fg-4)", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : "Buscar o crear lugar…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input autoFocus placeholder="Buscar o crear…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", color: "var(--fg-1)", fontFamily: "inherit", background: "var(--surface-1)" }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, color: "var(--fg-4)", background: !value ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              Sin asignar
            </button>
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, background: value === o.id ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {value === o.id && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--fg-1)" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {canCreate && (
              <button type="button" onClick={handleCreate} disabled={creating}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", fontSize: 13, fontWeight: 600, background: "var(--brand-tint)", color: "var(--brand)", border: "none", borderTop: "1px solid var(--border)", cursor: creating ? "default" : "pointer", fontFamily: "inherit" }}>
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OTCrearPanel({
  usuarios, ubicaciones: initialUbicaciones, lugares: initialLugares, sociedades, activos, categorias,
  myId, wsId, onClose, onCreated,
}: Props) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<DraftGrupo[]>([]);
  const grupoFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const adjuntoInputRef = useRef<HTMLInputElement | null>(null);
  const [adjuntos, setAdjuntos] = useState<{ file: File; nombre: string }[]>([]);

  // Local copies so newly created records appear immediately without a full reload
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>(initialUbicaciones);
  const [lugares, setLugares]         = useState<LugarEspecifico[]>(initialLugares);

  // PDF-suggested values that couldn't be auto-resolved
  const [pdfHints, setPdfHints] = useState<PdfHints | null>(null);

  // Categorías — multi-select (MaintainX/mobile parity). `categoria_id` keeps
  // the first pick (what list/detail still read); the full set is persisted to
  // the `categoria_ids` array column.
  const [categoriaIds, setCategoriaIds] = useState<string[]>([]);
  function toggleCategoria(id: string) {
    setCategoriaIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  // AI/PDF import auto-fills form.categoria_id — reflect it in the multi-select.
  useEffect(() => {
    if (form.categoria_id && !categoriaIds.includes(form.categoria_id)) {
      setCategoriaIds(prev => [...prev, form.categoria_id]);
    }
  }, [form.categoria_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced duplicate N° OT check
  useEffect(() => {
    const nOT = form.n_ot.trim();
    if (!nOT) { setDupWarning(null); return; }
    const timer = setTimeout(async () => {
      const sb = createClient();
      const { data } = await sb
        .from("ordenes_trabajo")
        .select("id, titulo")
        .eq("workspace_id", wsId)
        .eq("n_serie", nOT)
        .limit(1);
      if (data && data.length > 0) {
        setDupWarning(data[0].titulo ?? "Sin título");
      } else {
        setDupWarning(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.n_ot, wsId]);

  async function handlePDFImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAdjuntos(prev => prev.some(a => a.file === file) ? prev : [...prev, { file, nombre: file.name }]);
    setParsing(true);
    setParseMsg(null);
    setPdfHints(null);
    try {
      // 1. Extract raw text from the PDF (workspace-agnostic).
      const pdfText = await extractPdfText(file);
      if (!pdfText.trim()) {
        setParseMsg("No se pudo leer texto del PDF. ¿Es un PDF escaneado como imagen?");
        return;
      }

      // 2. Load the catalogs the AI needs to resolve fields against.
      const sb = createClient();
      const [hitosRes] = await Promise.all([
        sb.from("hitos").select("id, nombre").eq("workspace_id", wsId),
      ]);
      const hitosCatalog = (hitosRes.data ?? []).map(h => ({ id: h.id, name: h.nombre }));

      const catalog = {
        sociedades:  sociedades.map(s => ({ id: s.id, name: s.nombre })),
        ubicaciones: ubicaciones.map(u => ({
          id: u.id,
          name: u.edificio + (u.detalle ? ` · ${u.detalle}` : ""),
        })),
        lugares:     lugares.map(l => ({ id: l.id, name: l.nombre })),
        hitos:       hitosCatalog,
        categorias:  categorias.map(c => ({ id: c.id, name: c.nombre })),
        usuarios:    usuarios.map(u => ({ id: u.id, name: u.nombre })),
        activos:     activos.map(a => ({ id: a.id, name: a.nombre })),
      };

      // 3. Ask Gemini to extract + resolve.
      const res = await callEdge("escanear-orden", { pdfText, catalog });
      if (!res.ok) {
        setParseMsg(`Error al analizar el PDF (${res.status}). Intenta de nuevo.`);
        return;
      }
      const ai = (await res.json()) as ScanResult | { error: string };
      if ("error" in ai) {
        setParseMsg(`IA: ${ai.error}`);
        return;
      }

      // 4. Apply non-catalog text fields directly.
      const patch: Partial<FormState> = {};
      if (ai.titulo)       patch.titulo       = ai.titulo;
      if (ai.n_ot)         patch.n_ot         = ai.n_ot;
      if (ai.solicitante)  patch.solicitante  = ai.solicitante;
      if (ai.descripcion)  patch.descripcion  = ai.descripcion;
      if (ai.prioridad && ai.prioridad !== "ninguna") patch.prioridad = ai.prioridad;
      if (ai.tipo_trabajo) patch.tipo_trabajo = ai.tipo_trabajo;
      if (ai.fecha_inicio) patch.fecha_inicio = ai.fecha_inicio;

      // 5. Apply catalog fields by confidence tier.
      const remainingHints: PdfHints = {};

      const applyField = (
        field: ScanField,
        key: keyof FormState,
        hintKey: keyof PdfHints,
        valueFromCandidate: (c: ScanCandidate) => string = (c) => c.id,
      ) => {
        const top = field.candidates[0];
        if (top && top.confidence >= AUTO_FILL_THRESHOLD) {
          (patch as any)[key] = valueFromCandidate(top);
          return;
        }
        // Medium-confidence suggestion OR an extracted value with no match worth offering "Crear nuevo".
        const hasMediumSuggestion = top && top.confidence >= SUGGEST_THRESHOLD;
        if (hasMediumSuggestion || field.extracted) {
          (remainingHints as any)[hintKey] = field;
        }
      };

      applyField(ai.sociedad,  "sociedad_id",  "sociedad");
      applyField(ai.ubicacion, "ubicacion_id", "ubicacion");
      // For lugar, scope auto-fill: only accept the top candidate if it belongs to whatever
      // ubicación we just resolved (or no ubicación was resolved).
      {
        const top = ai.lugar.candidates[0];
        const resolvedUbic = (patch as any).ubicacion_id ?? form.ubicacion_id;
        const topLugar = top ? lugares.find(l => l.id === top.id) : null;
        const lugarBelongs = !resolvedUbic || !topLugar || !topLugar.ubicacion_id || topLugar.ubicacion_id === resolvedUbic;
        if (top && top.confidence >= AUTO_FILL_THRESHOLD && lugarBelongs) {
          patch.lugar_id = top.id;
        } else if ((top && top.confidence >= SUGGEST_THRESHOLD) || ai.lugar.extracted) {
          remainingHints.lugar = ai.lugar;
        }
      }
      applyField(ai.hito,      "hito",         "hito", (c) => c.name);
      applyField(ai.categoria, "categoria_id", "categoria");
      applyField(ai.activo,    "activo_id",    "activo");

      // Asignados is multi-pick: auto-add every high-confidence person, surface the rest.
      const autoAsignados: string[] = [];
      const mediumAsignados: ScanField[] = [];
      for (const person of ai.asignados ?? []) {
        const top = person.candidates[0];
        if (top && top.confidence >= AUTO_FILL_THRESHOLD) {
          if (!autoAsignados.includes(top.id)) autoAsignados.push(top.id);
        } else if ((top && top.confidence >= SUGGEST_THRESHOLD) || person.extracted) {
          mediumAsignados.push(person);
        }
      }
      if (autoAsignados.length > 0) {
        patch.asignados_ids = Array.from(new Set([...(form.asignados_ids ?? []), ...autoAsignados]));
      }
      if (mediumAsignados.length > 0) remainingHints.asignados = mediumAsignados;

      const filled = Object.values(patch).filter(v => v && v !== "ninguna" && v !== "").length;
      if (filled === 0 && Object.keys(remainingHints).length === 0) {
        setParseMsg("No se encontraron datos en el PDF.");
      } else {
        setForm(prev => ({ ...prev, ...patch }));
        const hintCount = Object.keys(remainingHints).length;
        const hintNote = hintCount > 0 ? ` ${hintCount} sugerencia${hintCount === 1 ? "" : "s"} para revisar.` : "";
        setParseMsg(`PDF importado — ${filled} campo${filled === 1 ? "" : "s"} completado${filled === 1 ? "" : "s"}.${hintNote}`);
      }
      if (Object.keys(remainingHints).length > 0) setPdfHints(remainingHints);
    } catch (err) {
      setParseMsg(`Error al leer el PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setParsing(false);
    }
  }

  // Accept a suggestion: write the picked candidate to the form and remove
  // the hint. If `candidateId === null` the user dismissed it without picking.
  function resolveHint(hintKey: keyof PdfHints, candidateId: string | null) {
    setPdfHints(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      delete (next as any)[hintKey];
      return Object.keys(next).length === 0 ? null : next;
    });
    if (!candidateId) return;
    if (hintKey === "sociedad")  setF("sociedad_id",  candidateId);
    if (hintKey === "ubicacion") setForm(prev => ({ ...prev, ubicacion_id: candidateId, lugar_id: "" }));
    if (hintKey === "lugar")     setF("lugar_id",     candidateId);
    if (hintKey === "hito") {
      // hito is stored by name, not id — look up the candidate's name in the hint.
      const hint = pdfHints?.hito;
      const cand = hint?.candidates.find(c => c.id === candidateId);
      if (cand) setF("hito", cand.name);
    }
    if (hintKey === "categoria") setF("categoria_id", candidateId);
    if (hintKey === "activo")    setF("activo_id",    candidateId);
  }

  function resolveAsignadoHint(personIndex: number, candidateId: string | null) {
    setPdfHints(prev => {
      if (!prev?.asignados) return prev;
      const next = { ...prev };
      const arr = (next.asignados ?? []).filter((_, i) => i !== personIndex);
      if (arr.length === 0) delete next.asignados;
      else next.asignados = arr;
      return Object.keys(next).length === 0 ? null : next;
    });
    if (!candidateId) return;
    setForm(prev => ({
      ...prev,
      asignados_ids: prev.asignados_ids.includes(candidateId)
        ? prev.asignados_ids
        : [...prev.asignados_ids, candidateId],
    }));
  }

  // Create a new catalog entity from the extracted text and assign it.
  async function createFromHint(hintKey: "sociedad" | "ubicacion" | "lugar" | "hito") {
    const hint = pdfHints?.[hintKey];
    if (!hint?.extracted) return;
    const name = hint.extracted;
    const sb = createClient();
    if (hintKey === "sociedad") {
      const { data } = await sb.from("sociedades")
        .insert({ workspace_id: wsId, nombre: name, activa: true })
        .select("id, nombre, activa, imagen_url, workspace_id").single();
      if (data) {
        // Don't mutate the parent's sociedades list; just write the id.
        setF("sociedad_id", data.id);
        resolveHint("sociedad", null);
      }
    } else if (hintKey === "ubicacion") {
      const { data } = await sb.from("ubicaciones")
        .insert({ workspace_id: wsId, edificio: name, activa: true })
        .select("id, edificio, detalle, activa, sociedad_id").single();
      if (data) {
        setUbicaciones(prev => [...prev, data as Ubicacion]);
        setForm(prev => ({ ...prev, ubicacion_id: data.id, lugar_id: "" }));
        resolveHint("ubicacion", null);
      }
    } else if (hintKey === "lugar") {
      const { data } = await sb.from("lugares")
        .insert({ workspace_id: wsId, nombre: name, ubicacion_id: form.ubicacion_id || null, activo: true })
        .select("id, nombre, ubicacion_id, activo, imagen_url, descripcion, workspace_id, created_at").single();
      if (data) {
        setLugares(prev => [...prev, data as LugarEspecifico]);
        setForm(prev => ({ ...prev, lugar_id: data.id }));
        resolveHint("lugar", null);
      }
    } else if (hintKey === "hito") {
      const { data } = await sb.from("hitos")
        .insert({ workspace_id: wsId, nombre: name })
        .select("id, nombre").single();
      if (data) {
        setF("hito", data.nombre);
        resolveHint("hito", null);
      }
    }
  }

  function setF<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      if (key === "ubicacion_id") next.lugar_id = "";
      return next;
    });
  }

  const ubicOptions = ubicaciones.map(u => ({
    id: u.id,
    label: u.edificio + (u.detalle ? ` · ${u.detalle}` : ""),
    sub: u.sociedades?.nombre,
  }));

  const lugarOptions = lugares
    .filter(l => !form.ubicacion_id || l.ubicacion_id === form.ubicacion_id || l.id === form.lugar_id)
    .map(l => ({
      id: l.id,
      label: l.nombre,
      sub: l.ubicaciones?.edificio,
    }));

  const sociedadOptions = sociedades.map(s => ({
    id: s.id,
    label: s.nombre,
  }));

  const activoOptions = activos.map(a => ({
    id: a.id,
    label: a.nombre + (a.numero_serie ? ` (${a.numero_serie})` : ""),
  }));

  function addGrupo() {
    setGrupos(prev => [...prev, { id: genDraftId(), titulo: "", descripcion: "", fotos: [] }]);
  }
  function removeGrupo(id: string) {
    setGrupos(prev => prev.filter(g => g.id !== id));
  }
  function updateGrupo(id: string, patch: Partial<Pick<DraftGrupo, "titulo" | "descripcion">>) {
    setGrupos(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  }
  function addFotosToGrupo(id: string, files: FileList) {
    const newFotos: DraftFoto[] = Array.from(files).map(file => ({ file, preview: URL.createObjectURL(file) }));
    setGrupos(prev => prev.map(g => g.id === id ? { ...g, fotos: [...g.fotos, ...newFotos] } : g));
  }
  function removeFotoFromDraftGrupo(grupoId: string, idx: number) {
    setGrupos(prev => prev.map(g => {
      if (g.id !== grupoId) return g;
      const next = [...g.fotos];
      URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return { ...g, fotos: next };
    }));
  }

  const save = async () => {
    if (!form.titulo.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const orden = await createOrden({
        workspaceId:   wsId,
        creadoPor:     myId,
        titulo:        form.titulo.trim(),
        descripcion:   buildDescripcion({ nOT: form.n_ot, solicitante: form.solicitante, hito: form.hito, body: form.descripcion }),
        n_serie:       form.n_ot.trim()          || null,
        solicitante:   form.solicitante.trim()  || null,
        hito:          form.hito.trim()         || null,
        presupuesto:   form.presupuesto.trim()  || null,
        prioridad:     form.prioridad,
        tipo_trabajo:  form.tipo_trabajo,
        clasificacion: form.tipo_trabajo === "levantamiento" ? "levantamiento" : form.tipo_trabajo ? "ejecucion" : undefined,
        categoria_id:  categoriaIds[0] ?? null,
        categoria_ids: categoriaIds.length > 0 ? categoriaIds : null,
        recurrencia:   form.recurrencia,
        recurrencia_config: buildRecurrenciaConfig(form),
        ubicacion_id:  form.ubicacion_id  || null,
        lugar_id:      form.lugar_id      || null,
        sociedad_id:   form.sociedad_id   || null,
        activo_id:     form.activo_id     || null,
        asignados_ids: form.asignados_ids.length > 0 ? form.asignados_ids : null,
        fecha_inicio:  form.fecha_inicio  || null,
        fecha_termino: form.fecha_termino || null,
        links:         form.links,
      });

      // Upload file attachments (best-effort)
      if (adjuntos.length > 0) {
        const adjuntoLinks: OTLink[] = [];
        for (const a of adjuntos) {
          try {
            const url = await uploadToR2(a.file, `ordenes/${orden.id}/adjuntos`);
            adjuntoLinks.push({ url, nombre: a.nombre, tipo: "archivo" });
          } catch { /* non-fatal */ }
        }
        if (adjuntoLinks.length > 0) {
          const sb = createClient();
          await sb.from("ordenes_trabajo").update({ links: adjuntoLinks }).eq("id", orden.id);
        }
      }

      // Upload photo groups (best-effort, don't block on errors)
      for (let gi = 0; gi < grupos.length; gi++) {
        const g = grupos[gi];
        if (!g.titulo.trim() && g.fotos.length === 0) continue;
        try {
          const grupo = await createFotoGrupo(orden.id, wsId, myId, g.titulo.trim() || `Grupo ${gi + 1}`, g.descripcion.trim(), gi, "referencia");
          for (let fi = 0; fi < g.fotos.length; fi++) {
            const url = await uploadFotoGrupo(orden.id, g.fotos[fi].file);
            await addFotoToGrupo(grupo.id, url, fi);
          }
        } catch { /* don't block OT creation */ }
      }

      analytics.otCreated({
        ot_id: orden.id,
        workspace_id: wsId,
        tipo_trabajo: form.tipo_trabajo || "sin_tipo",
        prioridad: form.prioridad,
        recurrencia: form.recurrencia,
        asignados_count: form.asignados_ids.length,
      });

      onCreated(orden);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la orden.");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-1)" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>
          Nueva Orden de Trabajo
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePDFImport} />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={parsing}
            title="Importar desde PDF de Solicitud de Mantención"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              height: 36, padding: "0 12px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--brand-tint)", color: "var(--brand)",
              fontSize: 12, fontWeight: 600, cursor: parsing ? "default" : "pointer",
              fontFamily: "inherit", transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (!parsing) e.currentTarget.style.background = "var(--brand-tint)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--brand-tint)"; }}
          >
            {parsing
              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              : <FileUp size={12} />
            }
            {parsing ? "Leyendo…" : "Importar PDF"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", cursor: "pointer", color: "var(--fg-3)",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Parse feedback banner */}
      {parseMsg && (
        <div style={{
          padding: "10px 28px", fontSize: 12.5, flexShrink: 0,
          background: parseMsg.startsWith("No se") || parseMsg.startsWith("Error") ? "var(--danger-bg)" : "var(--success-bg)",
          color: parseMsg.startsWith("No se") || parseMsg.startsWith("Error") ? "var(--danger)" : "var(--success)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {parseMsg}
          <button type="button" onClick={() => setParseMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 2 }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Scrollable form body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "28px 28px 120px", maxWidth: 1180 }}>

          {/* Title */}
          <div style={{ marginBottom: 24 }}>
            <input
              type="text"
              placeholder="¿Qué trabajo se debe realizar?"
              value={form.titulo}
              onChange={e => setF("titulo", e.target.value)}
              style={{
                width: "100%", fontSize: 22, fontWeight: 400,
                color: "var(--fg-1)", border: "none", outline: "none",
                background: "transparent", padding: "8px 0",
                borderBottom: "2px solid " + (form.titulo ? "var(--brand)" : "var(--border)"),
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 18 }}>
            <textarea
              placeholder="Agregue una descripción"
              value={form.descripcion}
              onChange={e => setF("descripcion", e.target.value)}
              rows={3}
              style={{
                width: "100%", fontSize: 14, color: "var(--fg-1)",
                border: "1px solid var(--border)", borderRadius: 8,
                padding: "12px 14px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.7, minHeight: 108,
              }}
            />
          </div>

          {/* Work type — promoted near the top so it's set before scrolling. */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)", marginBottom: 8 }}>
              Tipo de trabajo
            </div>
            <select
              value={form.tipo_trabajo}
              onChange={e => setF("tipo_trabajo", e.target.value as TipoTrabajo | "")}
              style={{
                width: "100%", height: 40, padding: "0 12px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 13, color: "var(--fg-1)", outline: "none",
                background: "var(--surface-1)", fontFamily: "inherit",
              }}
            >
              {TIPOS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Photo groups */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Camera size={13} style={{ color: "var(--fg-3)" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)" }}>
                  Grupos de fotos
                </span>
              </div>
              <button
                type="button"
                onClick={addGrupo}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  height: 32, padding: "0 12px",
                  border: "1px solid var(--brand)", borderRadius: 8,
                  background: "var(--brand-tint)", color: "var(--brand)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Plus size={11} />
                Agregar grupo
              </button>
            </div>

            {grupos.length === 0 ? (
              <button
                type="button"
                onClick={addGrupo}
                style={{
                  width: "100%", border: "1.5px dashed var(--brand)", borderRadius: 8,
                  padding: "18px", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 5, color: "var(--brand)", cursor: "pointer",
                  background: "var(--brand-tint)", fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                <ImagePlus size={20} strokeWidth={1.5} />
                <span style={{ fontSize: 12 }}>Agregar fotos con título y descripción</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>Ej: "Antes del trabajo", "Instrucciones"</span>
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {grupos.map((g, gi) => (
                  <div key={g.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface-1)" }}>
                    {/* Group header */}
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-0)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          type="text"
                          placeholder={`Título del grupo (ej. Fotos del trabajo)`}
                          value={g.titulo}
                          onChange={e => updateGrupo(g.id, { titulo: e.target.value })}
                          style={{
                            width: "100%", height: 36, padding: "0 10px",
                            border: "1px solid var(--border)", borderRadius: 8,
                            fontSize: 12.5, fontWeight: 600, color: "var(--fg-1)",
                            outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                        />
                        <input
                          type="text"
                          placeholder="Descripción o instrucciones (opcional)"
                          value={g.descripcion}
                          onChange={e => updateGrupo(g.id, { descripcion: e.target.value })}
                          style={{
                            width: "100%", height: 36, padding: "0 10px",
                            border: "1px solid var(--border)", borderRadius: 8,
                            fontSize: 12, color: "var(--fg-2)",
                            outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGrupo(g.id)}
                        style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 8, cursor: "pointer", color: "var(--danger)", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Photo grid */}
                    <div style={{ padding: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 10 }}>
                        {g.fotos.map((f, fi) => (
                          <div key={fi} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "var(--surface-hover)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                              type="button"
                              onClick={() => removeFotoFromDraftGrupo(g.id, fi)}
                              style={{
                                position: "absolute", top: 3, right: 3,
                                width: 18, height: 18, borderRadius: "50%",
                                background: "rgba(0,0,0,0.6)", border: "none",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", color: "#fff",
                              }}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => grupoFileRefs.current[g.id]?.click()}
                          style={{
                            aspectRatio: "1", border: "1.5px dashed var(--border)", borderRadius: 8,
                            background: "var(--surface-0)", display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: 3,
                            cursor: "pointer", color: "var(--fg-4)",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-4)"; }}
                        >
                          <Upload size={14} />
                          <span style={{ fontSize: 9, fontWeight: 500 }}>Fotos</span>
                        </button>
                        <input
                          ref={el => { grupoFileRefs.current[g.id] = el; }}
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ display: "none" }}
                          onChange={e => { if (e.target.files?.length) { addFotosToGrupo(g.id, e.target.files); e.target.value = ""; } }}
                        />
                      </div>
                      {g.fotos.length > 0 && (
                        <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--fg-4)" }}>
                          {g.fotos.length} foto{g.fotos.length !== 1 ? "s" : ""} · Se subirán al crear la OT
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addGrupo}
                  style={{
                    width: "100%", padding: "12px", border: "1.5px dashed var(--brand)", borderRadius: 8,
                    background: "var(--brand-tint)", color: "var(--brand)", fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >
                  <Plus size={12} />
                  Agregar otro grupo
                </button>
              </div>
            )}
          </div>

          {/* Adjuntos */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Paperclip size={13} style={{ color: "var(--fg-3)" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)" }}>
                  Adjuntos
                </span>
              </div>
              <button
                type="button"
                onClick={() => adjuntoInputRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  height: 32, padding: "0 12px",
                  border: "1px solid var(--brand)", borderRadius: 8,
                  background: "var(--brand-tint)", color: "var(--brand)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Plus size={11} />
                Adjuntar archivo
              </button>
              <input
                ref={adjuntoInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.dwg,.dxf,.zip,.mp3,.m4a,.wav,.ogg,.webm,image/*,audio/*"
                style={{ display: "none" }}
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  setAdjuntos(prev => [...prev, ...files.map(f => ({ file: f, nombre: f.name }))]);
                  e.target.value = "";
                }}
              />
            </div>
            {adjuntos.length === 0 ? (
              <button
                type="button"
                onClick={() => adjuntoInputRef.current?.click()}
                style={{
                  width: "100%", border: "1.5px dashed var(--brand)", borderRadius: 8,
                  padding: "18px", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 4, color: "var(--brand)", cursor: "pointer",
                  background: "var(--brand-tint)", fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                <Paperclip size={18} strokeWidth={1.5} />
                <span style={{ fontSize: 12 }}>PDF, Word, Excel, TXT, CSV, DWG, MP3, M4A…</span>
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adjuntos.map((a, i) => {
                  const ext = a.file.name.split(".").pop()?.toLowerCase() ?? "";
                  const isDoc = ["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","dwg","dxf"].includes(ext);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
                      {isDoc
                        ? <FileText size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
                        : <File size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
                      <input
                        type="text"
                        value={a.nombre}
                        onChange={e => setAdjuntos(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))}
                        style={{
                          flex: 1, fontSize: 12.5, color: "var(--fg-1)", border: "none",
                          outline: "none", background: "transparent", fontFamily: "inherit", minWidth: 0,
                        }}
                      />
                      <span style={{ fontSize: 10.5, color: "var(--fg-4)", flexShrink: 0 }}>
                        {(a.file.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdjuntos(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 2, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => adjuntoInputRef.current?.click()}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "10px 0", background: "none", border: "none",
                    cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--fg-4)", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
                >
                  <Plus size={11} />
                  Agregar más archivos
                </button>
              </div>
            )}
          </div>

          {/* Links */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-2)", marginBottom: 10 }}>
              Links
            </label>
            <LinksInput
              links={form.links}
              onChange={links => setF("links", links)}
            />
          </div>

          {/* N° OT + Solicitante + Hito */}
          <FieldRow icon={<Hash size={14} />} label="N° de OT">
            <input
              type="text"
              placeholder="Ej: SF920260325921"
              value={form.n_ot}
              onChange={e => setF("n_ot", e.target.value)}
              style={{ width:"100%", height:40, padding:"0 12px", border:`1px solid ${dupWarning ? "var(--warning)" : "var(--border)"}`, borderRadius:8, fontSize:13, color:"var(--fg-1)", outline:"none", fontFamily:"monospace", background:"var(--surface-1)" }}
            />
            {dupWarning && (
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6, padding:"6px 10px", borderRadius:6, background:"var(--warning-bg, #FFFBEB)", border:"1px solid var(--warning)" }}>
                <AlertTriangle size={13} style={{ color:"var(--warning)", flexShrink:0 }} />
                <span style={{ fontSize:12, color:"var(--fg-2)" }}>
                  Ya existe una OT con este número: <strong>"{dupWarning}"</strong>. Verifica antes de continuar.
                </span>
              </div>
            )}
          </FieldRow>

          <FieldRow icon={<User size={14} />} label="Solicitante">
            <SolicitanteSelect value={form.solicitante} onChange={v => setF("solicitante", v)} wsId={wsId} />
          </FieldRow>

          <FieldRow icon={<Tag size={14} />} label="Hito">
            <HitoSelect value={form.hito} onChange={v => setF("hito", v)} wsId={wsId} />
            {pdfHints?.hito && (
              <PdfSuggestion
                field={pdfHints.hito}
                extractedLabel="hito"
                onPick={(id) => resolveHint("hito", id)}
                onCreate={() => createFromHint("hito")}
                onDismiss={() => resolveHint("hito", null)}
                canCreate
              />
            )}
          </FieldRow>

          <FieldRow icon={<DollarSign size={14} />} label="N° de presupuesto">
            <input
              type="text"
              placeholder="Ej: PRE-2025-001"
              value={form.presupuesto}
              onChange={e => setF("presupuesto", e.target.value)}
              style={{ width:"100%", height:40, padding:"0 12px", border:"1px solid var(--border)", borderRadius:8, fontSize:13, color:"var(--fg-1)", outline:"none", fontFamily:"inherit", background:"var(--surface-1)" }}
            />
          </FieldRow>

          {/* Sociedad */}
          <FieldRow icon={<Building2 size={14} />} label="Sociedad">
            <SearchSelect
              placeholder="Seleccionar sociedad…"
              value={form.sociedad_id}
              options={sociedadOptions}
              onChange={v => setF("sociedad_id", v)}
            />
            {pdfHints?.sociedad && (
              <PdfSuggestion
                field={pdfHints.sociedad}
                extractedLabel="sociedad"
                onPick={(id) => resolveHint("sociedad", id)}
                onCreate={() => createFromHint("sociedad")}
                onDismiss={() => resolveHint("sociedad", null)}
                canCreate
              />
            )}
          </FieldRow>

          {/* Ubicación */}
          <FieldRow icon={<MapPin size={14} />} label="Ubicación">
            <LocationSelect
              value={form.ubicacion_id}
              options={ubicOptions}
              onChange={v => setF("ubicacion_id", v)}
              wsId={wsId}
              onCreated={u => {
                setUbicaciones(prev => [...prev, u]);
                setForm(prev => ({ ...prev, ubicacion_id: u.id, lugar_id: "" }));
              }}
            />
            {pdfHints?.ubicacion && (
              <PdfSuggestion
                field={pdfHints.ubicacion}
                extractedLabel="ubicación"
                onPick={(id) => resolveHint("ubicacion", id)}
                onCreate={() => createFromHint("ubicacion")}
                onDismiss={() => resolveHint("ubicacion", null)}
                canCreate
              />
            )}
          </FieldRow>

          {/* Lugar específico */}
          <FieldRow icon={<MapPin size={14} />} label="Lugar específico">
            <LugarSelect
              value={form.lugar_id}
              options={lugarOptions}
              onChange={v => setF("lugar_id", v)}
              wsId={wsId}
              ubicacion_id={form.ubicacion_id}
              onCreated={l => {
                setLugares(prev => [...prev, l]);
                setForm(prev => ({ ...prev, lugar_id: l.id }));
              }}
            />
            {pdfHints?.lugar && (
              <PdfSuggestion
                field={pdfHints.lugar}
                extractedLabel="lugar"
                onPick={(id) => resolveHint("lugar", id)}
                onCreate={() => createFromHint("lugar")}
                onDismiss={() => resolveHint("lugar", null)}
                canCreate
              />
            )}
          </FieldRow>

          {/* Activo */}
          <FieldRow icon={<Settings2 size={14} />} label="Activo">
            <SearchSelect
              placeholder="Empiece a escribir…"
              value={form.activo_id}
              options={activoOptions}
              onChange={v => setF("activo_id", v)}
            />
            {pdfHints?.activo && (
              <PdfSuggestion
                field={pdfHints.activo}
                extractedLabel="activo"
                onPick={(id) => resolveHint("activo", id)}
                onDismiss={() => resolveHint("activo", null)}
                canCreate={false}
              />
            )}
          </FieldRow>

          {/* Asignar */}
          <FieldRow icon={<User size={14} />} label="Asignar a">
            <AssigneeSelect
              usuarios={usuarios}
              value={form.asignados_ids}
              onChange={v => setF("asignados_ids", v)}
            />
            {pdfHints?.asignados?.map((person, i) => (
              <PdfSuggestion
                key={`${person.extracted ?? "person"}-${i}`}
                field={person}
                extractedLabel={`persona ${i + 1}`}
                onPick={(id) => resolveAsignadoHint(i, id)}
                onDismiss={() => resolveAsignadoHint(i, null)}
                canCreate={false}
              />
            ))}
          </FieldRow>

          {/* Fecha de inicio */}
          <FieldRow icon={<CalendarDays size={14} />} label="Fecha de inicio">
            <input
              type="date"
              value={form.fecha_inicio}
              onChange={e => setF("fecha_inicio", e.target.value)}
              style={{
                height: 40, padding: "0 12px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 13, color: form.fecha_inicio ? "var(--fg-1)" : "var(--fg-4)",
                outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
              }}
            />
          </FieldRow>

          {/* Fecha de vencimiento */}
          <FieldRow icon={<CalendarDays size={14} />} label="Fecha de vencimiento">
            <input
              type="date"
              value={form.fecha_termino}
              onChange={e => setF("fecha_termino", e.target.value)}
              style={{
                height: 40, padding: "0 12px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 13, color: form.fecha_termino ? "var(--fg-1)" : "var(--fg-4)",
                outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
              }}
            />
          </FieldRow>

          {/* Recurrence */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)", marginBottom: 8 }}>
              Recurrencia
            </div>
            <select
              value={form.recurrencia}
              onChange={e => setF("recurrencia", e.target.value as Recurrencia)}
              style={{
                width: "100%", height: 40, padding: "0 12px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 13, color: "var(--fg-1)", outline: "none",
                background: "var(--surface-1)", fontFamily: "inherit",
              }}
            >
              {RECURRENCIAS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {form.recurrencia !== "ninguna" && (
            <div style={{ marginBottom: 24 }}>
              <RecurrenceControls value={form} onChange={setF} />
            </div>
          )}

          {/* Priority — connected segmented control (MaintainX style) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)", marginBottom: 8 }}>
              Prioridad
            </div>
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {PRIORIDADES.map((p, i) => {
                const active = form.prioridad === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setF("prioridad", p.value)}
                    style={{
                      height: 38, padding: "0 16px",
                      border: "none",
                      borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                      background: active ? "var(--surface-hover)" : "var(--surface-1)",
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? p.activeColor : "var(--fg-2)",
                      cursor: "pointer", transition: "all 0.12s",
                      fontFamily: "inherit",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories — multiple selection */}
          {categorias.length > 0 && (
            <FieldRow icon={<Tag size={14} />} label="Categorías">
              <CategoriaMultiSelect categorias={categorias} value={categoriaIds} onChange={setCategoriaIds} />
              {pdfHints?.categoria && (
                <PdfSuggestion
                  field={pdfHints.categoria}
                  extractedLabel="categoría"
                  onPick={(id) => { toggleCategoria(id); resolveHint("categoria", null); }}
                  onDismiss={() => resolveHint("categoria", null)}
                  canCreate={false}
                />
              )}
            </FieldRow>
          )}

        </div>
      </div>

      {/* Sticky footer */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface-1)", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          {error && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: 40, padding: "0 18px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", color: "var(--fg-2)",
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              height: 40, padding: "0 24px",
              border: "none", borderRadius: 8,
              background: saving ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))",
              color: "var(--fg-on-brand)",
              fontSize: 13, fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 7,
              transition: "opacity 0.15s", fontFamily: "inherit",
              boxShadow: saving ? "none" : "0 2px 6px rgba(37,99,235,0.25)",
            }}
          >
            {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            Crear
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
