"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Loader2, Upload, User, MapPin, Settings2,
  Clock, CalendarDays, Tag, X, Check, ChevronDown,
  Camera, Plus, Trash2, ImagePlus, GripVertical,
  Paperclip, FileText, File, Link2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadFotoGrupo, createFotoGrupo, addFotoToGrupo } from "@/lib/foto-grupos-api";
import { uploadToR2 } from "@/lib/r2";
import LinksInput from "@/components/LinksInput";
import type { Usuario, Ubicacion, Activo, CategoriaOT, Prioridad, TipoTrabajo, Recurrencia, OTLink } from "@/types/ordenes";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DraftFoto {
  file: File;
  preview: string;
}

interface DraftGrupo {
  id: string;
  titulo: string;
  descripcion: string;
  fotos: DraftFoto[];
}

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
  { value: "ninguna", label: "Sin prioridad", activeColor: "var(--fg-3)" },
  { value: "baja",    label: "Baja",          activeColor: "var(--fg-3)" },
  { value: "media",   label: "Media",         activeColor: "var(--brand)" },
  { value: "alta",    label: "Alta",          activeColor: "var(--warning)" },
  { value: "urgente", label: "Urgente",       activeColor: "var(--danger)" },
];

const TIPOS: { value: TipoTrabajo; label: string }[] = [
  { value: "reactiva",      label: "Reactiva" },
  { value: "preventiva",    label: "Preventiva" },
  { value: "inspeccion",    label: "Inspección" },
  { value: "mejora",        label: "Mejora" },
  { value: "levantamiento", label: "Levantamiento" },
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 32, paddingTop: 2, display: "flex", justifyContent: "center", flexShrink: 0, color: "var(--fg-3)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
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
          padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6,
          background: "var(--surface-1)", fontSize: 13.5, color: selected ? "var(--fg-1)" : "var(--fg-3)",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: "var(--fg-3)" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 6,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 8px",
                border: "1px solid var(--border)", borderRadius: 4,
                fontSize: 13, outline: "none", color: "var(--fg-1)", background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", fontSize: 13, color: "var(--fg-3)",
                background: !value ? "var(--brand-tint)" : "transparent",
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
                  padding: "8px 12px", fontSize: 13, color: "var(--fg-1)",
                  background: value === o.id ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
              >
                {value === o.id && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <span>{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--fg-3)" }}>Sin resultados</div>
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
    setOpen(false);
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
            background: "var(--brand-tint)", borderRadius: 20,
            fontSize: 12, color: "var(--brand)",
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%",
              background: "var(--brand)", color: "var(--fg-on-brand)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700,
            }}>
              {initials(u.nombre)}
            </span>
            {u.nombre}
            <button type="button" onClick={() => toggle(u.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--brand)", display: "flex", padding: 0,
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
          padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6,
          background: "var(--surface-1)", fontSize: 13.5, color: "var(--fg-3)",
          cursor: "pointer",
        }}
      >
        <User size={14} />
        Asignar técnico
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          minWidth: 240, background: "var(--surface-1)", border: "1px solid var(--border)",
          borderRadius: 6, boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar por nombre…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 8px",
                border: "1px solid var(--border)", borderRadius: 4,
                fontSize: 13, outline: "none", color: "var(--fg-1)", background: "var(--surface-1)",
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
                    background: sel ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: sel ? "var(--brand)" : "var(--surface-hover)",
                    color: sel ? "var(--fg-on-brand)" : "var(--fg-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(u.nombre)}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)" }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "capitalize" }}>{u.rol}</div>
                  </div>
                  {sel && <Check size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--fg-3)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function genDraftId() { return Math.random().toString(36).slice(2); }

export default function OTCrearForm({ usuarios, ubicaciones, activos, categorias, myId, wsId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<DraftGrupo[]>([]);
  const grupoFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Adjuntos (files to attach)
  interface DraftAdjunto { file: File; nombre: string }
  const [adjuntos, setAdjuntos] = useState<DraftAdjunto[]>([]);
  const adjuntoInputRef = useRef<HTMLInputElement | null>(null);

  // URL links
  const [links, setLinks] = useState<OTLink[]>([]);

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
      clasificacion:   form.tipo_trabajo === "levantamiento" ? "levantamiento" : form.tipo_trabajo ? "ejecucion" : null,
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

    const ordenId = (data as { id: string }).id;

    // Upload file attachments + URL links
    const urlLinks: OTLink[] = links.filter(l => l.url.trim()).map(l => ({ ...l, tipo: "link" as const }));
    const adjuntoLinks: OTLink[] = [];
    for (const a of adjuntos) {
      try {
        const url = await uploadToR2(a.file, `ordenes/${ordenId}/adjuntos`);
        adjuntoLinks.push({ url, nombre: a.nombre, tipo: "archivo" });
      } catch { /* non-fatal */ }
    }
    const allLinks = [...urlLinks, ...adjuntoLinks];
    if (allLinks.length > 0) {
      await sb.from("ordenes_trabajo").update({ links: allLinks }).eq("id", ordenId);
    }

    // Upload photo groups
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      if (!g.titulo.trim() && g.fotos.length === 0) continue;
      try {
        const grupo = await createFotoGrupo(ordenId, wsId, myId, g.titulo.trim() || `Grupo ${gi + 1}`, g.descripcion.trim(), gi, "referencia");
        for (let fi = 0; fi < g.fotos.length; fi++) {
          const url = await uploadFotoGrupo(ordenId, g.fotos[fi].file);
          await addFotoToGrupo(grupo.id, url, fi);
        }
      } catch { /* don't block OT creation */ }
    }

    try {
      await sb.from("actividad_ot").insert({
        orden_id:   ordenId,
        usuario_id: myId,
        tipo:       "creado",
        comentario: form.titulo.trim(),
      });
    } catch { /* ignore */ }

    router.push(`/ordenes`);
    router.refresh();
  };

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
    const newFotos: DraftFoto[] = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: "var(--surface-0)" }}>

      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        height: 56, display: "flex", alignItems: "center", gap: 12,
        padding: "0 20px", background: "var(--surface-1)",
        borderBottom: "1px solid var(--border)",
      }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--surface-1)",
            cursor: "pointer", color: "var(--fg-3)",
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>
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
                color: "var(--fg-1)", border: "none", outline: "none",
                background: "transparent", padding: "4px 0",
                borderBottom: "2px solid " + (form.titulo ? "var(--brand)" : "var(--border)"),
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
              onFocus={e => { if (!form.titulo) e.currentTarget.style.borderBottomColor = "var(--brand)"; }}
            />
          </div>

          {/* ── Photo groups ── */}
          <div style={{ margin: "20px 0 8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Camera size={15} style={{ color: "var(--fg-3)" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Grupos de fotos
                </span>
              </div>
              <button
                type="button"
                onClick={addGrupo}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  height: 28, padding: "0 10px",
                  border: "1px solid var(--brand)", borderRadius: 6,
                  background: "var(--brand-tint)", color: "var(--brand)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Plus size={12} />
                Agregar grupo
              </button>
            </div>

            {grupos.length === 0 ? (
              <button
                type="button"
                onClick={addGrupo}
                style={{
                  width: "100%", border: "1.5px dashed var(--border)", borderRadius: 8,
                  padding: "20px", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 6, color: "var(--fg-3)", cursor: "pointer",
                  background: "var(--surface-0)", fontFamily: "inherit",
                }}
              >
                <ImagePlus size={22} strokeWidth={1.5} />
                <span style={{ fontSize: 13 }}>Agrega un grupo de fotos con título y descripción</span>
                <span style={{ fontSize: 11 }}>Ej: "Antes del trabajo", "Instrucciones", "Durante"</span>
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {grupos.map((g, gi) => (
                  <div key={g.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface-1)" }}>
                    {/* Group header */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface-0)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          type="text"
                          placeholder={`Título del grupo (ej. Fotos del trabajo)`}
                          value={g.titulo}
                          onChange={e => updateGrupo(g.id, { titulo: e.target.value })}
                          style={{
                            width: "100%", height: 32, padding: "0 10px",
                            border: "1px solid var(--border)", borderRadius: 5,
                            fontSize: 13, fontWeight: 600, color: "var(--fg-1)",
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
                            width: "100%", height: 30, padding: "0 10px",
                            border: "1px solid var(--border)", borderRadius: 5,
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
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 5, cursor: "pointer", color: "var(--danger)", flexShrink: 0, marginTop: 2 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Photo grid */}
                    <div style={{ padding: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                        {g.fotos.map((f, fi) => (
                          <div key={fi} style={{ position: "relative", aspectRatio: "1", borderRadius: 6, overflow: "hidden", background: "var(--surface-hover)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                              type="button"
                              onClick={() => removeFotoFromDraftGrupo(g.id, fi)}
                              style={{
                                position: "absolute", top: 4, right: 4,
                                width: 20, height: 20, borderRadius: "50%",
                                background: "rgba(0,0,0,0.6)", border: "none",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", color: "#fff",
                              }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                        {/* Add photos button */}
                        <button
                          type="button"
                          onClick={() => grupoFileRefs.current[g.id]?.click()}
                          style={{
                            aspectRatio: "1", border: "1.5px dashed var(--border)", borderRadius: 6,
                            background: "var(--surface-0)", display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: 4,
                            cursor: "pointer", color: "var(--fg-3)",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-3)"; }}
                        >
                          <Upload size={16} />
                          <span style={{ fontSize: 10, fontWeight: 500 }}>Fotos</span>
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
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--fg-3)" }}>
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
                    width: "100%", padding: "10px", border: "1.5px dashed var(--border)", borderRadius: 8,
                    background: "none", color: "var(--fg-3)", fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-3)"; }}
                >
                  <Plus size={14} />
                  Agregar otro grupo
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div style={{ padding: "4px 0 16px" }}>
            <textarea
              placeholder="Descripción (opcional)"
              value={form.descripcion}
              onChange={e => setF("descripcion", e.target.value)}
              rows={3}
              style={{
                width: "100%", fontSize: 14, color: "var(--fg-1)",
                border: "1px solid var(--border)", borderRadius: 6,
                padding: "10px 12px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.5,
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
                  border: "1px solid var(--border)", borderRadius: 6,
                  fontSize: 13.5, textAlign: "center", color: "var(--fg-1)",
                  outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
                }}
              />
              <span style={{ fontSize: 13, color: "var(--fg-3)" }}>h</span>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={form.tiempo_m}
                onChange={e => setF("tiempo_m", e.target.value)}
                style={{
                  width: 64, height: 36, padding: "0 10px",
                  border: "1px solid var(--border)", borderRadius: 6,
                  fontSize: 13.5, textAlign: "center", color: "var(--fg-1)",
                  outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
                }}
              />
              <span style={{ fontSize: 13, color: "var(--fg-3)" }}>min</span>
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
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13.5, color: form.fecha_termino ? "var(--fg-1)" : "var(--fg-3)",
                outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
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
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13.5, color: form.fecha_inicio ? "var(--fg-1)" : "var(--fg-3)",
                outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
              }}
            />
          </FieldRow>

          {/* Recurrence + Work type — side by side */}
          <div style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Recurrencia
              </div>
              <select
                value={form.recurrencia}
                onChange={e => setF("recurrencia", e.target.value as Recurrencia)}
                style={{
                  width: "100%", height: 36, padding: "0 8px",
                  border: "1px solid var(--border)", borderRadius: 6,
                  fontSize: 13.5, color: "var(--fg-1)", outline: "none",
                  background: "var(--surface-1)", fontFamily: "inherit",
                }}
              >
                {RECURRENCIAS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Tipo de trabajo
              </div>
              <select
                value={form.tipo_trabajo}
                onChange={e => setF("tipo_trabajo", e.target.value as TipoTrabajo | "")}
                style={{
                  width: "100%", height: 36, padding: "0 8px",
                  border: "1px solid var(--border)", borderRadius: 6,
                  fontSize: 13.5, color: "var(--fg-1)", outline: "none",
                  background: "var(--surface-1)", fontFamily: "inherit",
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
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
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
                      border: active ? "none" : "1px solid var(--border)",
                      borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 400,
                      background: active ? "var(--surface-hover)" : "var(--surface-1)",
                      color: active ? p.activeColor : "var(--fg-2)",
                      cursor: "pointer", transition: "all 0.1s",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Adjuntos ── */}
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Paperclip size={14} style={{ color: "var(--fg-3)" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Adjuntos
                </span>
              </div>
              <button
                type="button"
                onClick={() => adjuntoInputRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  height: 28, padding: "0 10px",
                  border: "1px solid var(--brand)", borderRadius: 6,
                  background: "var(--brand-tint)", color: "var(--brand)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Plus size={12} />
                Adjuntar archivo
              </button>
              <input
                ref={adjuntoInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.dwg,.dxf,.zip,image/*"
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
                  width: "100%", border: "1.5px dashed var(--border)", borderRadius: 8,
                  padding: "16px", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 5, color: "var(--fg-3)", cursor: "pointer",
                  background: "var(--surface-0)", fontFamily: "inherit",
                }}
              >
                <Paperclip size={20} strokeWidth={1.5} />
                <span style={{ fontSize: 13 }}>PDF, Word, Excel, TXT, CSV, DWG…</span>
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {adjuntos.map((a, i) => {
                  const ext = a.file.name.split(".").pop()?.toLowerCase() ?? "";
                  const isDoc = ["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","dwg","dxf"].includes(ext);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
                      {isDoc ? <FileText size={15} style={{ color: "var(--brand)", flexShrink: 0 }} /> : <File size={15} style={{ color: "var(--fg-3)", flexShrink: 0 }} />}
                      <input
                        type="text"
                        value={a.nombre}
                        onChange={e => setAdjuntos(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))}
                        style={{
                          flex: 1, fontSize: 13, color: "var(--fg-1)", border: "none",
                          outline: "none", background: "transparent", fontFamily: "inherit",
                          minWidth: 0,
                        }}
                      />
                      <span style={{ fontSize: 11, color: "var(--fg-3)", flexShrink: 0 }}>
                        {(a.file.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdjuntos(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => adjuntoInputRef.current?.click()}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 0", background: "none", border: "none",
                    cursor: "pointer", fontSize: 12, color: "var(--fg-3)", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-3)"; }}
                >
                  <Plus size={12} />
                  Agregar más archivos
                </button>
              </div>
            )}
          </div>

          {/* ── Links ── */}
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Link2 size={14} style={{ color: "var(--fg-3)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Links
              </span>
            </div>
            <LinksInput links={links} onChange={setLinks} />
          </div>

          {/* Categories */}
          {categorias.length > 0 && (
            <FieldRow icon={<Tag size={16} />} label="Categoría">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {categorias.map(c => {
                  const active = form.categoria_id === c.id;
                  const bg = active ? (c.color ?? "var(--brand)") : "var(--surface-hover)";
                  const color = active ? "var(--fg-on-brand)" : "var(--fg-2)";
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
        background: "var(--surface-1)", borderTop: "1px solid var(--border)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          {error && (
            <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving}
            style={{
              height: 38, padding: "0 18px",
              border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--surface-1)", color: "var(--fg-2)",
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
              background: saving ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))",
              color: "var(--fg-on-brand)",
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
