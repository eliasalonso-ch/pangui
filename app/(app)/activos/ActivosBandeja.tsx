"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  Box, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Search, Trash2, X,
  Building2, User, MapPin, Calendar, Hash, GitBranch, FileText, Pencil,
  Maximize2, Inbox, Clock, Link2, CheckCircle2, RefreshCw, PlusCircle, ArrowDown,
  Check, Camera, Paperclip, File as FileIcon, Tag, Factory, Truck, AlertCircle,
  MoreVertical,
} from "lucide-react";
import {
  ACTIVO_SELECT, createActivo, deleteActivo, updateActivo,
  fetchActivoOTHistoryPage, fetchActivoActividadPage,
  type ActivoOTHistoryRow, type ActivoActividadRow,
} from "@/lib/activos-api";
import { uploadToR2 } from "@/lib/r2";
import { createClient, logRealtimeChannel } from "@/lib/supabase";
import type {
  Activo, AssetAttachment, AssetCriticality, AssetStatus, Fabricante, LugarEspecifico,
  Modelo, Proveedor, Sociedad, Ubicacion, Usuario,
} from "@/types/ordenes";

const CRITICIDAD_LABEL: Record<AssetCriticality, string> = {
  critico: "Crítico",
  semi_critico: "Semi-crítico",
  no_critico: "No crítico",
};

const CRITICIDAD_COLOR: Record<AssetCriticality, { bg: string; color: string }> = {
  critico: { bg: "var(--danger-bg)", color: "var(--danger)" },
  semi_critico: { bg: "var(--warning-bg)", color: "var(--warning)" },
  no_critico: { bg: "var(--success-bg)", color: "var(--success)" },
};

const ESTADO_LABEL: Record<AssetStatus, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

const ESTADO_COLOR: Record<AssetStatus, string> = {
  operativo: "var(--success)",
  fuera_servicio: "var(--danger)",
  mantencion: "var(--warning)",
  baja: "var(--st-cancel-dot)",
};

// OT estado → label/color for the linked-OTs list (mirrors mobile estadoLabelOT/estadoColor).
const OT_ESTADO_LABEL: Record<string, string> = {
  pendiente: "Sin asignar",
  en_espera: "En espera",
  en_curso: "En curso",
  en_revision: "En revisión",
  completado: "Completada",
  cancelado: "Cancelada",
};
const OT_ESTADO_COLOR: Record<string, string> = {
  pendiente: "#3B82F6",
  en_espera: "#F59E0B",
  en_curso: "#8B5CF6",
  en_revision: "#06B6D4",
  completado: "#10B981",
  cancelado: "#6B7280",
};
function otEstadoLabel(estado: string, asignadosIds?: string[] | null): string {
  if (estado === "pendiente" && (asignadosIds ?? []).length > 0) return "Asignada";
  return OT_ESTADO_LABEL[estado] ?? estado;
}
function otEstadoColor(estado: string): string {
  return OT_ESTADO_COLOR[estado] ?? "var(--fg-4)";
}

// Activity-log visual config (mirrors mobile ACTIVIDAD_META).
const ACTIVIDAD_META: Record<string, { icon: React.ComponentType<{ size?: number }>; color: string; label: string }> = {
  creado:          { icon: PlusCircle,   color: "#10B981", label: "Activo creado" },
  editado:         { icon: Pencil,       color: "#007AFF", label: "Activo editado" },
  estado_cambiado: { icon: RefreshCw,    color: "#F59E0B", label: "Estado cambiado" },
  eliminado:       { icon: Trash2,       color: "#EF4444", label: "Activo dado de baja" },
  ot_vinculada:    { icon: Link2,        color: "#007AFF", label: "OT vinculada" },
  ot_completada:   { icon: CheckCircle2, color: "#10B981", label: "OT completada" },
};

const ESTADO_OPCIONES: AssetStatus[] = ["operativo", "mantencion", "fuera_servicio", "baja"];

type ActivoTab = "general" | "detalles" | "historial";
const ACTIVIDAD_PAGE_SIZE = 20;
const OT_PAGE_SIZE = 20;

type CritFilter = AssetCriticality | "all";

type ActivoSortOption = "nombre_asc" | "nombre_desc" | "estado" | "criticidad" | "created_at_desc";

const ACTIVO_SORT_OPTIONS: { value: ActivoSortOption; label: string }[] = [
  { value: "nombre_asc",      label: "Nombre: A → Z" },
  { value: "nombre_desc",     label: "Nombre: Z → A" },
  { value: "estado",          label: "Estado" },
  { value: "criticidad",      label: "Criticidad: Más alta primero" },
  { value: "created_at_desc", label: "Más recientes primero" },
];

// Criticidad weight for sorting (higher = more critical, floats to top).
const CRIT_ORDER: Record<string, number> = { critico: 3, semi_critico: 2, no_critico: 1 };

interface Props {
  initialActivos: Activo[];
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  lugares: LugarEspecifico[];
  sociedades: Sociedad[];
  fabricantes: Fabricante[];
  modelos: Modelo[];
  proveedores: Proveedor[];
  myRol: string | null;
  wsId: string;
  initialSelectedId?: string | null;
}

function estadoLabel(estado: string | null | undefined) {
  return ESTADO_LABEL[estado as AssetStatus] ?? estado ?? "Sin estado";
}

function estadoColor(estado: string | null | undefined) {
  return ESTADO_COLOR[estado as AssetStatus] ?? "#94A3B8";
}

function ubicacionLabel(activo: Activo) {
  return activo.ubicacion ? [activo.ubicacion.edificio, activo.ubicacion.detalle].filter(Boolean).join(" · ") : null;
}

function AssetFilterDropdown({ label, icon, active, children }: { label: string; icon: React.ReactNode; active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open]);
  const toggleMenu = () => {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(value => !value);
  };
  return <div style={{ position: "relative" }}>
    <button ref={buttonRef} type="button" onClick={toggleMenu} style={{ display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)", borderRadius: 6, background: active ? "var(--brand-tint)" : "var(--surface-1)", color: active ? "var(--brand)" : "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {icon}{label}<ChevronDown size={11} style={{ opacity: 0.5 }} />
    </button>
    {open && createPortal(<div ref={menuRef} style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, zIndex: 10000, minWidth: 220, padding: 6, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-md)" }}>{children}</div>, document.body)}
  </div>;
}

const assetFilterOptionStyle: React.CSSProperties = { display: "flex", alignItems: "center", width: "100%", minHeight: 32, padding: "0 8px", border: 0, borderRadius: 6, background: "transparent", color: "var(--fg-2)", font: "500 12px inherit", textAlign: "left", cursor: "pointer" };

function ActivoRow({ activo, selected, onClick }: { activo: Activo; selected: boolean; onClick: () => void }) {
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const critCfg = CRITICIDAD_COLOR[crit];
  const location = ubicacionLabel(activo);

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        border: selected ? "1px solid var(--brand)" : "1px solid var(--border)",
        borderRadius: 9,
        background: selected ? "var(--brand-tint)" : "var(--surface-1)",
        boxShadow: "var(--shadow-xs)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {activo.imagen_url ? (
        <img src={activo.imagen_url} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0 }} />
      ) : (
        <span style={{ width: 46, height: 46, borderRadius: 8, background: "var(--brand-tint)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand-fg)", flexShrink: 0 }}>
          <Box size={22} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 400, lineHeight: 1.35, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activo.nombre}</span>
        <span style={{ display: "block", marginTop: 3, fontSize: 14, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[activo.numero_serie, location].filter(Boolean).join(" · ") || "Sin n° de serie"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, color: "var(--fg-3)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: estadoColor(activo.estado) }} />
            {estadoLabel(activo.estado)}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 6px", borderRadius: "var(--r-sm)", border: "1px solid var(--border-strong)", background: "transparent", color: "var(--fg-1)", fontSize: 14, fontWeight: 400 }}>
            <AlertCircle size={11} style={{ color: critCfg.color }} />{CRITICIDAD_LABEL[crit]}
          </span>
        </span>
      </span>
    </button>
  );
}

// ── Shared form components (ported from OTEditPanel for design parity) ─────────

function FieldRow({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "22px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 34, paddingTop: 4, display: "flex", justifyContent: "center", flexShrink: 0, color: "var(--fg-4)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)", marginBottom: 10, letterSpacing: "0.01em" }}>
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

function SearchSelect({ placeholder, value, options, onChange, disabled, emptyLabel = "Sin asignar" }: {
  placeholder: string;
  value: string;
  options: { id: string; label: string; sub?: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
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
        disabled={disabled}
        onClick={() => { if (disabled) return; setOpen(!open); setQuery(""); }}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 14, color: selected ? "var(--fg-1)" : "var(--fg-4)",
          cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", opacity: disabled ? 0.6 : 1,
          fontFamily: "inherit",
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
                fontSize: 14, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
                background: "var(--surface-1)", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", fontSize: 14, color: "var(--fg-4)",
                background: !value ? "var(--brand-tint)" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {emptyLabel}
            </button>
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 14,
                  background: value === o.id ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {value === o.id && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ color: "var(--fg-1)" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 14, color: "var(--fg-4)" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Input shared style for the ordenes-style form (40px tall, brand border tokens).
const otInputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, color: "var(--fg-1)", outline: "none",
  fontFamily: "inherit", background: "var(--surface-1)", boxSizing: "border-box",
};

const ESTADO_FORM_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: "operativo", label: "Operativo" },
  { value: "fuera_servicio", label: "Fuera de servicio" },
  { value: "mantencion", label: "En mantención" },
  { value: "baja", label: "De baja" },
];

const CRITICIDAD_FORM_OPTIONS: { value: AssetCriticality; label: string }[] = [
  { value: "critico", label: "Crítico" },
  { value: "semi_critico", label: "Semi-crítico" },
  { value: "no_critico", label: "No crítico" },
];

function ActivoForm({
  activo, usuarios, ubicaciones, lugares, sociedades, fabricantes, modelos, proveedores,
  activos, wsId, onSaved, onClose,
}: {
  activo?: Activo | null;
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  lugares: LugarEspecifico[];
  sociedades: Sociedad[];
  fabricantes: Fabricante[];
  modelos: Modelo[];
  proveedores: Proveedor[];
  activos: Activo[];
  wsId: string;
  onSaved: (activo: Activo) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    nombre: activo?.nombre ?? "",
    descripcion: activo?.descripcion ?? "",
    numero_serie: activo?.numero_serie ?? "",
    año_fabricacion: activo?.año_fabricacion ? String(activo.año_fabricacion) : "",
    criticidad: (activo?.criticidad ?? "no_critico") as AssetCriticality,
    estado: (activo?.estado ?? "operativo") as AssetStatus,
    fabricante_id: activo?.fabricante_id ?? "",
    modelo_id: activo?.modelo_id ?? "",
    ubicacion_id: activo?.ubicacion_id ?? "",
    lugar_id: activo?.lugar_id ?? "",
    sociedad_id: activo?.sociedad_id ?? "",
    responsable_id: activo?.responsable_id ?? "",
    proveedor_id: activo?.proveedor_id ?? "",
    activo_padre_id: activo?.activo_padre_id ?? "",
  });
  const [imagenUrl, setImagenUrl] = useState<string | null>(activo?.imagen_url ?? null);
  const [adjuntos, setAdjuntos] = useState<AssetAttachment[]>(
    Array.isArray(activo?.adjuntos) ? activo!.adjuntos! : [],
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAdjunto, setUploadingAdjunto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const adjuntoInputRef = useRef<HTMLInputElement | null>(null);

  // Stable upload folder: the activo id when editing, else a draft id.
  const uploadFolderRef = useRef<string>(
    activo?.id ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const uploadFolder = uploadFolderRef.current;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Cascading clears, mirroring the mobile edit screen.
      if (key === "fabricante_id") next.modelo_id = "";
      if (key === "ubicacion_id") next.lugar_id = "";
      return next;
    });
  }

  // Filtered option lists
  const ubicOptions = ubicaciones.map(u => ({
    id: u.id,
    label: u.edificio + (u.detalle ? ` · ${u.detalle}` : ""),
    sub: u.sociedades?.nombre ?? undefined,
  }));
  const lugarOptions = lugares
    .filter(l => !form.ubicacion_id || l.ubicacion_id === form.ubicacion_id)
    .map(l => ({ id: l.id, label: l.nombre, sub: l.ubicaciones?.edificio ?? undefined }));
  const sociedadOptions = sociedades.map(s => ({ id: s.id, label: s.nombre }));
  const fabricanteOptions = fabricantes.map(f => ({ id: f.id, label: f.nombre }));
  const modeloOptions = modelos
    .filter(m => !form.fabricante_id || m.fabricante_id === form.fabricante_id)
    .map(m => ({ id: m.id, label: m.nombre, sub: m.fabricante?.nombre ?? undefined }));
  const proveedorOptions = proveedores.map(p => ({ id: p.id, label: p.nombre, sub: p.contacto ?? undefined }));
  const responsableOptions = usuarios.map(u => ({ id: u.id, label: u.nombre }));
  const parentOptions = activos
    .filter(a => a.id !== activo?.id)
    .map(a => ({ id: a.id, label: a.nombre + (a.numero_serie ? ` (${a.numero_serie})` : "") }));

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const url = await uploadToR2(file, `activos/${uploadFolder}`);
      setImagenUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handlePickAdjuntos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingAdjunto(true);
    setError(null);
    try {
      const uploaded: AssetAttachment[] = [];
      for (const file of files) {
        const url = await uploadToR2(file, `activos/${uploadFolder}/adjuntos`);
        const isImage = file.type.startsWith("image/");
        uploaded.push({
          url,
          nombre: file.name,
          tipo: isImage ? "foto" : "archivo",
          mime: file.type || null,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
      }
      setAdjuntos(prev => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el adjunto.");
    } finally {
      setUploadingAdjunto(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const anioNum = form.año_fabricacion.trim() ? Number(form.año_fabricacion.trim()) : null;
    if (anioNum != null && (!Number.isFinite(anioNum) || anioNum < 1900 || anioNum > 2200)) {
      setError("Ingresa un año entre 1900 y 2200.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        numero_serie: form.numero_serie.trim() || null,
        año_fabricacion: anioNum,
        criticidad: form.criticidad,
        estado: form.estado,
        fabricante_id: form.fabricante_id || null,
        modelo_id: form.modelo_id || null,
        ubicacion_id: form.ubicacion_id || null,
        lugar_id: form.lugar_id || null,
        sociedad_id: form.sociedad_id || null,
        responsable_id: form.responsable_id || null,
        proveedor_id: form.proveedor_id || null,
        activo_padre_id: form.activo_padre_id || null,
        imagen_url: imagenUrl,
        adjuntos,
      };
      const saved = activo ? await updateActivo(activo.id, payload) : await createActivo(wsId, payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
      setSaving(false);
    }
  }

  const canSave = form.nombre.trim().length > 0 && !saving;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-1)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
          {activo ? "Editar Activo" : "Nuevo Activo"}
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
        <div style={{ padding: "28px 28px 40px", maxWidth: 1180 }}>

          {/* Title */}
          <div style={{ marginBottom: 24 }}>
            <input
              type="text"
              placeholder="Registra el nombre del activo"
              value={form.nombre}
              onChange={e => set("nombre", e.target.value)}
              style={{
                width: "100%", fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
                border: "none", outline: "none", background: "transparent", padding: "8px 0",
                borderBottom: form.nombre ? "2px solid var(--brand)" : "2px solid var(--border)",
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
            />
          </div>

          {/* Image */}
          <div style={{ marginBottom: 18 }}>
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
            {imagenUrl ? (
              <div>
                <div style={{ position: "relative", height: 240, borderRadius: 8, overflow: "hidden", background: "var(--brand)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagenUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}>
                    {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reemplazar
                  </button>
                  <button type="button" onClick={() => setImagenUrl(null)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--danger)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}>
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                style={{ width: "100%", border: "1.5px dashed var(--brand)", borderRadius: 8, padding: "18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--brand)", cursor: "pointer", background: "var(--brand-tint)", fontFamily: "inherit" }}>
                {uploadingImage ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} strokeWidth={1.5} />}
                <span style={{ fontSize: 14, fontWeight: 400 }}>Agregar foto del activo</span>
              </button>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 4 }}>
            <textarea
              placeholder="Añade una descripción"
              value={form.descripcion}
              onChange={e => set("descripcion", e.target.value)}
              rows={3}
              style={{
                width: "100%", fontSize: 14, color: "var(--fg-1)",
                border: "1px solid var(--border)", borderRadius: 8,
                padding: "12px 14px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.7, minHeight: 92,
                boxSizing: "border-box",
              }}
            />
          </div>

          <FieldRow icon={<Hash size={14} />} label="N° de serie">
            <input
              type="text"
              placeholder="Introduce el número de serie"
              value={form.numero_serie}
              onChange={e => set("numero_serie", e.target.value)}
              style={{ ...otInputStyle, fontFamily: "monospace" }}
            />
          </FieldRow>

          <FieldRow icon={<RefreshCw size={14} />} label="Estado">
            <select value={form.estado} onChange={e => set("estado", e.target.value as AssetStatus)}
              style={otInputStyle}>
              {ESTADO_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>

          <FieldRow icon={<AlertCircle size={14} />} label="Criticidad">
            <select value={form.criticidad} onChange={e => set("criticidad", e.target.value as AssetCriticality)}
              style={otInputStyle}>
              {CRITICIDAD_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>

          <FieldRow icon={<Factory size={14} />} label="Fabricante">
            <SearchSelect placeholder="Elegir fabricante…" value={form.fabricante_id} options={fabricanteOptions} onChange={v => set("fabricante_id", v)} />
          </FieldRow>

          <FieldRow icon={<Tag size={14} />} label="Modelo">
            <SearchSelect
              placeholder={form.fabricante_id ? "Elegir modelo…" : "Elige fabricante primero"}
              value={form.modelo_id}
              options={modeloOptions}
              onChange={v => set("modelo_id", v)}
              disabled={!form.fabricante_id}
            />
          </FieldRow>

          <FieldRow icon={<Calendar size={14} />} label="Año">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 2022"
              value={form.año_fabricacion}
              onChange={e => set("año_fabricacion", e.target.value.replace(/[^0-9]/g, ""))}
              style={otInputStyle}
            />
          </FieldRow>

          <FieldRow icon={<Building2 size={14} />} label="Cliente">
            <SearchSelect placeholder="Elegir cliente…" value={form.sociedad_id} options={sociedadOptions} onChange={v => set("sociedad_id", v)} emptyLabel="Sin cliente" />
          </FieldRow>

          <FieldRow icon={<MapPin size={14} />} label="Ubicación">
            <SearchSelect placeholder="Elegir ubicación…" value={form.ubicacion_id} options={ubicOptions} onChange={v => set("ubicacion_id", v)} emptyLabel="Sin ubicación" />
          </FieldRow>

          <FieldRow icon={<MapPin size={14} />} label="Lugar">
            <SearchSelect
              placeholder={form.ubicacion_id ? "Elegir lugar…" : "Elige ubicación primero"}
              value={form.lugar_id}
              options={lugarOptions}
              onChange={v => set("lugar_id", v)}
              disabled={!form.ubicacion_id}
              emptyLabel="Sin lugar"
            />
          </FieldRow>

          <FieldRow icon={<User size={14} />} label="Responsable">
            <SearchSelect placeholder="Elegir responsable…" value={form.responsable_id} options={responsableOptions} onChange={v => set("responsable_id", v)} emptyLabel="Sin responsable" />
          </FieldRow>

          <FieldRow icon={<Truck size={14} />} label="Proveedor">
            <SearchSelect placeholder="Elegir proveedor…" value={form.proveedor_id} options={proveedorOptions} onChange={v => set("proveedor_id", v)} emptyLabel="Sin proveedor" />
          </FieldRow>

          <FieldRow icon={<GitBranch size={14} />} label="Activo padre">
            <SearchSelect placeholder="Elegir activo padre…" value={form.activo_padre_id} options={parentOptions} onChange={v => set("activo_padre_id", v)} emptyLabel="Sin activo padre" />
          </FieldRow>

          {/* Adjuntos */}
          <div style={{ padding: "24px 0 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Paperclip size={13} style={{ color: "var(--fg-4)" }} />
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)", letterSpacing: "0.01em" }}>
                  Adjuntos
                </span>
              </div>
              <button type="button" onClick={() => adjuntoInputRef.current?.click()} disabled={uploadingAdjunto}
                style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", border: "1px solid var(--brand)", borderRadius: 5, background: "var(--brand-tint)", color: "var(--brand)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}>
                {uploadingAdjunto ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Adjuntar archivo
              </button>
              <input ref={adjuntoInputRef} type="file" multiple style={{ display: "none" }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.dwg,.dxf,.zip,image/*"
                onChange={handlePickAdjuntos} />
            </div>
            {adjuntos.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adjuntos.map((a, i) => {
                  const isImage = a.tipo === "foto" || a.mime?.startsWith("image/");
                  return (
                    <div key={`${a.url}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
                      {isImage
                        ? <FileIcon size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />
                        : <FileText size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.nombre}
                      </span>
                      <button type="button" onClick={() => setAdjuntos(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", flexShrink: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button type="button" onClick={() => adjuntoInputRef.current?.click()} disabled={uploadingAdjunto}
                style={{ width: "100%", border: "1.5px dashed var(--brand)", borderRadius: 8, padding: "18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--brand)", cursor: "pointer", background: "var(--brand-tint)", fontFamily: "inherit" }}>
                <Paperclip size={18} strokeWidth={1.5} />
                <span style={{ fontSize: 14 }}>PDF, Word, Excel, manuales, imágenes…</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-1)", flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          {error && <span style={{ fontSize: 14, color: "var(--danger)" }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ height: 40, padding: "0 18px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}>
            Cancelar
          </button>
          <button type="submit" disabled={!canSave}
            style={{ height: 40, padding: "0 24px", border: "none", borderRadius: 8, background: !canSave ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, cursor: canSave ? "pointer" : "default", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", boxShadow: !canSave ? "none" : "0 2px 6px rgba(37,99,235,0.25)" }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </form>
  );
}

// ── Section header (UPPERCASE label above a card) ──────────────────────────────
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 8px" }}>
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em", margin: 0 }}>{title}</p>
      {action}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
      {children}
    </div>
  );
}

// ── Linked-OT row (General tab + future "ver todos") ───────────────────────────
function ActivoOTRow({ ot, last, onOpen }: { ot: ActivoOTHistoryRow; last: boolean; onOpen: () => void }) {
  const label = otEstadoLabel(ot.estado, ot.asignados_ids);
  const color = otEstadoColor(ot.estado);
  return (
    <button onClick={onOpen} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, textAlign: "left", padding: "13px 16px", border: "none", borderBottom: last ? "none" : "1px solid var(--border)", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
      <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{ot.titulo || "Sin título"}</span>
      {ot.numero != null && <span style={{ fontSize: 14, color: "var(--fg-4)" }}>N° {ot.numero}</span>}
      <span style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: "var(--r-xs)", fontSize: 14, fontWeight: 400, background: color + "22", color }}>{label}</span>
      {ot.creador?.nombre && <span style={{ fontSize: 14, color: "var(--fg-4)" }}>Creada por {ot.creador.nombre}</span>}
      {ot.estado === "completado" && ot.completador?.nombre && <span style={{ fontSize: 14, color: "var(--fg-4)" }}>Completada por {ot.completador.nombre}</span>}
    </button>
  );
}

/**
 * Sentinel that calls `onHit` when scrolled into view. Used for the infinite
 * lists so the next page loads on approach rather than on a click.
 */
function InfiniteSentinel({ onHit, disabled, label }: {
  onHit: () => void; disabled: boolean; label: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the callback in a ref so re-renders don't tear down the observer.
  const hitRef = useRef(onHit);
  hitRef.current = onHit;

  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) hitRef.current(); },
      // Start fetching a bit before the sentinel is actually visible.
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled]);

  if (disabled) return null;
  return (
    <div ref={ref} style={{ padding: "14px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: "var(--fg-4)", fontSize: 14 }}>
      <Loader2 size={13} className="animate-spin" /> {label}
    </div>
  );
}

// ── General tab: metrics + photo + paginated linked OTs ───────────────────────
function GeneralTab({ activo, onFullscreen }: { activo: Activo; onFullscreen: () => void }) {
  const router = useRouter();

  const [rows, setRows] = useState<ActivoOTHistoryRow[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);
    fetchActivoOTHistoryPage(activo.id, 0, OT_PAGE_SIZE)
      .then(({ rows: r, nextPage: np }) => {
        if (!cancelled) { setRows(r); setNextPage(np); }
      })
      .catch(() => { if (!cancelled) { setRows([]); setNextPage(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activo.id]);

  const loadMore = useCallback(async () => {
    if (nextPage == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const { rows: r, nextPage: np } = await fetchActivoOTHistoryPage(activo.id, nextPage, OT_PAGE_SIZE);
      setRows(prev => [...prev, ...r]);
      setNextPage(np);
    } catch {
      // Stop paging on error rather than spinning the sentinel forever.
      setNextPage(null);
    } finally {
      setLoadingMore(false);
    }
  }, [activo.id, nextPage, loadingMore]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {activo.imagen_url && (
        <button onClick={onFullscreen} style={{ position: "relative", width: "100%", height: 300, borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)", border: "1px solid var(--border)", padding: 0, cursor: "pointer", display: "block" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activo.imagen_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          <span style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.45)", borderRadius: "50%", padding: 7, color: "#fff", display: "inline-flex" }}><Maximize2 size={16} /></span>
        </button>
      )}

      <div>
        <SectionHeader
          title="Órdenes de trabajo"
          action={rows.length > 0 ? (
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>
              {rows.length}{nextPage != null ? "+" : ""} en total
            </span>
          ) : undefined}
        />
        <Card>
          {loading ? (
            <div style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--fg-4)", fontSize: 14 }}>
              <Loader2 size={14} className="animate-spin" /> Cargando…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span style={{ width: 52, height: 52, borderRadius: "var(--r-md)", background: "var(--brand-tint)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Inbox size={26} /></span>
              <span style={{ fontSize: 14, color: "var(--fg-4)", textAlign: "center" }}>Aún no hay OTs asociadas a este activo.</span>
            </div>
          ) : (
            <>
              {rows.map((ot, idx) => (
                <ActivoOTRow key={ot.id} ot={ot} last={idx === rows.length - 1 && nextPage == null} onOpen={() => router.push(`/ordenes?id=${encodeURIComponent(ot.id)}`)} />
              ))}
              <InfiniteSentinel onHit={loadMore} disabled={nextPage == null} label="Cargando más OTs…" />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── OTDetail-style meta field: UPPERCASE label + icon-square + value ───────────
function MetaField({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em", marginBottom: 7, marginTop: 0 }}>{label}</p>
      <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0, display: "flex", alignItems: "center", gap: 10, lineHeight: 1.45 }}>
        <span style={{
          width: 28, height: 28, borderRadius: "var(--r-sm)",
          background: "var(--brand-tint)", color: "var(--brand)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</span>
        {value}
      </p>
    </div>
  );
}

// Section label (uppercase, no card) — matches OTDetail.
function MetaSectionLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em", margin: "0 0 14px" }}>{children}</p>
  );
}

const META_GRID: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "24px 56px",
};

// ── Detalles tab — OTDetail idiom: flowing sections + meta-field grids ─────────
function DetallesTab({ activo, hijos, onOpenActivo }: { activo: Activo; hijos: Activo[]; onOpenActivo: (id: string) => void }) {
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const adjuntos = Array.isArray(activo.adjuntos) ? activo.adjuntos : [];
  const ubic = ubicacionLabel(activo);

  const equipoFields = [
    { label: "Criticidad", value: CRITICIDAD_LABEL[crit], icon: <AlertCircle size={16} /> },
    { label: "Fabricante", value: activo.fabricante?.nombre ?? "Sin fabricante", icon: <Factory size={16} /> },
    { label: "Modelo", value: activo.modelo?.nombre ?? "Sin modelo", icon: <Tag size={16} /> },
    { label: "N° de serie", value: activo.numero_serie ?? "Sin número de serie", icon: <Hash size={16} /> },
    { label: "Año", value: activo.año_fabricacion ? String(activo.año_fabricacion) : "Sin año", icon: <Calendar size={16} /> },
    { label: "Proveedor", value: activo.proveedor?.nombre ?? "Sin proveedor", icon: <Truck size={16} /> },
  ];

  const ubicFields = [
    { label: "Cliente", value: activo.sociedad?.nombre ?? "Sin cliente", icon: <Building2 size={16} /> },
    { label: "Ubicación", value: ubic ?? "Sin ubicación", icon: <MapPin size={16} /> },
    { label: "Lugar", value: activo.lugar?.nombre ?? "Sin lugar específico", icon: <MapPin size={16} /> },
    { label: "Responsable", value: activo.responsable?.nombre ?? "Sin responsable", icon: <User size={16} /> },
  ];

  return (
    <div>
      {/* Description — plain flowing text, no card */}
      {activo.descripcion && (
        <div style={{ maxWidth: 1100, marginBottom: 4 }}>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em", margin: "0 0 4px" }}>Descripción</p>
          <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{activo.descripcion}</p>
        </div>
      )}

      {/* Equipo */}
      {equipoFields.length > 0 && (
        <div style={{ marginTop: activo.descripcion ? 32 : 0, paddingTop: activo.descripcion ? 26 : 0, borderTop: activo.descripcion ? "1px solid var(--border)" : "none" }}>
          <MetaSectionLabel>Equipo</MetaSectionLabel>
          <div style={META_GRID}>
            {equipoFields.map(f => <MetaField key={f.label} {...f} />)}
          </div>
        </div>
      )}

      {/* Ubicación y responsabilidad */}
      {ubicFields.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 26, borderTop: "1px solid var(--border)" }}>
          <MetaSectionLabel>Ubicación y responsabilidad</MetaSectionLabel>
          <div style={META_GRID}>
            {ubicFields.map(f => <MetaField key={f.label} {...f} />)}
          </div>
        </div>
      )}

      {/* Adjuntos y manuales */}
      {adjuntos.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 26, borderTop: "1px solid var(--border)" }}>
          <MetaSectionLabel>Adjuntos y manuales</MetaSectionLabel>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            {adjuntos.map((a, idx) => (
              <a key={`${a.url}-${idx}`} href={a.url} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-0)", textDecoration: "none", color: "var(--fg-1)", maxWidth: "100%" }}>
                <span style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--brand-tint)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={16} /></span>
                <span style={{ fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre ?? a.tipo ?? "Adjunto"}</span>
                <ExternalLink size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Jerarquía */}
      <div style={{ marginTop: 32, paddingTop: 26, borderTop: "1px solid var(--border)" }}>
          <MetaSectionLabel>Jerarquía</MetaSectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activo.parent ? (
              <button onClick={() => onOpenActivo(activo.parent!.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><GitBranch size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em" }}>Activo padre</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activo.parent.nombre}</span>
                </span>
                <ChevronRight size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
              </button>
            ) : (
              <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)" }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-hover)", color: "var(--fg-4)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><GitBranch size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em" }}>Activo padre</span><span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)" }}>Sin activo padre</span></span>
              </div>
            )}
            {hijos.map(h => (
              <button key={h.id} onClick={() => onOpenActivo(h.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-hover)", color: "var(--fg-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ArrowDown size={15} /></span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.nombre}</span>
                <ChevronRight size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
              </button>
            ))}
          </div>
      </div>
    </div>
  );
}

// ── Historial tab (paginated activity log) ─────────────────────────────────────
function estadoLabelRaw(e: string): string {
  return ESTADO_LABEL[e as AssetStatus] ?? e;
}

function HistorialTab({ activoId, onOpenOT }: { activoId: string; onOpenOT: (otId: string) => void }) {
  const [rows, setRows] = useState<ActivoActividadRow[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);
    fetchActivoActividadPage(activoId, 0, ACTIVIDAD_PAGE_SIZE)
      .then(({ rows: r, nextPage: np }) => { if (!cancelled) { setRows(r); setNextPage(np); } })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activoId]);

  const loadMore = useCallback(async () => {
    if (nextPage == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const { rows: r, nextPage: np } = await fetchActivoActividadPage(activoId, nextPage, ACTIVIDAD_PAGE_SIZE);
      setRows(prev => [...prev, ...r]);
      setNextPage(np);
    } catch {
      setNextPage(null);
    } finally {
      setLoadingMore(false);
    }
  }, [activoId, nextPage, loadingMore]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>Cargando historial…</div>;
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span style={{ width: 64, height: 64, borderRadius: "var(--r-md)", background: "var(--brand-tint)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Clock size={30} /></span>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Sin actividad</span>
        <span style={{ fontSize: 14, color: "var(--fg-4)", textAlign: "center" }}>Los cambios y las OTs de este activo se registrarán aquí.</span>
      </div>
    );
  }

  return (
    <div>
      <Card>
        {rows.map((a, idx) => {
          const cfg = ACTIVIDAD_META[a.tipo] ?? { icon: Box, color: "var(--fg-4)", label: a.tipo };
          const Icon = cfg.icon;
          const isOT = a.tipo === "ot_vinculada" || a.tipo === "ot_completada";
          const otId = typeof a.meta?.orden_id === "string" ? (a.meta.orden_id as string) : null;
          const detalle = a.tipo === "estado_cambiado" && a.meta?.de && a.meta?.a
            ? `${estadoLabelRaw(a.meta.de as string)} → ${estadoLabelRaw(a.meta.a as string)}`
            : a.comentario;
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderBottom: idx === rows.length - 1 && nextPage == null ? "none" : "1px solid var(--border)" }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: cfg.color + "1A", color: cfg.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Icon size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{cfg.label}</p>
                {detalle && (isOT && otId ? (
                  <button onClick={() => onOpenOT(otId)} style={{ margin: "2px 0 0", padding: 0, border: "none", background: "none", fontSize: 14, fontWeight: 400, color: "var(--brand)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>{detalle}</button>
                ) : (
                  <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--fg-1)" }}>{detalle}</p>
                ))}
                <div style={{ marginTop: 4, fontSize: 14, color: "var(--fg-4)" }}>
                  {new Date(a.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
                  {" · "}
                  {new Date(a.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  {a.usuario?.nombre ? ` · ${a.usuario.nombre}` : ""}
                </div>
              </div>
            </div>
          );
        })}
        <InfiniteSentinel onHit={loadMore} disabled={nextPage == null} label="Cargando más actividad…" />
      </Card>
    </div>
  );
}

function ActivoDetail({
  activo, activos, onEdit, onClose, onDeleted, onUpdated,
}: {
  activo: Activo;
  activos: Activo[];
  onEdit: () => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (activo: Activo) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ActivoTab>("general");
  const [deleting, setDeleting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [estadoMenuOpen, setEstadoMenuOpen] = useState(false);
  const [changingEstado, setChangingEstado] = useState(false);
  const [accionesMenuOpen, setAccionesMenuOpen] = useState(false);
  const estadoMenuRef = useRef<HTMLDivElement>(null);
  const accionesMenuRef = useRef<HTMLDivElement>(null);
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const critCfg = CRITICIDAD_COLOR[crit];
  const hijos = activos.filter(a => a.activo_padre_id === activo.id);

  // Reset to the first tab whenever a different asset is opened.
  useEffect(() => { setTab("general"); }, [activo.id]);

  // Close the estado and acciones menus on outside click.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (estadoMenuRef.current && !estadoMenuRef.current.contains(target)) setEstadoMenuOpen(false);
      if (accionesMenuRef.current && !accionesMenuRef.current.contains(target)) setAccionesMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function handleDelete() {
    if (!confirm("¿Eliminar este activo? Se ocultará del catálogo, pero las OTs históricas conservarán su referencia.")) return;
    setDeleting(true);
    await deleteActivo(activo.id);
    onDeleted(activo.id);
  }

  // Quick estado change — saves immediately, like the mobile ActionSheet.
  async function handleChangeEstado(nuevo: AssetStatus) {
    setEstadoMenuOpen(false);
    if (nuevo === activo.estado) return;
    setChangingEstado(true);
    try {
      const saved = await updateActivo(activo.id, { nombre: activo.nombre, estado: nuevo });
      onUpdated(saved);
    } finally {
      setChangingEstado(false);
    }
  }

  const openActivo = (id: string) => router.push(`/activos/activos?id=${encodeURIComponent(id)}`);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* ── Header ── */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)", padding: "22px 27px 21px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", minHeight: 42, gap: 12 }}>
          <h1 style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, letterSpacing: "-0.02em", color: "var(--fg-1)", margin: 0, lineHeight: 1.25, overflowWrap: "break-word", wordBreak: "break-word" }}>
            {activo.nombre}
          </h1>
          {/* Mirrors OTDetail's header: 34px Editar + overflow menu + close. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ flexShrink: 0, height: 34, padding: "0 13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit" }} onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }} onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}>
              <Pencil size={14} /> Editar
            </button>
            <div ref={accionesMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button type="button" onClick={() => setAccionesMenuOpen(v => !v)} title="Más acciones" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-1)" }} onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <MoreVertical size={16} />}
              </button>
              {accionesMenuOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-sm)", width: 190, overflow: "hidden" }}>
                  <button type="button" onClick={() => { setAccionesMenuOpen(false); handleDelete(); }} disabled={deleting} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--surface-1)", border: "none", cursor: deleting ? "default" : "pointer", fontSize: 14, color: "var(--danger)", fontFamily: "inherit", textAlign: "left" }} onMouseEnter={e => { if (!deleting) e.currentTarget.style.background = "var(--surface-hover)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}>
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-3)", flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Estado — click to change (saved instantly) + criticidad chip */}
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "center", color: "var(--fg-3)" }}>
          {activo.ubicacion && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}><MapPin size={14} />{activo.ubicacion.edificio}</span>}
          {activo.sociedad && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}><Building2 size={14} />{activo.sociedad.nombre}</span>}
          <div ref={estadoMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setEstadoMenuOpen(o => !o)} disabled={changingEstado} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: estadoColor(activo.estado) }} />
              <span style={{ fontSize: 14, fontWeight: 400, color: estadoColor(activo.estado) }}>{estadoLabel(activo.estado)}</span>
              {changingEstado ? <Loader2 size={13} className="animate-spin" style={{ color: estadoColor(activo.estado) }} /> : <ChevronDown size={14} style={{ color: estadoColor(activo.estado) }} />}
            </button>
            {estadoMenuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, minWidth: 180, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                {ESTADO_OPCIONES.map(e => (
                  <button key={e} onClick={() => handleChangeEstado(e)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "none", background: e === activo.estado ? "var(--surface-hover)" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--fg-1)", textAlign: "left" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: ESTADO_COLOR[e] }} />
                    {ESTADO_LABEL[e]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: "var(--r-sm)", border: "1px solid var(--border-strong)", background: "transparent", color: "var(--fg-1)", fontSize: 14, fontWeight: 400 }}><AlertCircle size={12} style={{ color: critCfg.color }} />{CRITICIDAD_LABEL[crit]}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 17 }}>
          {(["general", "detalles", "historial"] as ActivoTab[]).map(t => {
            const active = tab === t;
            const label = t === "general" ? "General" : t === "detalles" ? "Detalles" : "Historial";
            const Icon = t === "general" ? Box : t === "detalles" ? FileText : Clock;
            return (
              <button key={t} onClick={() => setTab(t)} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 33, padding: "0 13px", background: active ? "var(--brand-tint)" : "var(--surface-1)", border: "1px solid var(--brand)", borderRadius: 4, color: "var(--brand)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon size={16} />{label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 27px 80px", background: "var(--surface-canvas)" }}>
        {tab === "general" && <GeneralTab activo={activo} onFullscreen={() => setFullscreen(true)} />}
        {tab === "detalles" && <DetallesTab activo={activo} hijos={hijos} onOpenActivo={openActivo} />}
        {tab === "historial" && <HistorialTab activoId={activo.id} onOpenOT={(otId) => router.push(`/ordenes?id=${encodeURIComponent(otId)}`)} />}
      </div>

      {/* Fullscreen photo viewer */}
      {fullscreen && activo.imagen_url && (
        <div onClick={() => setFullscreen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={() => setFullscreen(false)} style={{ position: "absolute", top: 24, right: 24, padding: 8, background: "none", border: "none", cursor: "pointer", color: "#fff" }}><X size={28} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activo.imagen_url} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}

export default function ActivosBandeja({ initialActivos, usuarios, ubicaciones, lugares, sociedades, fabricantes, modelos, proveedores, myRol, wsId, initialSelectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [activos, setActivos] = useState<Activo[]>(initialActivos);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const selectedRef = useRef<string | null>(initialSelectedId ?? null);
  const [editing, setEditing] = useState<Activo | null | "new">(null);
  const [search, setSearch] = useState("");
  const locationsView = pathname.endsWith("/ubicaciones");
  const [filterCrit, setFilterCrit] = useState<CritFilter>("all");
  const [filterSociedadId, setFilterSociedadId] = useState<string | "all">("all");
  const [sort, setSort] = useState<ActivoSortOption>("nombre_asc");
  const [sortOpen, setSortOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const canCreate = myRol !== "requester";
  const selectedActivo = selected ? activos.find(a => a.id === selected) ?? null : null;

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Detect desktop on mount (mirrors OrdenesBandeja).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Close sort dropdown on outside click.
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortOpen]);

  useEffect(() => {
    const currentQuery = window.location.search.slice(1);
    const params = new URLSearchParams(currentQuery);
    if (selected) params.set("id", selected);
    else params.delete("id");
    const nextQuery = params.toString();
    if (nextQuery === currentQuery) return;
    window.history.replaceState(window.history.state, "", `${pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  }, [pathname, selected]);

  useEffect(() => {
    const sb = createClient();
    const channelName = "activos-list";
    const channelDetails = {
      channelName,
      screen: "ActivosBandeja",
      table: "activos",
      filter: `workspace_id=eq.${wsId}`,
    };
    logRealtimeChannel("create", channelDetails, sb);
    const channel = sb
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "activos", filter: `workspace_id=eq.${wsId}` }, async (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: string; activo?: boolean } | null;
        if (!row?.id) return;

        if (payload.eventType === "DELETE" || row.activo === false) {
          setActivos(prev => prev.filter(a => a.id !== row.id));
          if (selectedRef.current === row.id) setSelected(null);
          return;
        }

        const { data } = await sb
          .from("activos")
          .select(ACTIVO_SELECT)
          .eq("id", row.id)
          .eq("workspace_id", wsId)
          .eq("activo", true)
          .maybeSingle();

        if (!data) return;
        const changed = data as unknown as Activo;
        setActivos(prev => {
          const exists = prev.some(a => a.id === changed.id);
          const next = exists
            ? prev.map(a => a.id === changed.id ? changed : a)
            : [changed, ...prev];
          return next.sort((a, b) => a.nombre.localeCompare(b.nombre));
        });
      })
      .subscribe((status) => {
        logRealtimeChannel("status", { ...channelDetails, status }, sb);
      });
    return () => {
      logRealtimeChannel("remove:start", channelDetails, sb);
      void sb.removeChannel(channel).then(() => {
        logRealtimeChannel("remove:done", channelDetails, sb);
      });
    };
  }, [wsId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = activos.filter(a => {
      if (filterCrit !== "all" && a.criticidad !== filterCrit) return false;
      if (filterSociedadId !== "all" && a.sociedad_id !== filterSociedadId) return false;
      if (!q) return true;
      return [a.nombre, a.numero_serie, a.fabricante?.nombre, a.modelo?.nombre, a.sociedad?.nombre, ubicacionLabel(a)]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
    list.sort((a, b) => {
      switch (sort) {
        case "nombre_desc":
          return b.nombre.localeCompare(a.nombre);
        case "estado":
          return estadoLabel(a.estado).localeCompare(estadoLabel(b.estado)) || a.nombre.localeCompare(b.nombre);
        case "criticidad":
          return (CRIT_ORDER[b.criticidad ?? "no_critico"] ?? 0) - (CRIT_ORDER[a.criticidad ?? "no_critico"] ?? 0) || a.nombre.localeCompare(b.nombre);
        case "created_at_desc":
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        default:
          return a.nombre.localeCompare(b.nombre);
      }
    });
    return list;
  }, [activos, search, filterCrit, filterSociedadId, sort]);

  const sociedadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    activos.forEach(a => { if (a.sociedad_id) counts.set(a.sociedad_id, (counts.get(a.sociedad_id) ?? 0) + 1); });
    return counts;
  }, [activos]);

  const assetLocations = useMemo(() => ubicaciones
    .map(location => ({
      ...location,
      count: activos.filter(asset => asset.ubicacion_id === location.id).length,
    }))
    .filter(location => location.count > 0)
    .filter(location => {
      const q = search.trim().toLowerCase();
      const matchesSociedad = filterSociedadId === "all" || location.sociedad_id === filterSociedadId;
      return matchesSociedad && (!q || [location.edificio, location.detalle].filter(Boolean).some(value => String(value).toLowerCase().includes(q)));
    })
    .sort((a, b) => a.edificio.localeCompare(b.edificio)), [activos, filterSociedadId, search, ubicaciones]);

  const currentSortLabel = ACTIVO_SORT_OPTIONS.find(o => o.value === sort)?.label ?? "";
  const openCreate = useCallback(() => { setEditing("new"); setSelected(null); }, []);

  const handleSaved = useCallback((saved: Activo) => {
    setActivos(prev => {
      const exists = prev.some(a => a.id === saved.id);
      return exists ? prev.map(a => a.id === saved.id ? saved : a) : [saved, ...prev].sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
    setEditing(null);
    setSelected(saved.id);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setActivos(prev => prev.filter(a => a.id !== id));
    setSelected(null);
  }, []);

  const showRight = !!(editing || selectedActivo);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", background: "var(--c-bg, var(--surface-canvas))" }}>

      {/* ── Navigation header ── */}
      <div style={{ position: "relative", zIndex: 100, flexShrink: 0, overflow: "visible", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>

        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 20px", minHeight: 56, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 520px", minWidth: 0, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative", maxWidth: 280, minWidth: 220, flex: "1 1 220px" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder={locationsView ? "Buscar ubicaciones" : "Buscar por nombre, código, modelo…"}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  paddingLeft: 34, paddingRight: search ? 28 : 10,
                  height: 38, width: "100%",
                  border: "1px solid var(--border)", borderRadius: 8,
                  fontSize: 14, fontWeight: 400, color: "var(--fg-1)", background: "var(--surface-1)",
                  outline: "none", fontFamily: "inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}>
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Nuevo Activo button */}
            {canCreate && (
              <button
                type="button"
                onClick={() => locationsView ? router.push("/ubicaciones/ubicaciones?nueva=1") : openCreate()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "0 16px", height: 38,
                  background: "var(--brand)", color: "var(--fg-on-brand)",
                  border: "none", borderRadius: 8,
                  fontSize: 14, fontWeight: 400,
                  cursor: "pointer", fontFamily: "inherit",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
              >
                <Plus size={16} strokeWidth={2} />
                {locationsView ? "Nueva ubicación" : "Nuevo Activo"}
              </button>
            )}
          </div>
        </div>

        {/* Filters use the same compact toolbar language as Órdenes. */}
        <div style={{ display: "flex", alignItems: "center", padding: "6px 20px", minHeight: 40, gap: 8, overflowX: "auto" }}>
          {!locationsView && <AssetFilterDropdown label="Criticidad" icon={<AlertCircle size={13} />} active={filterCrit !== "all"}>{([['all','Todas'],['critico','Crítico'],['semi_critico','Semi-crítico'],['no_critico','No crítico']] as [CritFilter,string][]).map(([value, label]) => <button key={value} type="button" onClick={() => setFilterCrit(value)} style={{ ...assetFilterOptionStyle, background: filterCrit === value ? "var(--brand-tint)" : "transparent", color: filterCrit === value ? "var(--brand-fg)" : "var(--fg-2)" }}>{label}</button>)}</AssetFilterDropdown>}
          <AssetFilterDropdown label="Sociedad" icon={<Building2 size={13} />} active={filterSociedadId !== "all"}><button type="button" onClick={() => setFilterSociedadId("all")} style={{ ...assetFilterOptionStyle, background: filterSociedadId === "all" ? "var(--brand-tint)" : "transparent" }}>Todas</button>{sociedades.map(sociedad => <button key={sociedad.id} type="button" onClick={() => setFilterSociedadId(sociedad.id)} style={{ ...assetFilterOptionStyle, background: filterSociedadId === sociedad.id ? "var(--brand-tint)" : "transparent", color: filterSociedadId === sociedad.id ? "var(--brand-fg)" : "var(--fg-2)" }}>{sociedad.nombre} ({sociedadCounts.get(sociedad.id) ?? 0})</button>)}</AssetFilterDropdown>
          {(filterCrit !== "all" || filterSociedadId !== "all") && <button type="button" onClick={() => { setFilterCrit("all"); setFilterSociedadId("all"); }} style={{ height: 28, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", color: "var(--fg-3)", font: "500 12px inherit", cursor: "pointer" }}>Limpiar</button>}
        </div>
      </div>

      {/* ── Main split pane ── */}
      <div style={{ position: "relative", zIndex: 0, display: "flex", flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, minWidth: 0, overflow: "hidden" }}>

        {/* LEFT: list column */}
        <div style={{
          display: (!isDesktop && showRight) ? "none" : "flex",
          flexDirection: "column",
          width: isDesktop ? 518 : "100%",
          minWidth: 0,
          maxWidth: isDesktop ? 518 : undefined,
          flexShrink: 0,
          borderRight: isDesktop ? "1px solid var(--border)" : "none",
          background: "var(--surface-canvas)",
          position: "relative",
        }}>

          {/* Sort dropdown row */}
          {!locationsView && <div ref={sortRef} style={{ position: "relative", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setSortOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", padding: "10px 16px",
                background: "var(--surface-canvas)", border: "none",
                fontSize: 14, color: "var(--fg-2)",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-canvas)"; }}
            >
              <span style={{ color: "var(--fg-3)" }}>Ordenar por:</span>
              <span style={{ fontWeight: 400, color: "var(--brand-fg)" }}>{currentSortLabel}</span>
              <ChevronDown size={14} style={{ color: "var(--brand-fg)", transform: sortOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {sortOpen && (
              <div style={{
                position: "absolute", left: 8, right: 8, top: "calc(100% + 4px)", zIndex: 50,
                background: "var(--surface-1)", border: "1px solid var(--border)",
                borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.12)", overflow: "hidden",
              }}>
                <div style={{ padding: "8px 14px 4px", fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em" }}>
                  Ordenar por
                </div>
                {ACTIVO_SORT_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { setSort(o.value); setSortOpen(false); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "9px 14px", background: sort === o.value ? "var(--brand-tint)" : "transparent",
                      border: "none", fontSize: 14,
                      color: sort === o.value ? "var(--brand-fg)" : "var(--fg-1)",
                      fontWeight: 400,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { if (sort !== o.value) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { if (sort !== o.value) e.currentTarget.style.background = "transparent"; }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>}

          {/* List */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
            {locationsView ? assetLocations.map(location => (
              <button key={location.id} type="button" onClick={() => router.push(`/ubicaciones/ubicaciones?id=${encodeURIComponent(location.id)}`)} style={{ width: "100%", minHeight: 76, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface-1)", boxShadow: "var(--shadow-xs)", color: "var(--fg-1)", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ width: 44, height: 44, borderRadius: 9, background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MapPin size={21} /></span>
                <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 14, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{location.edificio}</strong><span style={{ display: "block", marginTop: 4, fontSize: 14, color: "var(--fg-3)" }}>{location.count} {location.count === 1 ? "activo" : "activos"}</span></span>
                <ChevronRight size={17} style={{ color: "var(--fg-4)" }} />
              </button>
            )) : filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 12, color: "var(--fg-4)" }}>
                <Box size={38} strokeWidth={1.5} />
                <p style={{ fontSize: 14, color: "var(--fg-2)", fontWeight: 400 }}>
                  {search || filterCrit !== "all" || filterSociedadId !== "all" ? "Sin resultados para tu búsqueda" : "Aún no hay activos"}
                </p>
                {!search && filterCrit === "all" && filterSociedadId === "all" && canCreate && (
                  <a href="#" onClick={e => { e.preventDefault(); openCreate(); }}
                    style={{ fontSize: 14, color: "var(--brand-fg)", fontWeight: 400, textDecoration: "underline" }}>
                    Crea el primer activo
                  </a>
                )}
              </div>
            ) : filtered.map(activo => (
              <ActivoRow key={activo.id} activo={activo} selected={selected === activo.id} onClick={() => { setEditing(null); setSelected(prev => prev === activo.id ? null : activo.id); }} />
            ))}
            {locationsView && assetLocations.length === 0 && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 10, color: "var(--fg-4)" }}><MapPin size={38} strokeWidth={1.5} /><p style={{ fontSize: 14, color: "var(--fg-2)", fontWeight: 400 }}>{search ? "Sin resultados" : "Sin ubicaciones con activos"}</p></div>}
          </div>
        </div>

        {/* RIGHT: detail or form */}
        {(isDesktop || showRight) && (
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", background: "var(--c-bg, var(--surface-canvas))" }}>
            {locationsView ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--fg-4)" }}><div style={{ width: 64, height: 64, borderRadius: 12, background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}><MapPin size={28} style={{ color: "var(--border-strong)" }} /></div><div style={{ textAlign: "center" }}><p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)" }}>Selecciona una ubicación</p><p style={{ fontSize: 14, color: "var(--fg-4)", marginTop: 4 }}>Abre una ubicación para ver sus activos</p></div></div>
            ) : editing ? (
              <ActivoForm
                activo={editing === "new" ? null : editing}
                usuarios={usuarios}
                ubicaciones={ubicaciones}
                lugares={lugares}
                sociedades={sociedades}
                fabricantes={fabricantes}
                modelos={modelos}
                proveedores={proveedores}
                activos={activos}
                wsId={wsId}
                onSaved={handleSaved}
                onClose={() => setEditing(null)}
              />
            ) : selectedActivo ? (
              <ActivoDetail
                activo={selectedActivo}
                activos={activos}
                onEdit={() => setEditing(selectedActivo)}
                onClose={() => setSelected(null)}
                onDeleted={handleDeleted}
                onUpdated={handleSaved}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--fg-4)" }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Box size={28} style={{ color: "var(--border-strong)" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)" }}>Selecciona un activo</p>
                  <p style={{ fontSize: 14, color: "var(--fg-4)", marginTop: 4 }}>El detalle aparecerá aquí</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
