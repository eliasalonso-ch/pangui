"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Loader2, User, MapPin, Settings2,
  CalendarDays, Tag, Check, ChevronDown, Building2, Hash, FileUp, Plus, AlertTriangle,
  Camera, ImagePlus, Trash2, Upload, Paperclip, FileText, File, DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { createOrden, buildDescripcion } from "@/lib/ordenes-api";
import { uploadFotoGrupo, createFotoGrupo, addFotoToGrupo } from "@/lib/foto-grupos-api";
import { uploadToR2 } from "@/lib/r2";
import { buildRecurrenciaConfig, RecurrenceControls, RECURRENCIAS } from "./RecurrenceControls";
import type {
  Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Prioridad, TipoTrabajo, Recurrencia, OTLink,
} from "@/types/ordenes";
import LinksInput from "@/components/LinksInput";

// ── PDF Parser ────────────────────────────────────────────────────────────────

// Extract text between two label patterns in the flat pdfjs token stream.
// Returns the content between `startLabel` and the first `stopLabel` that matches.
function between(text: string, startLabel: string, ...stopLabels: string[]): string {
  const startRe = new RegExp(startLabel, "i");
  const startM = startRe.exec(text);
  if (!startM) return "";
  let after = text.slice(startM.index + startM[0].length).trimStart();
  for (const stop of stopLabels) {
    const stopM = new RegExp(stop, "i").exec(after);
    if (stopM) after = after.slice(0, stopM.index);
  }
  return after.trim();
}

// Extract the value of a labelled field — one "cell" worth of text before the next known label.
const SECTION_STOPS = "Repartición|Sociedad|N°|Estado|Fecha|Título|Prioridad|Ubicación|Ubicacion|Lugar|Centro de Costo|Persona de Contacto|Nombre|Anexo|E-mail|Documentos|Archivos|Informacion Anexa|Tipo de Mantención|Tipo Convenio|Procedimiento|Nombre Ejecutor|BITÁCORA|Detalle Solicitud";

function field(text: string, ...labels: string[]): string {
  for (const label of labels) {
    const val = between(text, label, SECTION_STOPS.replace(label + "|", "").replace("|" + label, ""));
    // Take only the first "line" worth of text (up to ~80 chars before a long gap or next caps word)
    const firstLine = val.split(/\s{3,}|\n/)[0].trim();
    if (firstLine) return firstLine;
  }
  return "";
}

function cleanPdfValue(value: string): string {
  return value.split("\n").map(line => line.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function lineField(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...text.matchAll(new RegExp(`^${escaped}\\s{2,}([^\\n]+)`, "gim"))];
  return matches.at(-1)?.[1]?.trim() ?? "";
}

function blockField(text: string, startLabel: string, ...stopLabels: string[]): string {
  return cleanPdfValue(between(text, startLabel, ...stopLabels));
}

function normalizePdfMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLugarPDF(text: string): string {
  const stopLabels = SECTION_STOPS
    .split("|")
    .filter(label => !/^Lugar$/i.test(label))
    .join("|");
  const lugarRe = /\bLugar\s+(?!específico|especifico)([^\n]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = lugarRe.exec(text))) {
    const raw = match[1] ?? "";
    const value = raw
      .replace(new RegExp(`\\b(?:${stopLabels})\\b.*$`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();

    if (value && !new RegExp(`^(?:${stopLabels})\\b`, "i").test(value)) {
      return value;
    }
  }

  return "";
}

function exactMatch<T extends { id: string }>(
  query: string,
  items: T[],
  getLabel: (item: T) => string,
): string {
  if (!query || items.length === 0) return "";
  const q = normalizePdfMatch(query);
  return items.find(item => normalizePdfMatch(getLabel(item)) === q)?.id ?? "";
}

function fuzzyMatch<T extends { id: string }>(
  query: string,
  items: T[],
  getLabel: (item: T) => string,
): string {
  if (!query || items.length === 0) return "";
  const q = normalizePdfMatch(query);

  // 1. Exact substring: label contains query or query contains label
  const exact = items.find(i => {
    const label = normalizePdfMatch(getLabel(i));
    return label.includes(q) || q.includes(label);
  });
  if (exact) return exact.id;

  // 2. Word-overlap: only words >3 chars, require >=50% of query words to match
  const queryWords = q.split(/\s+/).filter(w => w.length > 3);
  if (queryWords.length === 0) return "";

  let topScore = 0;
  let best: T | undefined;
  for (const item of items) {
    const label = normalizePdfMatch(getLabel(item));
    const score = queryWords.filter(w => label.includes(w)).length;
    if (score > topScore) { topScore = score; best = item; }
  }

  // Require at least half the significant query words to match
  const minRequired = Math.ceil(queryWords.length * 0.5);
  if (topScore < minRequired) return "";

  return best?.id ?? "";
}
const PRIORIDAD_PDF_MAP: Record<string, Prioridad> = {
  emergencia: "urgente", urgente: "urgente",
  alta: "alta",
  media: "media", normal: "media",
  baja: "baja",
};

const TIPO_PDF_MAP: Record<string, TipoTrabajo> = {
  electrica: "reactiva", eléctrica: "reactiva", electrico: "reactiva", eléctrico: "reactiva",
  preventiva: "preventiva",
  inspeccion: "inspeccion", inspección: "inspeccion",
  mejora: "mejora",
};

const SPANISH_MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04",
  mayo: "05", junio: "06", julio: "07", agosto: "08",
  septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

// Parse Spanish date like "Viernes 10 de Abril del 2026" → "2026-04-10"
function parseSpanishDate(text: string): string {
  const m = text.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+del?\s+(\d{4})/i);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const month = SPANISH_MONTHS[m[2].toLowerCase()];
  const year = m[3];
  if (!month) return "";
  return `${year}-${month}-${day}`;
}

interface ParsedPDF {
  n_ot: string;
  solicitante: string;
  titulo: string;
  descripcion: string;
  prioridad: Prioridad;
  tipo_trabajo: TipoTrabajo | "";
  sociedad_id: string;
  ubicacionText: string;
  lugarText: string;
  fecha_inicio: string;
}

async function parseSolicitudPDF(file: File, sociedades: Sociedad[]): Promise<ParsedPDF> {
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

  // Build token stream preserving spacing from the PDF layout
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      // Insert newline when Y position changes significantly (new row in the table)
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) fullText += "\n";
      else if (fullText && !fullText.endsWith(" ") && !fullText.endsWith("\n")) fullText += " ";
      fullText += item.str;
      lastY = y;
    }
    fullText += "\n";
  }

  // ── Extract fields ────────────────────────────────────────────────────────

  // N° SF... folio — second occurrence has the actual value
  const nOT = fullText.match(/N°\s+(SF\d+)/i)?.[1] ?? "";

  // Solicitante — line after "Nombres y Apellidos"
  const solicitante = lineField(fullText, "Nombres y Apellidos");

  // Título Solicitud
  const titulo = blockField(fullText, "Título Solicitud", "Prioridad", "Ubicación", "Ubicacion");

  // Prioridad — line-anchored so the section header "Prioridad" is ignored.
  const prioPDF = lineField(fullText, "Prioridad").toLowerCase();

  // Ubicación — match the label+value row (two+ spaces between label and value)
  const ubicRe = fullText.match(/Ubicaci[oó]n\s{2,}([^\n]+)\n([^\n]+)/i);
  const ubicLine1Raw = ubicRe?.[1]?.trim() ?? "";
  const ubicLine2 = ubicRe?.[2]?.trim() ?? "";
  // If line1 ends with " -" the value wrapped across lines; join and clean the dash
  const isLabel = /^(Lugar|Objeto|Centro|Persona|Nombre|Anexo|E-mail|Documentos)/i;
  let ubicPDF = ubicLine1Raw;
  if (ubicLine1Raw.endsWith("-") && ubicLine2 && !isLabel.test(ubicLine2)) {
    // Wrapped hyphenated value (e.g. "FACULTAD DE INGENIERIA -\nADMINISTRACION")
    ubicPDF = (ubicLine1Raw.replace(/-$/, "").trim() + " " + ubicLine2).trim();
  } else if (!isLabel.test(ubicLine2) && ubicLine2 && !ubicLine1Raw.endsWith("-")) {
    // Normal continuation line that isn't a new field label
    ubicPDF = (ubicLine1Raw + " " + ubicLine2).trim();
  }

  // Lugar — match "Lugar <value>", avoid "Lugar específico" header and "Lugar" standalone labels
  // pdfjs may emit this mid-line; allow values that start with a number (e.g. "2DO PISO").
  const lugarPDF = extractLugarPDF(fullText);

  // Sociedad
  const sociedadPDF = lineField(fullText, "Sociedad");

  // Detalle — multi-line, stop at "Informacion Anexa"
  const detalle = blockField(fullText, "Detalle Solicitud\\s{2,}", "Informacion Anexa", "BITÁCORA");

  // Tipo de trabajo
  const tipoPDF = lineField(fullText, "Tipo de Mantención").toLowerCase();

  // Fecha del documento SF — match the first "Fecha  <Spanish date>" row.
  // Avoid picking up "FECHA REGISTRO" from the BITÁCORA table by anchoring to
  // the row that contains a recognisable Spanish weekday + day pattern.
  const fechaRe = fullText.match(/\bFecha\s{2,}(\w+\s+\d{1,2}\s+de\s+\w+\s+del?\s+\d{4})/i);
  const fechaISO = parseSpanishDate(fechaRe?.[1] ?? "");

  return {
    n_ot:          nOT,
    solicitante,
    titulo,
    descripcion:   detalle,
    prioridad:     PRIORIDAD_PDF_MAP[prioPDF] ?? "ninguna",
    tipo_trabajo:  TIPO_PDF_MAP[tipoPDF] ?? "",
    sociedad_id:   fuzzyMatch(sociedadPDF, sociedades, s => s.nombre),
    ubicacionText: ubicPDF,
    lugarText:     lugarPDF,
    fecha_inicio:  fechaISO,
  };
}

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
interface PdfHints {
  ubicacionText: string;   // unresolved → show "create?" prompt
  lugarText:     string;
  sociedadText:  string;
  ubicacionMatched: boolean;  // true = fuzzy matched an existing record
  lugarMatched:     boolean;
}

const BLANK: FormState = {
  titulo: "", n_ot: "", solicitante: "", hito: "", presupuesto: "", descripcion: "",
  ubicacion_id: "", lugar_id: "", sociedad_id: "",
  activo_id: "", asignados_ids: [],
  fecha_termino: "", fecha_inicio: "", recurrencia_fin: "",
  recurrencia_intervalo: "1", recurrencia_dias: [], recurrencia_mes_dia: "1",
  recurrencia: "ninguna", tipo_trabajo: "",
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
  { value: "inspeccion",    label: "Inspección" },
  { value: "mejora",        label: "Mejora" },
  { value: "levantamiento", label: "Levantamiento" },
];

// ── Shared field row ──────────────────────────────────────────────────────────

function FieldRow({ icon, label, children }: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "22px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 34, paddingTop: 4, display: "flex", justifyContent: "center", flexShrink: 0, color: "var(--fg-4)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </div>
        {children}
      </div>
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
        .select("id,edificio,piso,detalle,activa,sociedad_id")
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
  const [creatingUbic, setCreatingUbic] = useState(false);
  const [creatingLugar, setCreatingLugar] = useState(false);

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
      const { ubicacionText, lugarText, ...parsed } = await parseSolicitudPDF(file, sociedades);

      // Only fuzzy-match — never auto-create
      const ubicacion_id      = exactMatch(ubicacionText, ubicaciones, u => u.edificio + (u.piso ? ` ${u.piso}` : ""));
      // Scope lugar search to the resolved ubicacion to avoid wrong-building matches
      const lugaresForUbic    = ubicacion_id ? lugares.filter(l => l.ubicacion_id === ubicacion_id) : lugares;
      const lugar_id          = exactMatch(lugarText, lugaresForUbic, l => l.nombre);

      const ubicacionMatched  = !!ubicacion_id || !ubicacionText;
      const lugarMatched      = !!lugar_id || !lugarText;

      const formPatch = { ...parsed, ubicacion_id, lugar_id };
      const filled = Object.values(formPatch).filter(v => v && v !== "ninguna" && v !== "").length;

      if (filled === 0) {
        setParseMsg("No se encontraron datos en el PDF. Verifica que sea una Solicitud de Mantención válida.");
      } else {
        setForm(prev => ({ ...prev, ...formPatch }));
        setParseMsg(`PDF importado — ${filled} campos completados. Revisa y ajusta lo necesario.`);
      }

      // Store hints for any unresolved location fields
      if (ubicacionText || lugarText) {
        setPdfHints({
          ubicacionText:   ubicacionMatched ? "" : ubicacionText,
          lugarText:       lugarMatched     ? "" : lugarText,
          sociedadText:    "",   // sociedades already resolved via fuzzyMatch above
          ubicacionMatched,
          lugarMatched,
        });
      }
    } catch (err) {
      setParseMsg(`Error al leer el PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setParsing(false);
    }
  }

  async function createUbicFromHint() {
    if (!pdfHints?.ubicacionText) return;
    setCreatingUbic(true);
    try {
      const sb = createClient();
      const { data } = await sb
        .from("ubicaciones")
        .insert({ workspace_id: wsId, edificio: pdfHints.ubicacionText, activa: true })
        .select("id,edificio,piso,detalle,activa,sociedad_id")
        .single();
      if (data) {
        setUbicaciones(prev => [...prev, data as Ubicacion]);
        setForm(prev => ({ ...prev, ubicacion_id: data.id, lugar_id: "" }));
        setPdfHints(prev => prev ? { ...prev, ubicacionText: "", ubicacionMatched: true } : prev);
      }
    } finally {
      setCreatingUbic(false);
    }
  }

  async function createLugarFromHint() {
    if (!pdfHints?.lugarText) return;
    setCreatingLugar(true);
    try {
      const sb = createClient();
      const { data } = await sb
        .from("lugares")
        .insert({ workspace_id: wsId, nombre: pdfHints.lugarText, ubicacion_id: form.ubicacion_id || null, activo: true })
        .select("id,nombre,ubicacion_id,activo,imagen_url,descripcion,workspace_id,created_at")
        .single();
      if (data) {
        setLugares(prev => [...prev, data as LugarEspecifico]);
        setForm(prev => ({ ...prev, lugar_id: data.id }));
        setPdfHints(prev => prev ? { ...prev, lugarText: "", lugarMatched: true } : prev);
      }
    } finally {
      setCreatingLugar(false);
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
    label: u.edificio + (u.piso ? ` · ${u.piso}` : ""),
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
    label: a.nombre + (a.codigo ? ` (${a.codigo})` : ""),
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
        categoria_id:  form.categoria_id  || null,
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

          {/* Photo groups */}
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Camera size={13} style={{ color: "var(--fg-3)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Paperclip size={13} style={{ color: "var(--fg-3)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Links
            </label>
            <LinksInput
              links={form.links}
              onChange={links => setF("links", links)}
            />
          </div>

          {/* N° OT + Solicitante + Hito */}
          <FieldRow icon={<Hash size={14} />} label="N° OT / Folio">
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
            <input
              type="text"
              placeholder="Nombre del solicitante…"
              value={form.solicitante}
              onChange={e => setF("solicitante", e.target.value)}
              style={{ width:"100%", height:40, padding:"0 12px", border:"1px solid var(--border)", borderRadius:8, fontSize:13, color:"var(--fg-1)", outline:"none", fontFamily:"inherit", background:"var(--surface-1)" }}
            />
          </FieldRow>

          <FieldRow icon={<Tag size={14} />} label="Hito">
            <HitoSelect value={form.hito} onChange={v => setF("hito", v)} wsId={wsId} />
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
            {/* PDF hint: unresolved */}
            {pdfHints?.ubicacionText && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--warning-bg, #FFFBEB)", border: "1px solid var(--warning)", borderRadius: 8 }}>
                <MapPin size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)" }}>
                  PDF sugirió: <strong>"{pdfHints.ubicacionText}"</strong> — no encontrada
                </span>
                <button type="button" onClick={createUbicFromHint} disabled={creatingUbic}
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", border: "none", borderRadius: 8, background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 12, fontWeight: 700, cursor: creatingUbic ? "default" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {creatingUbic ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  Crear
                </button>
                <button type="button" onClick={() => setPdfHints(p => p ? { ...p, ubicacionText: "" } : p)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 2 }}>
                  <X size={12} />
                </button>
              </div>
            )}
            {/* PDF hint: matched */}
            {pdfHints && !pdfHints.ubicacionText && pdfHints.ubicacionMatched && form.ubicacion_id && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--success-bg)", border: "1px solid var(--success)", borderRadius: 8 }}>
                <Check size={11} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--success)" }}>Ubicación encontrada en el sistema</span>
              </div>
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
            {/* PDF hint: unresolved */}
            {pdfHints?.lugarText && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--warning-bg, #FFFBEB)", border: "1px solid var(--warning)", borderRadius: 8 }}>
                <MapPin size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)" }}>
                  PDF sugirió: <strong>"{pdfHints.lugarText}"</strong> — no encontrado
                </span>
                <button type="button" onClick={createLugarFromHint} disabled={creatingLugar}
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", border: "none", borderRadius: 8, background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 12, fontWeight: 700, cursor: creatingLugar ? "default" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {creatingLugar ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  Crear
                </button>
                <button type="button" onClick={() => setPdfHints(p => p ? { ...p, lugarText: "" } : p)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 2 }}>
                  <X size={12} />
                </button>
              </div>
            )}
            {/* PDF hint: matched */}
            {pdfHints && !pdfHints.lugarText && pdfHints.lugarMatched && form.lugar_id && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--success-bg)", border: "1px solid var(--success)", borderRadius: 8 }}>
                <Check size={11} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--success)" }}>Lugar encontrado en el sistema</span>
              </div>
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
          </FieldRow>

          {/* Asignar */}
          <FieldRow icon={<User size={14} />} label="Asignar a">
            <AssigneeSelect
              usuarios={usuarios}
              value={form.asignados_ids}
              onChange={v => setF("asignados_ids", v)}
            />
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

          {/* Recurrence + Work type */}
          <div style={{ display: "flex", gap: 24, padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                <option value="">Reactiva (por defecto)</option>
                {TIPOS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {form.recurrencia !== "ninguna" && (
            <div style={{ padding: "0 0 24px", borderBottom: "1px solid var(--border)" }}>
              <RecurrenceControls value={form} onChange={setF} />
            </div>
          )}

          {/* Priority */}
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Prioridad
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PRIORIDADES.map((p) => {
                const active = form.prioridad === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setF("prioridad", p.value)}
                    style={{
                      height: 40, padding: "0 16px",
                      border: active ? "none" : "1px solid var(--border)",
                      borderRadius: 8,
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

          {/* Categories */}
          {categorias.length > 0 && (
            <FieldRow icon={<Tag size={14} />} label="Categorías">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {categorias.map(c => {
                  const active = form.categoria_id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setF("categoria_id", active ? "" : c.id)}
                      style={{
                        height: 32, padding: "0 12px",
                        border: "none", borderRadius: 8,
                        background: active ? (c.color ?? "var(--brand)") : "var(--surface-hover)",
                        color: active ? "var(--fg-on-brand)" : "var(--fg-2)",
                        fontSize: 12, fontWeight: active ? 700 : 500,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                        transition: "all 0.1s", fontFamily: "inherit",
                      }}
                    >
                      {c.icono && <span>{c.icono}</span>}
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
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
