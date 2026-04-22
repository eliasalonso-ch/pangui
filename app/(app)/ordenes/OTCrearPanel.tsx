"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Loader2, User, MapPin, Settings2,
  CalendarDays, Tag, Check, ChevronDown, Building2, Hash, FileUp, Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { createOrden, buildDescripcion } from "@/lib/ordenes-api";
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

function fuzzyMatch<T extends { id: string }>(
  query: string,
  items: T[],
  getLabel: (item: T) => string,
): string {
  if (!query || items.length === 0) return "";
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9s]/g, "").trim();
  const q = normalize(query);

  // 1. Exact substring: label contains query or query contains label
  const exact = items.find(i => {
    const label = normalize(getLabel(i));
    return label.includes(q) || q.includes(label);
  });
  if (exact) return exact.id;

  // 2. Word-overlap: only words >3 chars, require >=50% of query words to match
  const queryWords = q.split(/s+/).filter(w => w.length > 3);
  if (queryWords.length === 0) return "";

  let topScore = 0;
  let best: T | undefined;
  for (const item of items) {
    const label = normalize(getLabel(item));
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
  __rawText: string;
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
  const solicitante = fullText.match(/Nombres y Apellidos\s+(.+)/i)?.[1]?.trim() ?? "";

  // Título Solicitud
  const titulo = fullText.match(/Título Solicitud\s+(.+)/i)?.[1]?.trim() ?? "";

  // Prioridad — second occurrence (after the "Prioridad" section header line)
  const prioPDF = (fullText.match(/Prioridad\s+(\S+)/gi)?.[1] ?? "")
    .replace(/Prioridad\s+/i, "").trim().toLowerCase();

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
  // Drop ^ anchor — pdfjs may emit this mid-line; use \b and require value to start with uppercase/word char
  const lugarPDF = fullText.match(/\bLugar\s+(?!específico|especifico|Específico)([A-ZÁÉÍÓÚÑ][^\n]{3,})/m)?.[1]?.trim() ?? "";

  // Sociedad
  const sociedadPDF = fullText.match(/Sociedad\s+(.+)/i)?.[1]?.trim() ?? "";

  // Detalle — multi-line, stop at "Informacion Anexa"
  const detalle = between(fullText, "Detalle Solicitud  ", "Informacion Anexa", "BITÁCORA")
    .split("\n").map(l => l.trim()).filter(Boolean).join(" ").trim();

  // Tipo de trabajo
  const tipoPDF = fullText.match(/Tipo de Mant[eé]nci[oó]n\s+(\S+)/i)?.[1]?.trim().toLowerCase() ?? "";

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
    __rawText:     fullText,
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

interface FormState {
  titulo:        string;
  n_ot:          string;
  solicitante:   string;
  hito:          string;
  descripcion:   string;
  ubicacion_id:  string;
  lugar_id:      string;
  sociedad_id:   string;
  activo_id:     string;
  asignados_ids: string[];
  fecha_termino: string;
  fecha_inicio:  string;
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
  titulo: "", n_ot: "", solicitante: "", hito: "", descripcion: "",
  ubicacion_id: "", lugar_id: "", sociedad_id: "",
  activo_id: "", asignados_ids: [],
  fecha_termino: "", fecha_inicio: "",
  recurrencia: "ninguna", tipo_trabajo: "",
  prioridad: "ninguna", categoria_id: "",
  links: [],
};

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORIDADES: { value: Prioridad; label: string; activeColor: string }[] = [
  { value: "ninguna", label: "Ninguna", activeColor: "#6B7280" },
  { value: "baja",    label: "Baja",    activeColor: "#6B7280" },
  { value: "media",   label: "Media",   activeColor: "#2563EB" },
  { value: "alta",    label: "Alta",    activeColor: "#EA580C" },
  { value: "urgente", label: "Urgente", activeColor: "#DC2626" },
];

const TIPOS: { value: TipoTrabajo; label: string }[] = [
  { value: "reactiva",   label: "Reactiva" },
  { value: "preventiva", label: "Preventiva" },
  { value: "inspeccion", label: "Inspección" },
  { value: "mejora",     label: "Mejora" },
];

const RECURRENCIAS: { value: Recurrencia; label: string }[] = [
  { value: "ninguna",   label: "No se repite" },
  { value: "diaria",    label: "Diaria" },
  { value: "semanal",   label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual",   label: "Mensual" },
];

// ── Shared field row ──────────────────────────────────────────────────────────

function FieldRow({ icon, label, children }: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "1px solid #E2E8F0" }}>
      <div style={{ width: 28, paddingTop: 2, display: "flex", justifyContent: "center", flexShrink: 0, color: "#94A3B8" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>
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
          width: "100%", height: 38, display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 8,
          background: "#fff", fontSize: 13, color: selected ? "#0F172A" : "#94A3B8",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "#94A3B8" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(15,23,42,0.12)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 6px 3px" }}>
            <input
              autoFocus
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 30, padding: "0 8px",
                border: "1px solid #E2E8F0", borderRadius: 6,
                fontSize: 13, outline: "none", color: "#0F172A", fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "7px 10px", fontSize: 13, color: "#94A3B8",
                background: !value ? "#EFF6FF" : "transparent",
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
                  padding: "7px 10px", fontSize: 13,
                  background: value === o.id ? "#EFF6FF" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {value === o.id && <Check size={11} style={{ color: "#1E3A8A", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#0F172A" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 11, color: "#94A3B8" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "#94A3B8" }}>Sin resultados</div>
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
  }

  const selected = value.map(id => usuarios.find(u => u.id === id)).filter(Boolean) as Usuario[];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
          {selected.map(u => (
            <span key={u.id} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 7px 2px 4px",
              background: "#EFF6FF", borderRadius: 20,
              fontSize: 11.5, color: "#1E3A8A",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "#1E3A8A", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700,
              }}>
                {initials(u.nombre)}
              </span>
              {u.nombre}
              <button type="button" onClick={() => toggle(u.id)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#1E3A8A", display: "flex", padding: 0, lineHeight: 1,
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
          height: 34, display: "flex", alignItems: "center", gap: 7,
          padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 4,
          background: "#fff", fontSize: 13, color: "#94A3B8",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <User size={13} />
        Asignar técnico
        <ChevronDown size={12} style={{ color: "#94A3B8", marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, zIndex: 200,
          minWidth: 220, background: "#fff", border: "1px solid #E2E8F0",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.12)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 6px 3px" }}>
            <input
              autoFocus
              placeholder="Buscar por nombre…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 30, padding: "0 8px",
                border: "1px solid #E2E8F0", borderRadius: 6,
                fontSize: 13, outline: "none", color: "#0F172A", fontFamily: "inherit",
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
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "8px 10px",
                    background: sel ? "#EFF6FF" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: sel ? "#1E3A8A" : "#F3F4F6",
                    color: sel ? "#fff" : "#677888",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(u.nombre)}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "capitalize" }}>{u.rol}</div>
                  </div>
                  {sel && <Check size={13} style={{ color: "#1E3A8A", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "#94A3B8" }}>Sin resultados</div>
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
          padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 8,
          background: "#fff", fontSize: 13, color: value ? "#0F172A" : "#94A3B8",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "Seleccionar o crear hito…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "#94A3B8" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 6px 3px" }}>
            <input
              autoFocus
              placeholder="Buscar o crear…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 30, padding: "0 8px",
                border: "1px solid #E2E8F0", borderRadius: 8,
                fontSize: 12.5, outline: "none", color: "#0F172A",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, color: "#94A3B8", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
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
                  width: "100%", padding: "7px 10px", fontSize: 13,
                  background: value === h.nombre ? "#EFF6FF" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", color: "#0F172A",
                }}
              >
                {value === h.nombre && <Check size={11} style={{ color: "#1E3A8A", flexShrink: 0 }} />}
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
                  width: "100%", padding: "7px 10px", fontSize: 13, fontWeight: 600,
                  background: "#F0F3FF", color: "#1E3A8A",
                  border: "none", borderTop: "1px solid #E2E8F0",
                  cursor: creating ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "#94A3B8" }}>Sin hitos</div>
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
        style={{ width: "100%", height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", fontSize: 13, color: selected ? "#0F172A" : "#94A3B8", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : "Buscar o crear ubicación…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "#94A3B8" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.12)", overflow: "hidden" }}>
          <div style={{ padding: "6px 6px 3px" }}>
            <input autoFocus placeholder="Buscar o crear…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, outline: "none", color: "#0F172A", fontFamily: "inherit" }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, color: "#94A3B8", background: !value ? "#EFF6FF" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              Sin asignar
            </button>
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, background: value === o.id ? "#EFF6FF" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {value === o.id && <Check size={11} style={{ color: "#1E3A8A", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#0F172A" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 11, color: "#94A3B8" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {canCreate && (
              <button type="button" onClick={handleCreate} disabled={creating}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", fontSize: 13, fontWeight: 600, background: "#F0F3FF", color: "#1E3A8A", border: "none", borderTop: "1px solid #E2E8F0", cursor: creating ? "default" : "pointer", fontFamily: "inherit" }}>
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "#94A3B8" }}>Sin resultados</div>
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
        style={{ width: "100%", height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", fontSize: 13, color: selected ? "#0F172A" : "#94A3B8", cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : "Buscar o crear lugar…"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "#94A3B8" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.12)", overflow: "hidden" }}>
          <div style={{ padding: "6px 6px 3px" }}>
            <input autoFocus placeholder="Buscar o crear…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, outline: "none", color: "#0F172A", fontFamily: "inherit" }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, color: "#94A3B8", background: !value ? "#EFF6FF" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              Sin asignar
            </button>
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, background: value === o.id ? "#EFF6FF" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {value === o.id && <Check size={11} style={{ color: "#1E3A8A", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#0F172A" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 11, color: "#94A3B8" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {canCreate && (
              <button type="button" onClick={handleCreate} disabled={creating}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", fontSize: 13, fontWeight: 600, background: "#F0F3FF", color: "#1E3A8A", border: "none", borderTop: "1px solid #E2E8F0", cursor: creating ? "default" : "pointer", fontFamily: "inherit" }}>
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "#94A3B8" }}>Sin resultados</div>
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
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Local copies so newly created records appear immediately without a full reload
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>(initialUbicaciones);
  const [lugares, setLugares]         = useState<LugarEspecifico[]>(initialLugares);

  // PDF-suggested values that couldn't be auto-resolved
  const [pdfHints, setPdfHints] = useState<PdfHints | null>(null);
  const [creatingUbic, setCreatingUbic] = useState(false);
  const [creatingLugar, setCreatingLugar] = useState(false);
  const [debugInfo, setDebugInfo] = useState<null | {
    rawText: string;
    extracted: Record<string, string>;
    resolved: Record<string, string>;
  }>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  async function handlePDFImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setParseMsg(null);
    setPdfHints(null);
    try {
      const { ubicacionText, lugarText, __rawText, ...parsed } = await parseSolicitudPDF(file, sociedades);

      // Only fuzzy-match — never auto-create
      const ubicacion_id      = fuzzyMatch(ubicacionText, ubicaciones, u => u.edificio + (u.piso ? ` ${u.piso}` : ""));
      // Scope lugar search to the resolved ubicacion to avoid wrong-building matches
      const lugaresForUbic    = ubicacion_id ? lugares.filter(l => l.ubicacion_id === ubicacion_id) : lugares;
      const lugar_id          = fuzzyMatch(lugarText, lugaresForUbic, l => l.nombre);

      setDebugInfo({
        rawText: __rawText,
        extracted: {
          n_ot:          parsed.n_ot,
          solicitante:   parsed.solicitante,
          titulo:        parsed.titulo,
          prioridad:     parsed.prioridad,
          tipo_trabajo:  parsed.tipo_trabajo,
          ubicacionText,
          lugarText,
          descripcion:   parsed.descripcion.slice(0, 120) + (parsed.descripcion.length > 120 ? "…" : ""),
        },
        resolved: {
          ubicacion_id:  ubicacion_id || "(sin match)",
          lugar_id:      lugar_id     || "(sin match)",
          sociedad_id:   parsed.sociedad_id || "(sin match)",
          ubicaciones_count: String(ubicaciones.length),
          lugares_count:     String(lugares.length),
        },
      });
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
        prioridad:     form.prioridad,
        tipo_trabajo:  form.tipo_trabajo,
        categoria_id:  form.categoria_id  || null,
        recurrencia:   form.recurrencia,
        ubicacion_id:  form.ubicacion_id  || null,
        lugar_id:      form.lugar_id      || null,
        sociedad_id:   form.sociedad_id   || null,
        activo_id:     form.activo_id     || null,
        asignados_ids: form.asignados_ids.length > 0 ? form.asignados_ids : null,
        fecha_inicio:  form.fecha_inicio  || null,
        fecha_termino: form.fecha_termino || null,
        links:         form.links,
      });
      onCreated(orden);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la orden.");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 56, borderBottom: "1px solid #E2E8F0", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", margin: 0 }}>
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
              height: 30, padding: "0 10px",
              border: "1px solid #E2E8F0", borderRadius: 6,
              background: "#F8F9FF", color: "#1E3A8A",
              fontSize: 12, fontWeight: 600, cursor: parsing ? "default" : "pointer",
              fontFamily: "inherit", transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (!parsing) e.currentTarget.style.background = "#EFF6FF"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#F8F9FF"; }}
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
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid #E2E8F0", borderRadius: 6,
              background: "#fff", cursor: "pointer", color: "#677888",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Parse feedback banner */}
      {parseMsg && (
        <div style={{
          padding: "8px 20px", fontSize: 12.5, flexShrink: 0,
          background: parseMsg.startsWith("No se") || parseMsg.startsWith("Error") ? "#FEF2F2" : "#F0FDF4",
          color: parseMsg.startsWith("No se") || parseMsg.startsWith("Error") ? "#DC2626" : "#15803D",
          borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {parseMsg}
          <button type="button" onClick={() => setParseMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 2 }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* PDF Debug panel */}
      {debugInfo && (
        <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", background: "#0F172A" }}>
          <button
            type="button"
            onClick={() => setDebugOpen(v => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em" }}>🔍 PDF DEBUG</span>
            <span style={{ fontSize: 10, color: "#64748B" }}>{debugOpen ? "▲ ocultar" : "▼ expandir"}</span>
          </button>
          {debugOpen && (
            <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.08em", marginBottom: 4 }}>CAMPOS EXTRAÍDOS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {Object.entries(debugInfo.extracted).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, fontFamily: "monospace", fontSize: 11 }}>
                      <span style={{ color: "#64748B", minWidth: 120, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: v && v !== "(sin match)" ? "#86EFAC" : "#F87171", wordBreak: "break-all" }}>{v || "(vacío)"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.08em", marginBottom: 4 }}>RESOLUCIÓN → IDs</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {Object.entries(debugInfo.resolved).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, fontFamily: "monospace", fontSize: 11 }}>
                      <span style={{ color: "#64748B", minWidth: 120, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: v && !v.startsWith("(") ? "#86EFAC" : "#F87171" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.08em", marginBottom: 4 }}>TEXTO RAW (primeras 600 chars)</div>
                <pre style={{ fontSize: 10, color: "#94A3B8", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, maxHeight: 160, overflowY: "auto", background: "#0F172A", lineHeight: 1.5 }}>
                  {debugInfo.rawText.slice(0, 600)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scrollable form body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "16px 20px 100px" }}>

          {/* Title */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="¿Qué hay que hacer? (Necesario)"
              value={form.titulo}
              onChange={e => setF("titulo", e.target.value)}
              style={{
                width: "100%", fontSize: 16, fontWeight: 600,
                color: "#0F172A", border: "none", outline: "none",
                background: "transparent", padding: "4px 0",
                borderBottom: "2px solid " + (form.titulo ? "#1E3A8A" : "#E5E7EB"),
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 4 }}>
            <textarea
              placeholder="Agregue una descripción"
              value={form.descripcion}
              onChange={e => setF("descripcion", e.target.value)}
              rows={3}
              style={{
                width: "100%", fontSize: 13, color: "#0F172A",
                border: "1px solid #E2E8F0", borderRadius: 4,
                padding: "8px 10px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "#fff", lineHeight: 1.5,
              }}
            />
          </div>

          {/* Links */}
          <div style={{ marginBottom: 4 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
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
              style={{ width:"100%", height:40, padding:"0 10px", border:"1px solid #E2E8F0", borderRadius:8, fontSize:13, color:"#0F172A", outline:"none", fontFamily:"monospace", background:"#fff" }}
            />
          </FieldRow>

          <FieldRow icon={<User size={14} />} label="Solicitante">
            <input
              type="text"
              placeholder="Nombre del solicitante…"
              value={form.solicitante}
              onChange={e => setF("solicitante", e.target.value)}
              style={{ width:"100%", height:40, padding:"0 10px", border:"1px solid #E2E8F0", borderRadius:8, fontSize:13, color:"#0F172A", outline:"none", fontFamily:"inherit", background:"#fff" }}
            />
          </FieldRow>

          <FieldRow icon={<Tag size={14} />} label="Hito">
            <HitoSelect value={form.hito} onChange={v => setF("hito", v)} wsId={wsId} />
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
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7 }}>
                <MapPin size={12} style={{ color: "#D97706", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: "#92400E" }}>
                  PDF sugirió: <strong>"{pdfHints.ubicacionText}"</strong> — no encontrada
                </span>
                <button type="button" onClick={createUbicFromHint} disabled={creatingUbic}
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px", border: "none", borderRadius: 6, background: "#1E3A8A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: creatingUbic ? "default" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {creatingUbic ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  Crear
                </button>
                <button type="button" onClick={() => setPdfHints(p => p ? { ...p, ubicacionText: "" } : p)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", padding: 2 }}>
                  <X size={12} />
                </button>
              </div>
            )}
            {/* PDF hint: matched */}
            {pdfHints && !pdfHints.ubicacionText && pdfHints.ubicacionMatched && form.ubicacion_id && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 7 }}>
                <Check size={11} style={{ color: "#16A34A", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#15803D" }}>Ubicación encontrada en el sistema</span>
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
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7 }}>
                <MapPin size={12} style={{ color: "#D97706", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: "#92400E" }}>
                  PDF sugirió: <strong>"{pdfHints.lugarText}"</strong> — no encontrado
                </span>
                <button type="button" onClick={createLugarFromHint} disabled={creatingLugar}
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px", border: "none", borderRadius: 6, background: "#1E3A8A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: creatingLugar ? "default" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {creatingLugar ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  Crear
                </button>
                <button type="button" onClick={() => setPdfHints(p => p ? { ...p, lugarText: "" } : p)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", padding: 2 }}>
                  <X size={12} />
                </button>
              </div>
            )}
            {/* PDF hint: matched */}
            {pdfHints && !pdfHints.lugarText && pdfHints.lugarMatched && form.lugar_id && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 7 }}>
                <Check size={11} style={{ color: "#16A34A", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#15803D" }}>Lugar encontrado en el sistema</span>
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
                height: 40, padding: "0 10px",
                border: "1px solid #E2E8F0", borderRadius: 8,
                fontSize: 13, color: form.fecha_inicio ? "#0F172A" : "#94A3B8",
                outline: "none", fontFamily: "inherit", background: "#fff",
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
                height: 40, padding: "0 10px",
                border: "1px solid #E2E8F0", borderRadius: 8,
                fontSize: 13, color: form.fecha_termino ? "#0F172A" : "#94A3B8",
                outline: "none", fontFamily: "inherit", background: "#fff",
              }}
            />
          </FieldRow>

          {/* Recurrence + Work type */}
          <div style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid #E2E8F0" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>
                Recurrencia
              </div>
              <select
                value={form.recurrencia}
                onChange={e => setF("recurrencia", e.target.value as Recurrencia)}
                style={{
                  width: "100%", height: 40, padding: "0 8px",
                  border: "1px solid #E2E8F0", borderRadius: 8,
                  fontSize: 13, color: "#0F172A", outline: "none",
                  background: "#fff", fontFamily: "inherit",
                }}
              >
                {RECURRENCIAS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>
                Tipo de trabajo
              </div>
              <select
                value={form.tipo_trabajo}
                onChange={e => setF("tipo_trabajo", e.target.value as TipoTrabajo | "")}
                style={{
                  width: "100%", height: 40, padding: "0 8px",
                  border: "1px solid #E2E8F0", borderRadius: 8,
                  fontSize: 13, color: "#0F172A", outline: "none",
                  background: "#fff", fontFamily: "inherit",
                }}
              >
                <option value="">Reactiva (por defecto)</option>
                {TIPOS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div style={{ padding: "12px 0", borderBottom: "1px solid #E2E8F0" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Prioridad
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PRIORIDADES.map((p) => {
                const active = form.prioridad === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setF("prioridad", p.value)}
                    style={{
                      height: 34, padding: "0 14px",
                      border: active ? "none" : "1px solid #E2E8F0",
                      borderRadius: 8,
                      background: active ? p.activeColor + "18" : "#fff",
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? p.activeColor : "#475569",
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {categorias.map(c => {
                  const active = form.categoria_id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setF("categoria_id", active ? "" : c.id)}
                      style={{
                        height: 26, padding: "0 9px",
                        border: "none", borderRadius: 4,
                        background: active ? (c.color ?? "#1E3A8A") : "#F3F4F6",
                        color: active ? "#fff" : "#374151",
                        fontSize: 11.5, fontWeight: active ? 600 : 400,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
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
        borderTop: "1px solid #E2E8F0", padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#fff", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          {error && <span style={{ fontSize: 12.5, color: "#DC2626" }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: 40, padding: "0 18px",
              border: "1px solid #E2E8F0", borderRadius: 8,
              background: "#fff", color: "#475569",
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
              background: saving ? "#64748B" : "linear-gradient(135deg, #1E3A8A, #2563EB)",
              color: "#fff",
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
