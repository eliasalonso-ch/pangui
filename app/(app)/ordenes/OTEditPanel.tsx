"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Loader2, User, MapPin, Settings2,
  CalendarDays, Tag, Check, ChevronDown, Building2, Hash, Plus, DollarSign,
  Paperclip, FileText, File,
} from "lucide-react";
import { updateOrden, parseDescMeta, buildDescripcion, ELECTRILAM_WORKSPACE_ID } from "@/lib/ordenes-api";
import { fetchSolicitantes as fetchSolicitantesCatalog, upsertSolicitante, type Solicitante } from "@/lib/solicitantes-api";
import { uploadToR2 } from "@/lib/r2";
import { createClient } from "@/lib/supabase";
import { buildRecurrenciaConfig, RecurrenceControls } from "./RecurrenceControls";
import type {
  OrdenTrabajo, Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Prioridad, TipoTrabajo, Recurrencia, RecurrenciaConfig, OTLink,
} from "@/types/ordenes";
import LinksInput from "@/components/LinksInput";
import CategoriaMultiSelect from "@/components/ordenes/CategoriaMultiSelect";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orden:       OrdenTrabajo;
  usuarios:    Usuario[];
  ubicaciones: Ubicacion[];
  lugares:     LugarEspecifico[];
  sociedades:  Sociedad[];
  activos:     Activo[];
  categorias:  CategoriaOT[];
  myId:        string;
  wsId:        string;
  onClose:     () => void;
  onSaved:     (updated: Partial<OrdenTrabajo>) => void;
}

interface FormState {
  titulo:        string;
  n_ot:          string;
  solicitante:   string;
  solicitante_telefono: string;
  solicitante_email:    string;
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
  recurrencia:   Recurrencia;
  recurrencia_config: RecurrenciaConfig | null;
  tipo_trabajo:  TipoTrabajo | "";
  prioridad:     Prioridad;
  categoria_id:  string;
  links:         OTLink[];
}

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

// ── Shared components (same as OTCrearPanel) ──────────────────────────────────

function FieldRow({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
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
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
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
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 12.5, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
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
                  width: "100%", padding: "10px 12px", fontSize: 13,
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

function AssigneeSelect({ usuarios, value, onChange }: {
  usuarios: Usuario[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filtered = usuarios.filter(u => u.nombre.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
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
              padding: "2px 7px 2px 4px", background: "var(--brand-tint)", borderRadius: 20,
              fontSize: 11.5, color: "var(--brand)",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", background: "var(--brand)", color: "var(--fg-on-brand)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700,
              }}>{initials(u.nombre)}</span>
              {u.nombre}
              <button type="button" onClick={() => toggle(u.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand)", display: "flex", padding: 0, lineHeight: 1 }}>
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
          background: "var(--surface-1)", fontSize: 13, color: "var(--fg-4)", cursor: "pointer", fontFamily: "inherit",
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
            <input autoFocus placeholder="Buscar por nombre…" value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none", color: "var(--fg-1)", fontFamily: "inherit", background: "var(--surface-1)" }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.map(u => {
              const sel = value.includes(u.id);
              return (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: sel ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: sel ? "var(--brand)" : "var(--surface-hover)", color: sel ? "var(--fg-on-brand)" : "var(--fg-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
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
            {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin resultados</div>}
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
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState("");
  const [hitos, setHitos]         = useState<{ id: string; nombre: string }[]>([]);
  const [creating, setCreating]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb
      .from("hitos").select("id, nombre")
      .eq("workspace_id", wsId).order("nombre");
    setHitos(data ?? []);
  }, [wsId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

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
      const { data } = await sb
        .from("hitos").insert({ workspace_id: wsId, nombre })
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
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 13, color: value ? "var(--fg-1)" : "var(--fg-4)",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "Seleccionar o crear ITO…"}
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
              <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin ITOs</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SolicitanteSelect ─────────────────────────────────────────────────────────
// Searchable picker backed by the `solicitantes` catalog. Stores the chosen
// *name* string on the OT (matching mobile), plus an optional phone + email the
// OT snapshots. Picking a catalog entry auto-fills its phone/email; both stay
// editable. The catalog row is upserted on save (see panel save handler).

function SolicitanteSelect({ value, telefono, email, onChange, wsId }: {
  value: string;
  telefono: string;
  email: string;
  onChange: (nombre: string, telefono: string, email: string) => void;
  wsId: string;
}) {
  const [open, setOpen]                 = useState(false);
  const [query, setQuery]               = useState("");
  const [solicitantes, setSolicitantes] = useState<Solicitante[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setSolicitantes(await fetchSolicitantesCatalog(wsId)); } catch { /* non-fatal */ }
  }, [wsId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                  onClick={() => { onChange("", "", ""); setOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13, color: "var(--fg-4)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Quitar solicitante
                </button>
              )}
              {filtered.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onChange(s.nombre, s.telefono ?? "", s.email ?? ""); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 6,
                    width: "100%", padding: "10px 12px", fontSize: 13,
                    background: value === s.nombre ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--fg-1)",
                  }}
                >
                  {value === s.nombre && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 3 }} />}
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div>{s.nombre}</div>
                    {(s.telefono || s.email) && (
                      <div style={{ fontSize: 11, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[s.telefono, s.email].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => { onChange(query.trim(), telefono, email); setQuery(""); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    width: "100%", padding: "10px 12px", fontSize: 13, fontWeight: 600,
                    background: "var(--brand-tint)", color: "var(--brand)",
                    border: "none", borderTop: "1px solid var(--border)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Plus size={11} />
                  Crear "{query.trim()}"
                </button>
              )}
              {filtered.length === 0 && !canCreate && (
                <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin solicitantes</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contact info — snapshotted onto the OT, auto-filled from the catalog. */}
      {value && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input
            type="tel"
            placeholder="Teléfono"
            value={telefono}
            onChange={e => onChange(value, e.target.value, email)}
            style={{ height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--fg-1)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)" }}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => onChange(value, telefono, e.target.value)}
            style={{ height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--fg-1)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OTEditPanel({
  orden, usuarios, ubicaciones, lugares, sociedades, activos, categorias,
  myId, wsId, onClose, onSaved,
}: Props) {
  const _meta = parseDescMeta(orden.descripcion ?? null);
  const [form, setForm] = useState<FormState>({
    titulo:        orden.titulo ?? "",
    n_ot:          _meta.nOT          ?? "",
    solicitante:   orden.solicitante ?? _meta.solicitante ?? "",
    solicitante_telefono: orden.solicitante_telefono ?? "",
    solicitante_email:    orden.solicitante_email ?? "",
    hito:          _meta.hito         ?? "",
    presupuesto:   orden.presupuesto  ?? "",
    descripcion:   _meta.descripcion  ?? "",
    ubicacion_id:  orden.ubicacion_id  ?? "",
    lugar_id:      orden.lugar_id      ?? "",
    sociedad_id:   orden.sociedad_id   ?? "",
    activo_id:     orden.activo_id     ?? "",
    asignados_ids: orden.asignados_ids ?? [],
    fecha_termino: orden.fecha_termino ? orden.fecha_termino.slice(0, 10) : "",
    fecha_inicio:  orden.fecha_inicio  ? orden.fecha_inicio.slice(0, 10)  : "",
    recurrencia:   orden.recurrencia   ?? "ninguna",
    recurrencia_config: orden.recurrencia_config ?? null,
    tipo_trabajo:  orden.tipo_trabajo  ?? "reactiva",
    prioridad:     orden.prioridad,
    categoria_id:  orden.categoria_id  ?? "",
    links:         Array.isArray(orden.links) ? orden.links : [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  interface DraftAdjunto { file: File; nombre: string }
  const [adjuntos, setAdjuntos] = useState<DraftAdjunto[]>([]);

  // Categorías — multiple selection (parity with OTCrearPanel/mobile). Seeds
  // from the array column, falling back to the single legacy column.
  const [categoriaIds, setCategoriaIds] = useState<string[]>(
    () => orden.categoria_ids ?? (orden.categoria_id ? [orden.categoria_id] : []),
  );
  const adjuntoInputRef = useRef<HTMLInputElement | null>(null);


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
    .filter(l => !form.ubicacion_id || l.ubicacion_id === form.ubicacion_id)
    .map(l => ({ id: l.id, label: l.nombre, sub: l.ubicaciones?.edificio }));

  const sociedadOptions = sociedades.map(s => ({ id: s.id, label: s.nombre }));
  const activoOptions   = activos.map(a => ({ id: a.id, label: a.nombre + (a.numero_serie ? ` (${a.numero_serie})` : "") }));

  const save = async () => {
    if (!form.titulo.trim()) { setError("El título es obligatorio."); return; }
    setSaving(true);
    setError(null);
    try {
      const uploadedLinks: OTLink[] = [];
      for (const a of adjuntos) {
        try {
          const url = await uploadToR2(a.file, `ordenes/${orden.id}/adjuntos`);
          uploadedLinks.push({ url, nombre: a.nombre, tipo: "archivo", origen: "creacion" });
        } catch { /* non-fatal */ }
      }
      const allLinks = [
        ...form.links.filter(l => l.url.trim()),
        ...uploadedLinks,
      ];
      // Keep the workspace catalog's contact info in sync (best-effort).
      if (form.solicitante.trim()) {
        try {
          await upsertSolicitante(wsId, form.solicitante, form.solicitante_telefono, form.solicitante_email);
        } catch { /* non-fatal — the OT snapshot is authoritative for this OT */ }
      }
      const updated = await updateOrden(
        orden.id,
        myId,
        {
          titulo:        form.titulo.trim(),
          descripcion:   buildDescripcion({ nOT: form.n_ot, solicitante: form.solicitante, hito: form.hito, body: form.descripcion }),
          n_serie:       form.n_ot.trim()          || null,
          solicitante:   form.solicitante.trim()  || null,
          solicitante_telefono: form.solicitante_telefono.trim() || null,
          solicitante_email:    form.solicitante_email.trim()    || null,
          hito:          form.hito.trim()         || null,
          presupuesto:   form.presupuesto.trim()  || null,
          prioridad:     form.prioridad,
          tipo_trabajo:  form.tipo_trabajo || null,
          clasificacion: form.tipo_trabajo === "levantamiento" ? "levantamiento" : form.tipo_trabajo ? "ejecucion" : undefined,
          categoria_id:  categoriaIds[0] ?? null,
          categoria_ids: categoriaIds.length > 0 ? categoriaIds : null,
          recurrencia:   form.recurrencia,
          recurrencia_config: buildRecurrenciaConfig(form),
          fecha_inicio:  form.fecha_inicio  || null,
          fecha_termino: form.fecha_termino || null,
          ubicacion_id:  form.ubicacion_id  || null,
          lugar_id:      form.lugar_id      || null,
          sociedad_id:   form.sociedad_id   || null,
          activo_id:     form.activo_id     || null,
          asignados_ids: form.asignados_ids.length > 0 ? form.asignados_ids : null,
          links:         allLinks,
        },
        orden.asignados_ids,
      );
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
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
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>
          Editar Orden de Trabajo
        </h2>
        <button
          type="button" onClick={onClose}
          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", cursor: "pointer", color: "var(--fg-3)" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable body */}
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
                width: "100%", fontSize: 22, fontWeight: 400, color: "var(--fg-1)",
                border: "none", outline: "none", background: "transparent", padding: "8px 0",
                borderBottom: form.titulo ? "2px solid var(--brand)" : "2px solid var(--border)",
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tipo de trabajo</div>
            <select value={form.tipo_trabajo} onChange={e => setF("tipo_trabajo", e.target.value as TipoTrabajo | "")}
              style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--fg-1)", outline: "none", background: "var(--surface-1)", fontFamily: "inherit" }}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Adjuntos */}
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Paperclip size={13} style={{ color: "var(--fg-4)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Adjuntos
                </span>
              </div>
              <button
                type="button"
                onClick={() => adjuntoInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", border: "1px solid var(--brand)", borderRadius: 5, background: "var(--brand-tint)", color: "var(--brand)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
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
            {/* Existing file links */}
            {form.links.filter(l => l.tipo === "archivo").length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: adjuntos.length ? 12 : 0 }}>
                {form.links.filter(l => l.tipo === "archivo").map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
                    <FileText size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.nombre || l.url.split("/").pop()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setF("links", form.links.filter(x => x !== l))}
                      style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* New draft files */}
            {adjuntos.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adjuntos.map((a, i) => {
                  const ext = a.file.name.split(".").pop()?.toLowerCase() ?? "";
                  const isDoc = ["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","dwg","dxf"].includes(ext);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--brand)", borderRadius: 6, background: "var(--brand-tint)" }}>
                      {isDoc ? <FileText size={13} style={{ color: "var(--brand)", flexShrink: 0 }} /> : <File size={13} style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
                      <input
                        type="text"
                        value={a.nombre}
                        onChange={e => setAdjuntos(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))}
                        style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", minWidth: 0 }}
                      />
                      <span style={{ fontSize: 11, color: "var(--fg-3)", flexShrink: 0 }}>{(a.file.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => setAdjuntos(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {form.links.filter(l => l.tipo === "archivo").length === 0 && adjuntos.length === 0 && (
              <button
                type="button"
                onClick={() => adjuntoInputRef.current?.click()}
                style={{ width: "100%", border: "1.5px dashed var(--brand)", borderRadius: 8, padding: "18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--brand)", cursor: "pointer", background: "var(--brand-tint)", fontFamily: "inherit" }}
              >
                <Paperclip size={18} strokeWidth={1.5} />
                <span style={{ fontSize: 12 }}>PDF, Word, Excel, TXT, CSV, DWG, MP3, M4A…</span>
              </button>
            )}
          </div>

          {/* Links */}
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Links
            </label>
            <LinksInput
              links={form.links.filter(l => l.tipo !== "archivo")}
              onChange={newLinks => setF("links", [...form.links.filter(l => l.tipo === "archivo"), ...newLinks])}
            />
          </div>

          <FieldRow icon={<Hash size={14} />} label="N° de OT">
            <input
              type="text"
              placeholder="Ej: SF920260325921"
              value={form.n_ot}
              onChange={e => setF("n_ot", e.target.value)}
              style={{ width:"100%", height:40, padding:"0 12px", border:"1px solid var(--border)", borderRadius:8, fontSize:13, color:"var(--fg-1)", outline:"none", fontFamily:"monospace", background:"var(--surface-1)" }}
            />
          </FieldRow>

          <FieldRow icon={<User size={14} />} label="Solicitante">
            <SolicitanteSelect
              value={form.solicitante}
              telefono={form.solicitante_telefono}
              email={form.solicitante_email}
              onChange={(nombre, tel, mail) => setForm(prev => ({ ...prev, solicitante: nombre, solicitante_telefono: tel, solicitante_email: mail }))}
              wsId={wsId}
            />
          </FieldRow>

          {/* ITOs — Electrilam-exclusive feature. */}
          {wsId === ELECTRILAM_WORKSPACE_ID && (
            <FieldRow icon={<Tag size={14} />} label="ITO">
              <HitoSelect value={form.hito} onChange={v => setF("hito", v)} wsId={wsId} />
            </FieldRow>
          )}

          <FieldRow icon={<DollarSign size={14} />} label="N° de presupuesto">
            <input
              type="text"
              placeholder="Ej: PRE-2025-001"
              value={form.presupuesto}
              onChange={e => setF("presupuesto", e.target.value)}
              style={{ width:"100%", height:40, padding:"0 12px", border:"1px solid var(--border)", borderRadius:8, fontSize:13, color:"var(--fg-1)", outline:"none", fontFamily:"inherit", background:"var(--surface-1)" }}
            />
          </FieldRow>

          <FieldRow icon={<Building2 size={14} />} label="Sociedad">
            <SearchSelect placeholder="Seleccionar sociedad…" value={form.sociedad_id} options={sociedadOptions} onChange={v => setF("sociedad_id", v)} />
          </FieldRow>

          <FieldRow icon={<MapPin size={14} />} label="Ubicación">
            <SearchSelect placeholder="Empiece a escribir…" value={form.ubicacion_id} options={ubicOptions} onChange={v => setF("ubicacion_id", v)} />
          </FieldRow>

          <FieldRow icon={<MapPin size={14} />} label="Lugar específico">
            <SearchSelect placeholder="Seleccionar lugar…" value={form.lugar_id} options={lugarOptions} onChange={v => setF("lugar_id", v)} />
          </FieldRow>

          <FieldRow icon={<Settings2 size={14} />} label="Activo">
            <SearchSelect placeholder="Empiece a escribir…" value={form.activo_id} options={activoOptions} onChange={v => setF("activo_id", v)} />
          </FieldRow>

          <FieldRow icon={<User size={14} />} label="Asignar a">
            <AssigneeSelect usuarios={usuarios} value={form.asignados_ids} onChange={v => setF("asignados_ids", v)} />
          </FieldRow>

          <FieldRow icon={<CalendarDays size={14} />} label="Fecha de inicio">
            <input type="date" value={form.fecha_inicio} onChange={e => setF("fecha_inicio", e.target.value)}
              style={{ height: 40, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: form.fecha_inicio ? "var(--fg-1)" : "var(--fg-4)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)" }}
            />
          </FieldRow>

          <FieldRow icon={<CalendarDays size={14} />} label="Fecha de vencimiento">
            <input type="date" value={form.fecha_termino} onChange={e => setF("fecha_termino", e.target.value)}
              style={{ height: 40, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: form.fecha_termino ? "var(--fg-1)" : "var(--fg-4)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)" }}
            />
          </FieldRow>

          {/* Recurrence */}
          {/* Recurrence — Repetir + Terminar repetición (mirrors the mobile app) */}
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Recurrencia</div>
            <RecurrenceControls
              value={form}
              onChange={next => setForm(prev => ({ ...prev, ...next }))}
            />
          </div>

          {/* Priority */}
          <div style={{ padding: "24px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Prioridad</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PRIORIDADES.map((p) => {
                const active = form.prioridad === p.value;
                return (
                  <button key={p.value} type="button" onClick={() => setF("prioridad", p.value)}
                    style={{ height: 40, padding: "0 16px", border: active ? "none" : "1px solid var(--border)", borderRadius: 8, background: active ? "var(--surface-hover)" : "var(--surface-1)", fontSize: 13, fontWeight: active ? 700 : 500, color: active ? p.activeColor : "var(--fg-2)", cursor: "pointer", transition: "all 0.12s", fontFamily: "inherit" }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories */}
          {categorias.length > 0 && (
            <FieldRow icon={<Tag size={14} />} label="Categorías">
              <CategoriaMultiSelect categorias={categorias} value={categoriaIds} onChange={setCategoriaIds} />
            </FieldRow>
          )}

        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-1)", flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          {error && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ height: 40, padding: "0 18px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={saving}
            style={{ height: 40, padding: "0 24px", border: "none", borderRadius: 8, background: saving ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))", color: "var(--fg-on-brand)", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: 7, transition: "opacity 0.15s", fontFamily: "inherit", boxShadow: saving ? "none" : "0 2px 6px rgba(37,99,235,0.25)" }}>
            {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            Guardar
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
