"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import {
  MapPin, Building2, Plus, Pencil, Trash2, X, Check,
  Loader2, Search, ChevronRight, Image as ImageIcon, Upload, QrCode, Package, Wrench, Printer, Share2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sociedad {
  id: string;
  nombre: string;
  imagen_url: string | null;
  descripcion: string | null;
  direccion: string | null;
  qr_code: string | null;
}

interface Ubicacion {
  id: string;
  edificio: string;
  detalle: string | null;
  direccion: string | null;
  grupo_cargo: string | null;
  sociedad_id: string | null;
  imagen_url: string | null;
  sociedad_nombre: string | null;
  descripcion: string | null;
  qr_code: string | null;
}

interface Lugar {
  id: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  imagen_url: string | null;
  ubicacion_id: string | null;
  ubicacion_edificio: string | null;
  grupo_cargo: string | null;
  qr_code: string | null;
}

interface ActivoResumen { id: string; nombre: string; imagen_url: string | null; numero_serie: string | null; ubicacion_id: string | null; lugar_id: string | null }
interface ReservaResumen { id: string; ubicacion_id: string; lugar_id: string | null; cantidad: number; parte: { nombre: string; unidad: string; imagen_url: string | null } | null }

type Section = "ubicaciones" | "lugares" | "sociedades";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: "var(--brand-tint)", color: "var(--brand)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700,
    }}>
      {initials || <Building2 size={size * 0.5} />}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 5px" }}>
      {children}
    </p>
  );
}

function FieldInput({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%", height: 36, padding: "0 10px",
        border: "1px solid var(--border)", borderRadius: 6,
        fontSize: 13, color: "var(--fg-1)", outline: "none",
        fontFamily: "inherit", background: disabled ? "var(--surface-0)" : "var(--surface-1)",
        boxSizing: "border-box",
      }}
      onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
      onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
    />
  );
}

function FieldTextarea({
  value, onChange, placeholder, rows = 3,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%", padding: "8px 10px",
        border: "1px solid var(--border)", borderRadius: 6,
        fontSize: 13, color: "var(--fg-1)", outline: "none",
        fontFamily: "inherit", background: "var(--surface-1)", resize: "vertical",
        boxSizing: "border-box",
      }}
      onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
      onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
    />
  );
}

function Btn({
  children, onClick, disabled, variant = "primary", style: extraStyle,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    height: 34, padding: "0 14px", border: "none", borderRadius: 6,
    fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", transition: "background 0.1s, opacity 0.1s",
    opacity: disabled ? 0.6 : 1,
  };
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--brand)", color: "var(--fg-on-brand)" },
    ghost:   { background: "var(--surface-hover)", color: "var(--fg-2)" },
    danger:  { background: "var(--danger-bg)", color: "var(--danger)" },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...base, ...styles[variant], ...extraStyle }}>
      {children}
    </button>
  );
}

// ── ImageUpload ───────────────────────────────────────────────────────────────

function ImageUpload({
  src, onUpload, onRemove, folder, uploading,
}: {
  src: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  folder: string;
  uploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 80, height: 80, borderRadius: 10,
        border: "1px dashed var(--border)", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--surface-0)", flexShrink: 0, position: "relative",
      }}>
        {uploading ? (
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
        ) : src ? (
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImageIcon size={24} style={{ color: "var(--fg-4)" }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload size={13} /> {src ? "Cambiar foto" : "Subir foto"}
        </Btn>
        {src && (
          <Btn variant="danger" onClick={onRemove} disabled={uploading}>
            <X size={13} /> Quitar
          </Btn>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UbicacionesPage() {
  const router = useRouter();
  const [wsId, setWsId]             = useState<string | null>(null);
  const [myRol, setMyRol]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [section, setSection]       = useState<Section>("ubicaciones");
  const [search, setSearch]         = useState("");

  // Data
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [lugares, setLugares]         = useState<Lugar[]>([]);
  const [sociedades, setSociedades]   = useState<Sociedad[]>([]);
  const [activos, setActivos]         = useState<ActivoResumen[]>([]);
  const [reservas, setReservas]       = useState<ReservaResumen[]>([]);

  // Panel state
  const [panel, setPanel] = useState<{
    type: Section;
    mode: "create" | "edit" | "view";
    id?: string;
  } | null>(null);

  // Form state
  const [form, setForm]             = useState<Record<string, string>>({});
  const [imgUrl, setImgUrl]         = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ type: Section; id: string; name: string } | null>(null);
  const [qrModal, setQrModal] = useState<{ name: string; code: string } | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: perfil } = await sb
        .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) { setLoading(false); return; }

      setWsId(perfil.workspace_id);
      setMyRol(perfil.rol);
      await fetchAll(sb, perfil.workspace_id);
      setLoading(false);
    }
    load();
  }, [router]);

  async function fetchAll(sb: ReturnType<typeof createClient>, wid: string) {
    const [ubRes, luRes, soRes, acRes, reRes] = await Promise.all([
      sb.from("ubicaciones")
        .select("id, edificio, detalle, descripcion, direccion, grupo_cargo, sociedad_id, imagen_url, qr_code, sociedades(nombre)")
        .eq("workspace_id", wid).eq("activa", true).order("edificio"),
      sb.from("lugares")
        .select("id, nombre, descripcion, direccion, grupo_cargo, imagen_url, qr_code, ubicacion_id, ubicaciones(edificio)")
        .eq("workspace_id", wid).eq("activo", true).order("nombre"),
      sb.from("sociedades")
        .select("id, nombre, descripcion, direccion, imagen_url, qr_code")
        .eq("workspace_id", wid).eq("activa", true).order("nombre"),
      sb.from("activos")
        .select("id, nombre, imagen_url, numero_serie, ubicacion_id, lugar_id")
        .eq("workspace_id", wid).eq("activo", true).order("nombre"),
      sb.from("material_reservations")
        .select("id, ubicacion_id, lugar_id, cantidad, parte:partes!parte_id(nombre, unidad, imagen_url)")
        .eq("workspace_id", wid).order("created_at", { ascending: false }),
    ]);
    setUbicaciones((ubRes.data ?? []).map((u: any) => ({
      ...u, sociedad_nombre: (u.sociedades as any)?.nombre ?? null,
    })));
    setLugares((luRes.data ?? []).map((l: any) => ({
      ...l, ubicacion_edificio: (l.ubicaciones as any)?.edificio ?? null,
    })));
    setSociedades(soRes.data ?? []);
    setActivos((acRes.data ?? []) as ActivoResumen[]);
    setReservas((reRes.data ?? []) as unknown as ReservaResumen[]);
  }

  function openDetail(type: Section, id: string) {
    setPanel({ type, mode: "view", id });
    setForm({});
    setImgUrl(null);
  }

  function openCreate(type: Section) {
    setPanel({ type, mode: "create" });
    setForm({ qr_code: "" });
    setImgUrl(null);
  }

  function openEdit(type: Section, item: any) {
    setPanel({ type, mode: "edit", id: item.id });
    if (type === "ubicaciones") {
      setForm({
        edificio:    item.edificio ?? "",
        detalle:     item.detalle ?? "",
        direccion:   item.direccion ?? "",
        grupo_cargo: item.grupo_cargo ?? "",
        sociedad_id: item.sociedad_id ?? "",
        descripcion: item.descripcion ?? "",
        qr_code: item.qr_code ?? "",
      });
    } else if (type === "lugares") {
      setForm({
        nombre:      item.nombre ?? "",
        descripcion: item.descripcion ?? "",
        direccion:   item.direccion ?? "",
        ubicacion_id: item.ubicacion_id ?? "",
        grupo_cargo: item.grupo_cargo ?? "",
        qr_code: item.qr_code ?? "",
      });
    } else {
      setForm({ nombre: item.nombre ?? "", descripcion: item.descripcion ?? "", direccion: item.direccion ?? "", qr_code: item.qr_code ?? "" });
    }
    setImgUrl(item.imagen_url ?? null);
  }

  async function handleSave() {
    if (!wsId) return;
    const sb = createClient();
    setSaving(true);
    try {
      const { type, mode, id } = panel!;

      if (type === "sociedades") {
        const payload = { nombre: form.nombre?.trim(), descripcion: form.descripcion?.trim() || null, direccion: form.direccion?.trim() || null, qr_code: form.qr_code?.trim() || null, imagen_url: imgUrl ?? null };
        if (mode === "create") {
          const { error } = await sb.from("sociedades").insert({ workspace_id: wsId, ...payload });
          if (error) throw error;
        } else {
          const { error } = await sb.from("sociedades").update(payload).eq("id", id!);
          if (error) throw error;
        }
      } else if (type === "ubicaciones") {
        const payload = {
          edificio:    form.edificio?.trim(),
          detalle:     form.detalle?.trim() || null,
          descripcion: form.descripcion?.trim() || null,
          direccion:   form.direccion?.trim() || null,
          grupo_cargo: form.grupo_cargo?.trim() || null,
          sociedad_id: form.sociedad_id || null,
          imagen_url:  imgUrl ?? null,
          qr_code:     form.qr_code?.trim() || null,
        };
        if (mode === "create") {
          const { error } = await sb.from("ubicaciones").insert({ workspace_id: wsId, activa: true, ...payload });
          if (error) throw error;
        } else {
          const { error } = await sb.from("ubicaciones").update(payload).eq("id", id!);
          if (error) throw error;
        }
      } else {
        const payload = {
          nombre:       form.nombre?.trim(),
          descripcion:  form.descripcion?.trim() || null,
          direccion:    form.direccion?.trim() || null,
          ubicacion_id: form.ubicacion_id || null,
          imagen_url:   imgUrl ?? null,
          grupo_cargo:  form.grupo_cargo?.trim() || null,
          qr_code:      form.qr_code?.trim() || null,
        };
        if (mode === "create") {
          const { error } = await sb.from("lugares").insert({ workspace_id: wsId, activo: true, ...payload });
          if (error) throw error;
        } else {
          const { error } = await sb.from("lugares").update(payload).eq("id", id!);
          if (error) throw error;
        }
      }

      await fetchAll(sb, wsId);
      setPanel(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo guardar. Revisa tus permisos e intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDel || !wsId) return;
    const sb = createClient();
    setDeleting(confirmDel.id);
    try {
      const table = confirmDel.type === "ubicaciones" ? "ubicaciones"
                  : confirmDel.type === "lugares"    ? "lugares"
                  : "sociedades";
      const col   = confirmDel.type === "sociedades" ? "activa" : confirmDel.type === "ubicaciones" ? "activa" : "activo";
      await sb.from(table).update({ [col]: false }).eq("id", confirmDel.id);
      await fetchAll(sb, wsId);
      setConfirmDel(null);
    } finally {
      setDeleting(null);
    }
  }

  async function handleUploadImg(file: File, folder: string) {
    setUploadingImg(true);
    try {
      const url = await uploadToR2(file, folder);
      setImgUrl(url);
    } finally {
      setUploadingImg(false);
    }
  }

  async function handleRemoveImg() {
    if (imgUrl) await deleteFromR2(imgUrl).catch(() => {});
    setImgUrl(null);
  }

  const canEdit = myRol === "owner" || myRol === "admin" || myRol === "jefe";

  const filtered = {
    ubicaciones: ubicaciones.filter(u =>
      !search || u.edificio.toLowerCase().includes(search.toLowerCase()) ||
      (u.direccion ?? "").toLowerCase().includes(search.toLowerCase())
    ),
    lugares: lugares.filter(l =>
      !search || l.nombre.toLowerCase().includes(search.toLowerCase())
    ),
    sociedades: sociedades.filter(s =>
      !search || s.nombre.toLowerCase().includes(search.toLowerCase())
    ),
  };

  const panelTitle = !panel ? "" :
    panel.mode === "view" ? (
      panel.type === "ubicaciones" ? "Detalle de ubicación"
      : panel.type === "lugares" ? "Detalle del lugar"
      : "Detalle de asociación"
    ) : panel.mode === "create" ? (
      panel.type === "ubicaciones" ? "Nueva ubicación"
      : panel.type === "lugares" ? "Nuevo lugar"
      : "Nueva asociación"
    ) : (
      panel.type === "ubicaciones" ? "Editar ubicación"
      : panel.type === "lugares" ? "Editar lugar"
      : "Editar asociación"
    );

  const canSave = !saving && !uploadingImg && (
    panel?.type === "ubicaciones" ? !!form.edificio?.trim()
    : !!form.nombre?.trim()
  );
  const selectedItem = !panel?.id ? null
    : panel.type === "ubicaciones" ? ubicaciones.find(item => item.id === panel.id) ?? null
    : panel.type === "lugares" ? lugares.find(item => item.id === panel.id) ?? null
    : sociedades.find(item => item.id === panel.id) ?? null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--fg-4)", gap: 8 }}>
        <Loader2 size={18} className="animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--surface-1)" }}>

      {/* Main list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: panel ? "1px solid var(--border)" : "none" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Ubicaciones</h1>
          {canEdit && (
            <Btn onClick={() => openCreate(section)}>
              <Plus size={14} />
              {section === "ubicaciones" ? "Nueva ubicación"
               : section === "lugares" ? "Nuevo lugar"
               : "Nueva asociación"}
            </Btn>
          )}
        </div>

        {/* Tabs */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 0 }}>
          {([["ubicaciones", "Ubicaciones"], ["lugares", "Lugares específicos"], ["sociedades", "Asociaciones"]] as [Section, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setSection(key); setSearch(""); }}
              style={{
                height: 40, padding: "0 16px",
                background: "none", border: "none",
                borderBottom: section === key ? "2px solid var(--brand)" : "2px solid transparent",
                color: section === key ? "var(--brand)" : "var(--fg-4)",
                fontSize: 13, fontWeight: section === key ? 600 : 500,
                cursor: "pointer", fontFamily: "inherit",
                marginBottom: -1, transition: "color 0.1s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ flexShrink: 0, padding: "12px 24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ position: "relative", maxWidth: 360 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)" }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              style={{
                width: "100%", height: 34, padding: "0 10px 0 32px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, color: "var(--fg-1)", outline: "none",
                fontFamily: "inherit", background: "var(--surface-1)", boxSizing: "border-box",
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {section === "ubicaciones" && (
            filtered.ubicaciones.length === 0 ? <Empty label="Sin ubicaciones" /> :
            filtered.ubicaciones.map(u => (
              <ListRow
                key={u.id}
                img={u.imagen_url}
                name={u.edificio}
                sub={[u.detalle, u.direccion, u.sociedad_nombre].filter(Boolean).join(" · ")}
                onOpen={() => openDetail("ubicaciones", u.id)}
                onEdit={canEdit ? () => openEdit("ubicaciones", u) : undefined}
                onDelete={canEdit ? () => setConfirmDel({ type: "ubicaciones", id: u.id, name: u.edificio }) : undefined}
              />
            ))
          )}
          {section === "lugares" && (
            filtered.lugares.length === 0 ? <Empty label="Sin lugares específicos" /> :
            filtered.lugares.map(l => (
              <ListRow
                key={l.id}
                img={l.imagen_url}
                name={l.nombre}
                sub={[l.ubicacion_edificio, l.descripcion].filter(Boolean).join(" · ")}
                onOpen={() => openDetail("lugares", l.id)}
                onEdit={canEdit ? () => openEdit("lugares", l) : undefined}
                onDelete={canEdit ? () => setConfirmDel({ type: "lugares", id: l.id, name: l.nombre }) : undefined}
              />
            ))
          )}
          {section === "sociedades" && (
            filtered.sociedades.length === 0 ? <Empty label="Sin asociaciones" /> :
            filtered.sociedades.map(s => (
              <ListRow
                key={s.id}
                img={s.imagen_url}
                name={s.nombre}
                onOpen={() => openDetail("sociedades", s.id)}
                onEdit={canEdit ? () => openEdit("sociedades", s) : undefined}
                onDelete={canEdit ? () => setConfirmDel({ type: "sociedades", id: s.id, name: s.nombre }) : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Edit / Create panel */}
      {panel && (
        <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--surface-1)" }}>
          {/* Panel header */}
          <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>{panelTitle}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {panel.mode === "view" && canEdit && selectedItem && (
                <button type="button" onClick={() => openEdit(panel.type, selectedItem)} title="Editar"
                  style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}>
                  <Pencil size={15} />
                </button>
              )}
              <button type="button" onClick={() => setPanel(null)}
                style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-4)" }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            {panel.mode === "view" && selectedItem ? (
              <EntityDetail
                type={panel.type}
                item={selectedItem}
                ubicaciones={ubicaciones}
                lugares={lugares}
                activos={activos}
                reservas={reservas}
                onOpen={(type, id) => openDetail(type, id)}
                onQr={(name, code) => setQrModal({ name, code })}
              />
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Photo upload */}
              <div>
                <FieldLabel>Foto</FieldLabel>
                <ImageUpload
                  src={imgUrl}
                  onUpload={f => handleUploadImg(f, panel.type === "ubicaciones" ? "ubicaciones" : panel.type === "lugares" ? "lugares" : "sociedades")}
                  onRemove={handleRemoveImg}
                  folder={panel.type}
                  uploading={uploadingImg}
                />
              </div>

              {/* Ubicaciones fields */}
              {panel.type === "ubicaciones" && (
                <>
                  <div>
                    <FieldLabel>Nombre del edificio *</FieldLabel>
                    <FieldInput value={form.edificio ?? ""} onChange={v => setForm(f => ({ ...f, edificio: v }))} placeholder="Ej: Torre A" />
                  </div>
                  <div>
                    <FieldLabel>Dirección</FieldLabel>
                    <FieldInput value={form.direccion ?? ""} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Ej: Av. Principal 1234" />
                  </div>
                  <div>
                    <FieldLabel>Descripción</FieldLabel>
                    <FieldTextarea value={form.descripcion ?? ""} onChange={v => setForm(f => ({ ...f, descripcion: v }))} placeholder="Descripción de la ubicación…" rows={3} />
                  </div>
                  <div>
                    <FieldLabel>Piso / Nivel</FieldLabel>
                    <FieldInput value={form.detalle ?? ""} onChange={v => setForm(f => ({ ...f, detalle: v }))} placeholder="Ej: 3" />
                  </div>
                  <div>
                    <FieldLabel>Grupo a cargo</FieldLabel>
                    <FieldInput value={form.grupo_cargo ?? ""} onChange={v => setForm(f => ({ ...f, grupo_cargo: v }))} placeholder="Ej: Mantenimiento eléctrico" />
                  </div>
                  <div>
                    <FieldLabel>Empresa asociada</FieldLabel>
                    <select
                      value={form.sociedad_id ?? ""}
                      onChange={e => setForm(f => ({ ...f, sociedad_id: e.target.value }))}
                      style={{
                        width: "100%", height: 36, padding: "0 10px",
                        border: "1px solid var(--border)", borderRadius: 6,
                        fontSize: 13, color: form.sociedad_id ? "var(--fg-1)" : "var(--fg-4)",
                        outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
                        boxSizing: "border-box", cursor: "pointer",
                      }}
                    >
                      <option value="">Sin empresa</option>
                      {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* Lugares fields */}
              {panel.type === "lugares" && (
                <>
                  <div>
                    <FieldLabel>Nombre *</FieldLabel>
                    <FieldInput value={form.nombre ?? ""} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej: Sala de bombas B2" />
                  </div>
                  <div>
                    <FieldLabel>Descripción</FieldLabel>
                    <FieldTextarea value={form.descripcion ?? ""} onChange={v => setForm(f => ({ ...f, descripcion: v }))} placeholder="Detalles del lugar…" rows={3} />
                  </div>
                  <div>
                    <FieldLabel>Dirección / Referencia</FieldLabel>
                    <FieldInput value={form.direccion ?? ""} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Ej: Subterráneo nivel -2" />
                  </div>
                  <div>
                    <FieldLabel>Grupo a cargo</FieldLabel>
                    <FieldInput value={form.grupo_cargo ?? ""} onChange={v => setForm(f => ({ ...f, grupo_cargo: v }))} placeholder="Ej: Mantenimiento eléctrico" />
                  </div>
                  <div>
                    <FieldLabel>Edificio / Ubicación</FieldLabel>
                    <select
                      value={form.ubicacion_id ?? ""}
                      onChange={e => setForm(f => ({ ...f, ubicacion_id: e.target.value }))}
                      style={{
                        width: "100%", height: 36, padding: "0 10px",
                        border: "1px solid var(--border)", borderRadius: 6,
                        fontSize: 13, color: form.ubicacion_id ? "var(--fg-1)" : "var(--fg-4)",
                        outline: "none", fontFamily: "inherit", background: "var(--surface-1)",
                        boxSizing: "border-box", cursor: "pointer",
                      }}
                    >
                      <option value="">Sin ubicación</option>
                      {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.edificio}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* Sociedades fields */}
              {panel.type === "sociedades" && (
                <>
                  <div>
                    <FieldLabel>Nombre de la asociación *</FieldLabel>
                    <FieldInput value={form.nombre ?? ""} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej: Constructora XYZ SpA" />
                  </div>
                  <div><FieldLabel>Dirección</FieldLabel><FieldInput value={form.direccion ?? ""} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Dirección" /></div>
                  <div><FieldLabel>Descripción</FieldLabel><FieldTextarea value={form.descripcion ?? ""} onChange={v => setForm(f => ({ ...f, descripcion: v }))} placeholder="Descripción de la asociación…" /></div>
                </>
              )}

              <div>
                <FieldLabel>Código QR</FieldLabel>
                <FieldInput value={form.qr_code ?? ""} onChange={v => setForm(f => ({ ...f, qr_code: v }))} placeholder="Código personalizado (opcional)" />
                <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--fg-4)" }}>Si lo dejas vacío, Pangui asignará un código automáticamente.</p>
              </div>

            </div>
            )}
          </div>

          {/* Panel footer */}
          {panel.mode !== "view" && <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setPanel(null)}>Cancelar</Btn>
            <Btn onClick={handleSave} disabled={!canSave}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {panel.mode === "create" ? "Crear" : "Guardar"}
            </Btn>
          </div>}
        </div>
      )}

      {/* Delete confirmation overlay */}
      {confirmDel && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }}
            onClick={() => setConfirmDel(null)}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 101, background: "var(--surface-1)", borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            padding: "28px 28px 22px", width: 380, maxWidth: "90vw",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--danger-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={18} style={{ color: "var(--danger)" }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)", margin: "0 0 4px" }}>¿Desactivar?</p>
                <p style={{ fontSize: 13, color: "var(--fg-3)", margin: 0 }}>
                  Se desactivará <strong>“{confirmDel.name}”</strong>. No se eliminará, pero dejará de aparecer.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={handleDelete} disabled={!!deleting}>
                {deleting ? <Loader2 size={13} className="animate-spin" /> : null}
                Desactivar
              </Btn>
            </div>
          </div>
        </>
      )}

      {qrModal && <QrModal name={qrModal.name} code={qrModal.code} onClose={() => setQrModal(null)} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QrModal({ name, code, onClose }: { name: string; code: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(code, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } })
      .then(url => { if (active) setDataUrl(url); })
      .catch(() => { if (active) setDataUrl(""); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { active = false; window.removeEventListener("keydown", onKey); };
  }, [code, onClose]);

  function printQr() {
    if (!dataUrl) return;
    const popup = window.open("", "_blank", "width=720,height=820");
    if (!popup) return;
    const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    popup.document.write(`<!doctype html><html><head><title>${safe(name)} · Código QR</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:48px;color:#111}main{display:inline-block;border:1px solid #ddd;border-radius:24px;padding:32px}img{width:360px;height:360px}h1{font-size:24px;margin:20px 0 8px}p{font-size:15px;color:#555;margin:0;word-break:break-all}@media print{body{padding:0}main{border:none}}</style></head><body><main><img src="${dataUrl}"/><h1>${safe(name)}</h1><p>${safe(code)}</p></main><script>window.onload=()=>{window.print()}</script></body></html>`);
    popup.document.close();
  }

  async function shareQr() {
    if (!dataUrl) return;
    const blob = await fetch(dataUrl).then(response => response.blob());
    const file = new File([blob], `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`, { type: "image/png" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: `Código QR · ${name}`, text: code, files: [file] });
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = file.name;
    link.click();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }} />
      <div role="dialog" aria-modal="true" aria-label={`Código QR de ${name}`} style={{ position: "fixed", zIndex: 201, left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 430, maxWidth: "calc(100vw - 32px)", borderRadius: 20, overflow: "hidden", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)" }}>
        <div style={{ height: 56, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
          <strong style={{ fontSize: 15, color: "var(--fg-1)" }}>Código QR</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 8, background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}><X size={17} /></button>
        </div>
        <div style={{ padding: "28px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", padding: 24, borderRadius: 18, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box" }}>
            {dataUrl ? <img src={dataUrl} alt={`Código QR de ${name}`} style={{ width: 260, height: 260, maxWidth: "100%" }} /> : <Loader2 size={28} className="animate-spin" style={{ color: "#666", margin: 116 }} />}
            <h2 style={{ margin: "16px 0 6px", fontSize: 19, color: "#111", textAlign: "center" }}>{name}</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#555", textAlign: "center", wordBreak: "break-all" }}>{code}</p>
          </div>
          <div style={{ width: "100%", display: "flex", gap: 10, marginTop: 18 }}>
            <Btn variant="ghost" onClick={printQr} disabled={!dataUrl} style={{ flex: 1, justifyContent: "center" }}><Printer size={14} /> Imprimir</Btn>
            <Btn onClick={() => void shareQr()} disabled={!dataUrl} style={{ flex: 1, justifyContent: "center" }}><Share2 size={14} /> Compartir</Btn>
          </div>
        </div>
      </div>
    </>
  );
}

function EntityDetail({ type, item, ubicaciones, lugares, activos, reservas, onOpen, onQr }: {
  type: Section;
  item: any;
  ubicaciones: Ubicacion[];
  lugares: Lugar[];
  activos: ActivoResumen[];
  reservas: ReservaResumen[];
  onOpen: (type: Section, id: string) => void;
  onQr: (name: string, code: string) => void;
}) {
  const name = type === "ubicaciones" ? item.edificio : item.nombre;
  const qrType = type === "ubicaciones" ? "ubicacion" : type === "lugares" ? "lugar" : "sociedad";
  const qrValue = item.qr_code || `pangui://${qrType}/${item.id}`;
  const linkedPlaces = type === "ubicaciones" ? lugares.filter(l => l.ubicacion_id === item.id) : [];
  const linkedLocations = type === "sociedades" ? ubicaciones.filter(u => u.sociedad_id === item.id) : [];
  const linkedAssets = type === "ubicaciones" ? activos.filter(a => a.ubicacion_id === item.id)
    : type === "lugares" ? activos.filter(a => a.lugar_id === item.id) : [];
  const linkedReservations = type === "ubicaciones" ? reservas.filter(r => r.ubicacion_id === item.id)
    : type === "lugares" ? reservas.filter(r => r.lugar_id === item.id) : [];
  const fields = type === "ubicaciones" ? [
    ["Dirección", item.direccion], ["Descripción", item.descripcion ?? item.detalle],
    ["Grupo a cargo", item.grupo_cargo], ["Asociación", item.sociedad_nombre],
  ] : type === "lugares" ? [
    ["Ubicación", item.ubicacion_edificio], ["Dirección", item.direccion],
    ["Descripción", item.descripcion], ["Grupo a cargo", item.grupo_cargo],
  ] : [["Dirección", item.direccion], ["Descripción", item.descripcion]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        {item.imagen_url && <img src={item.imagen_url} alt={name} style={{ width: "100%", height: 190, display: "block", objectFit: "contain", background: "var(--surface-1)" }} />}
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "var(--fg-1)" }}>{name}</h2>
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, paddingTop: 12, marginTop: 12, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)" }}>{label}</span>
              <span style={{ fontSize: 13, color: "var(--fg-3)", textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <DetailGroup title="Código QR">
        <button type="button" onClick={() => onQr(name, qrValue)} style={{ width: "100%", minHeight: 58, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", background: "var(--brand-tint)" }}><QrCode size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)" }}>Código QR</div><div style={{ fontSize: 12, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis" }}>{qrValue}</div></div>
          <ChevronRight size={16} style={{ color: "var(--fg-4)" }} />
        </button>
      </DetailGroup>

      {linkedLocations.length > 0 && <DetailGroup title={`Ubicaciones (${linkedLocations.length})`}>{linkedLocations.map(u => <DetailLink key={u.id} name={u.edificio} sub={u.direccion} icon={<MapPin size={17} />} onClick={() => onOpen("ubicaciones", u.id)} />)}</DetailGroup>}
      {linkedPlaces.length > 0 && <DetailGroup title={`Lugares específicos (${linkedPlaces.length})`}>{linkedPlaces.map(l => <DetailLink key={l.id} name={l.nombre} sub={l.descripcion} icon={<MapPin size={17} />} onClick={() => onOpen("lugares", l.id)} />)}</DetailGroup>}
      {linkedAssets.length > 0 && <DetailGroup title={`Activos (${linkedAssets.length})`}>{linkedAssets.map(a => <DetailLink key={a.id} name={a.nombre} sub={a.numero_serie} icon={<Wrench size={17} />} />)}</DetailGroup>}
      {linkedReservations.length > 0 && <DetailGroup title={`Materiales reservados (${linkedReservations.length})`}>{linkedReservations.map(r => <DetailLink key={r.id} name={r.parte?.nombre ?? "Material"} sub={`${Number(r.cantidad).toLocaleString("es-CL")} ${r.parte?.unidad ?? ""}`} icon={<Package size={17} />} />)}</DetailGroup>}
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 style={{ margin: "0 0 8px 4px", fontSize: 13, fontWeight: 600, color: "var(--fg-3)" }}>{title}</h3><div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface-2)" }}>{children}</div></section>;
}

function DetailLink({ name, sub, icon, onClick }: { name: string; sub?: string | null; icon: React.ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick} style={{ width: "100%", minHeight: 58, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, border: "none", borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--fg-2)", fontFamily: "inherit", textAlign: "left", cursor: onClick ? "pointer" : "default" } as React.CSSProperties}><div style={{ width: 36, height: 36, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--brand-tint)", color: "var(--brand)" }}>{icon}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)" }}>{name}</div>{sub && <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>{sub}</div>}</div>{onClick && <ChevronRight size={16} style={{ color: "var(--fg-4)" }} />}</Tag>;
}

function ListRow({
  img, name, sub, onOpen, onEdit, onDelete,
}: {
  img: string | null;
  name: string;
  sub?: string;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div onClick={onOpen} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} onKeyDown={e => { if (onOpen && (e.key === "Enter" || e.key === " ")) onOpen(); }} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 24px", borderBottom: "1px solid var(--border)",
      transition: "background 0.1s", cursor: onOpen ? "pointer" : "default",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <Avatar src={img} name={name} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
        {sub && <p style={{ fontSize: 12, color: "var(--fg-4)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
      </div>
      {onEdit && (
        <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }}
          style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-4)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--fg-2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--fg-4)"; }}>
          <Pencil size={14} />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-4)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--fg-4)"; }}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>
      {label}
    </div>
  );
}
