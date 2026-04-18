"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Loader2, Upload, User, MapPin, Settings2,
  Clock, CalendarDays, Tag, X, Check, ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Usuario, Ubicacion, Activo, CategoriaOT, Prioridad, TipoTrabajo, Recurrencia } from "@/types/ordenes";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  usuarios:   Usuario[];
  ubicaciones: Ubicacion[];
  activos:    Activo[];
  categorias: CategoriaOT[];
  myId:       string;
  wsId:       string;
}

interface FormState {
  titulo:           string;
  descripcion:      string;
  ubicacion_id:     string;
  activo_id:        string;
  asignados_ids:    string[];
  tiempo_h:         string;
  tiempo_m:         string;
  fecha_termino:    string;
  fecha_inicio:     string;
  recurrencia:      Recurrencia;
  tipo_trabajo:     TipoTrabajo | "";
  prioridad:        Prioridad;
  categoria_id:     string;
}

const BLANK: FormState = {
  titulo: "", descripcion: "",
  ubicacion_id: "", activo_id: "",
  asignados_ids: [],
  tiempo_h: "", tiempo_m: "",
  fecha_termino: "", fecha_inicio: "",
  recurrencia: "ninguna", tipo_trabajo: "",
  prioridad: "ninguna", categoria_id: "",
};

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORIDADES: { value: Prioridad; label: string; activeColor: string }[] = [
  { value: "ninguna", label: "Sin prioridad", activeColor: "#6B7280" },
  { value: "baja",    label: "Baja",          activeColor: "#6B7280" },
  { value: "media",   label: "Media",         activeColor: "#2563EB" },
  { value: "alta",    label: "Alta",          activeColor: "#EA580C" },
  { value: "urgente", label: "Urgente",       activeColor: "#DC2626" },
];

const TIPOS: { value: TipoTrabajo; label: string }[] = [
  { value: "reactiva",   label: "Reactiva" },
  { value: "preventiva", label: "Preventiva" },
  { value: "inspeccion", label: "Inspección" },
  { value: "mejora",     label: "Mejora" },
];

const RECURRENCIAS: { value: Recurrencia; label: string }[] = [
  { value: "ninguna",   label: "Sin recurrencia" },
  { value: "diaria",    label: "Diaria" },
  { value: "semanal",   label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual",   label: "Mensual" },
];

// ── Shared field row ─────────────────────────────────────────────────────────

function FieldRow({ icon, label, children }: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: "1px solid #F3F4F6" }}>
      <div style={{ width: 32, paddingTop: 2, display: "flex", justifyContent: "center", flexShrink: 0, color: "#8594A3" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#8594A3", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Searchable dropdown ──────────────────────────────────────────────────────

function SearchSelect({ placeholder, value, options, onChange }: {
  placeholder: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

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
          width: "100%", height: 36, display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6,
          background: "#fff", fontSize: 13.5, color: selected ? "#1E2429" : "#8594A3",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: "#8594A3" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 8px",
                border: "1px solid #E5E7EB", borderRadius: 4,
                fontSize: 13, outline: "none", color: "#1E2429",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", fontSize: 13, color: "#8594A3",
                background: !value ? "#EEF1FB" : "transparent",
                border: "none", cursor: "pointer",
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
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", textAlign: "left",
                  padding: "8px 12px", fontSize: 13, color: "#1E2429",
                  background: value === o.id ? "#EEF1FB" : "transparent",
                  border: "none", cursor: "pointer",
                }}
              >
                {value === o.id && <Check size={12} style={{ color: "#273D88", flexShrink: 0 }} />}
                <span>{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "#8594A3" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assignee multi-select ─────────────────────────────────────────────────────

function AssigneeSelect({ usuarios, value, onChange }: {
  usuarios: Usuario[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(query.toLowerCase())
  );

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
      {/* Chips of selected */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: selected.length ? 8 : 0 }}>
        {selected.map(u => (
          <span key={u.id} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 8px 3px 5px",
            background: "#EEF1FB", borderRadius: 20,
            fontSize: 12, color: "#273D88",
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%",
              background: "#273D88", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700,
            }}>
              {initials(u.nombre)}
            </span>
            {u.nombre}
            <button type="button" onClick={() => toggle(u.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#273D88", display: "flex", padding: 0,
            }}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          height: 36, display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6,
          background: "#fff", fontSize: 13.5, color: "#8594A3",
          cursor: "pointer",
        }}
      >
        <User size={14} />
        Asignar técnico
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          minWidth: 240, background: "#fff", border: "1px solid #E5E7EB",
          borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar por nombre…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 8px",
                border: "1px solid #E5E7EB", borderRadius: 4,
                fontSize: 13, outline: "none", color: "#1E2429",
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.map(u => {
              const sel = value.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "9px 12px",
                    background: sel ? "#EEF1FB" : "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: sel ? "#273D88" : "#F3F4F6",
                    color: sel ? "#fff" : "#677888",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(u.nombre)}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1E2429" }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: "#8594A3", textTransform: "capitalize" }}>{u.rol}</div>
                  </div>
                  {sel && <Check size={14} style={{ color: "#273D88", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "#8594A3" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OTCrearForm({ usuarios, ubicaciones, activos, categorias, myId, wsId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setF<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  const ubicOptions = ubicaciones.map(u => ({
    id: u.id,
    label: u.edificio + (u.piso ? ` · ${u.piso}` : "") + (u.detalle ? ` · ${u.detalle}` : ""),
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

    const sb = createClient();
    const timeMin = ((parseInt(form.tiempo_h) || 0) * 60) + (parseInt(form.tiempo_m) || 0) || null;

    const payload = {
      workspace_id:    wsId,
      creado_por:      myId,
      tipo:            "correctiva",
      titulo:          form.titulo.trim(),
      descripcion:     form.descripcion.trim() || "",
      tipo_trabajo:    form.tipo_trabajo || null,
      estado:          "pendiente" as const,
      prioridad:       form.prioridad,
      ubicacion_id:    form.ubicacion_id  || null,
      activo_id:       form.activo_id     || null,
      categoria_id:    form.categoria_id  || null,
      fecha_inicio:    form.fecha_inicio  || null,
      fecha_termino:   form.fecha_termino || null,
      tiempo_estimado: timeMin,
      recurrencia:     form.recurrencia,
      asignados_ids:   form.asignados_ids.length > 0 ? form.asignados_ids : null,
    };

    const { data, error: err } = await sb
      .from("ordenes_trabajo")
      .insert(payload)
      .select("id")
      .single();

    if (err || !data) {
      setError(err?.message ?? "Error al crear la orden.");
      setSaving(false);
      return;
    }

    try {
      await sb.from("actividad_ot").insert({
        orden_id:   (data as { id: string }).id,
        usuario_id: myId,
        tipo:       "creado",
        comentario: form.titulo.trim(),
      });
    } catch { /* ignore */ }

    router.push(`/ordenes`);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: "#F9FAFB" }}>

      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        height: 56, display: "flex", alignItems: "center", gap: 12,
        padding: "0 20px", background: "#fff",
        borderBottom: "1px solid #E5E7EB",
      }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 6,
            border: "1px solid #E5E7EB", background: "#fff",
            cursor: "pointer", color: "#677888",
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: "#1E2429", margin: 0 }}>
          Nueva Orden de Trabajo
        </h1>
      </div>

      {/* ── Body ── */}
      <div>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 32px" }}>

          {/* Title — large prominent input */}
          <div style={{ padding: "20px 0 0" }}>
            <input
              type="text"
              placeholder="¿Qué hay que hacer? (Necesario)"
              value={form.titulo}
              onChange={e => setF("titulo", e.target.value)}
              style={{
                width: "100%", fontSize: 20, fontWeight: 600,
                color: "#1E2429", border: "none", outline: "none",
                background: "transparent", padding: "4px 0",
                borderBottom: "2px solid " + (form.titulo ? "#273D88" : "#E5E7EB"),
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
              onFocus={e => { if (!form.titulo) e.currentTarget.style.borderBottomColor = "#273D88"; }}
            />
          </div>

          {/* Image upload area */}
          <div style={{
            margin: "16px 0", border: "1.5px dashed #D1D5DB", borderRadius: 8,
            padding: "24px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 8, color: "#8594A3", cursor: "pointer",
            background: "#FAFAFA",
          }}>
            <Upload size={22} strokeWidth={1.5} />
            <span style={{ fontSize: 13 }}>Arrastra imágenes o <span style={{ color: "#273D88", fontWeight: 500 }}>busca archivos</span></span>
            <span style={{ fontSize: 11 }}>PNG, JPG, PDF · máx. 10 MB</span>
          </div>

          {/* Description */}
          <div style={{ padding: "4px 0 16px" }}>
            <textarea
              placeholder="Descripción (opcional)"
              value={form.descripcion}
              onChange={e => setF("descripcion", e.target.value)}
              rows={3}
              style={{
                width: "100%", fontSize: 14, color: "#1E2429",
                border: "1px solid #E5E7EB", borderRadius: 6,
                padding: "10px 12px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "#fff", lineHeight: 1.5,
              }}
            />
          </div>

          {/* ── Field rows ── */}

          {/* Location */}
          <FieldRow icon={<MapPin size={16} />} label="Ubicación">
            <SearchSelect
              placeholder="Empiece a escribir…"
              value={form.ubicacion_id}
              options={ubicOptions}
              onChange={v => setF("ubicacion_id", v)}
            />
          </FieldRow>

          {/* Asset */}
          <FieldRow icon={<Settings2 size={16} />} label="Equipo / Activo">
            <SearchSelect
              placeholder="Empiece a escribir…"
              value={form.activo_id}
              options={activoOptions}
              onChange={v => setF("activo_id", v)}
            />
          </FieldRow>

          {/* Assignees */}
          <FieldRow icon={<User size={16} />} label="Asignados">
            <AssigneeSelect
              usuarios={usuarios}
              value={form.asignados_ids}
              onChange={v => setF("asignados_ids", v)}
            />
          </FieldRow>

          {/* Estimated time */}
          <FieldRow icon={<Clock size={16} />} label="Tiempo estimado">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min="0" placeholder="0"
                value={form.tiempo_h}
                onChange={e => setF("tiempo_h", e.target.value)}
                style={{
                  width: 64, height: 36, padding: "0 10px",
                  border: "1px solid #E5E7EB", borderRadius: 6,
                  fontSize: 13.5, textAlign: "center", color: "#1E2429",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <span style={{ fontSize: 13, color: "#8594A3" }}>h</span>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={form.tiempo_m}
                onChange={e => setF("tiempo_m", e.target.value)}
                style={{
                  width: 64, height: 36, padding: "0 10px",
                  border: "1px solid #E5E7EB", borderRadius: 6,
                  fontSize: 13.5, textAlign: "center", color: "#1E2429",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <span style={{ fontSize: 13, color: "#8594A3" }}>min</span>
            </div>
          </FieldRow>

          {/* Due date */}
          <FieldRow icon={<CalendarDays size={16} />} label="Fecha límite">
            <input
              type="date"
              value={form.fecha_termino}
              onChange={e => setF("fecha_termino", e.target.value)}
              style={{
                height: 36, padding: "0 10px",
                border: "1px solid #E5E7EB", borderRadius: 6,
                fontSize: 13.5, color: form.fecha_termino ? "#1E2429" : "#8594A3",
                outline: "none", fontFamily: "inherit", background: "#fff",
              }}
            />
          </FieldRow>

          {/* Start date */}
          <FieldRow icon={<CalendarDays size={16} />} label="Fecha inicio">
            <input
              type="date"
              value={form.fecha_inicio}
              onChange={e => setF("fecha_inicio", e.target.value)}
              style={{
                height: 36, padding: "0 10px",
                border: "1px solid #E5E7EB", borderRadius: 6,
                fontSize: 13.5, color: form.fecha_inicio ? "#1E2429" : "#8594A3",
                outline: "none", fontFamily: "inherit", background: "#fff",
              }}
            />
          </FieldRow>

          {/* Recurrence + Work type — side by side */}
          <div style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8594A3", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Recurrencia
              </div>
              <select
                value={form.recurrencia}
                onChange={e => setF("recurrencia", e.target.value as Recurrencia)}
                style={{
                  width: "100%", height: 36, padding: "0 8px",
                  border: "1px solid #E5E7EB", borderRadius: 6,
                  fontSize: 13.5, color: "#1E2429", outline: "none",
                  background: "#fff", fontFamily: "inherit",
                }}
              >
                {RECURRENCIAS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8594A3", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Tipo de trabajo
              </div>
              <select
                value={form.tipo_trabajo}
                onChange={e => setF("tipo_trabajo", e.target.value as TipoTrabajo | "")}
                style={{
                  width: "100%", height: 36, padding: "0 8px",
                  border: "1px solid #E5E7EB", borderRadius: 6,
                  fontSize: 13.5, color: "#1E2429", outline: "none",
                  background: "#fff", fontFamily: "inherit",
                }}
              >
                <option value="">Sin tipo</option>
                {TIPOS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority — segmented buttons */}
          <div style={{ padding: "14px 0", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8594A3", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Prioridad
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PRIORIDADES.map(p => {
                const active = form.prioridad === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setF("prioridad", p.value)}
                    style={{
                      height: 32, padding: "0 14px",
                      border: `1.5px solid ${active ? p.activeColor : "#E5E7EB"}`,
                      borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 400,
                      background: active ? p.activeColor + "15" : "#fff",
                      color: active ? p.activeColor : "#6B7280",
                      cursor: "pointer", transition: "all 0.1s",
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
            <FieldRow icon={<Tag size={16} />} label="Categoría">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {categorias.map(c => {
                  const active = form.categoria_id === c.id;
                  const bg = active ? (c.color ?? "#273D88") : "#F3F4F6";
                  const color = active ? "#fff" : "#374151";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setF("categoria_id", active ? "" : c.id)}
                      style={{
                        height: 28, padding: "0 10px",
                        border: "none", borderRadius: 4,
                        background: bg, color,
                        fontSize: 12, fontWeight: active ? 600 : 400,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        transition: "all 0.1s",
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

      {/* ── Sticky bottom bar ── */}
      <div style={{
        position: "sticky", bottom: 0,
        background: "#fff", borderTop: "1px solid #E5E7EB",
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          {error && (
            <span style={{ fontSize: 13, color: "#DC2626" }}>{error}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving}
            style={{
              height: 38, padding: "0 18px",
              border: "1px solid #E5E7EB", borderRadius: 6,
              background: "#fff", color: "#4D5A66",
              fontSize: 13.5, fontWeight: 500, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              height: 38, padding: "0 22px",
              border: "none", borderRadius: 6,
              background: saving ? "#9BAEDF" : "#273D88",
              color: "#fff",
              fontSize: 13.5, fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              transition: "background 0.15s",
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            Crear
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
