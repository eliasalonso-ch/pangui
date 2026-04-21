"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, Building2, Plus, Pencil, Trash2, X, Check,
  Loader2, Search, ChevronRight, Image as ImageIcon, Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sociedad {
  id: string;
  nombre: string;
  imagen_url: string | null;
}

interface Ubicacion {
  id: string;
  edificio: string;
  piso: string | null;
  detalle: string | null;
  direccion: string | null;
  grupo_cargo: string | null;
  sociedad_id: string | null;
  imagen_url: string | null;
  sociedad_nombre: string | null;
}

interface Lugar {
  id: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  imagen_url: string | null;
  ubicacion_id: string | null;
  ubicacion_edificio: string | null;
}

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
      background: "#EFF6FF", color: "#1E3A8A",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700,
    }}>
      {initials || <Building2 size={size * 0.5} />}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 5px" }}>
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
        border: "1px solid #E2E8F0", borderRadius: 6,
        fontSize: 13, color: "#0F172A", outline: "none",
        fontFamily: "inherit", background: disabled ? "#F9FAFB" : "#fff",
        boxSizing: "border-box",
      }}
      onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
      onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
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
        border: "1px solid #E2E8F0", borderRadius: 6,
        fontSize: 13, color: "#0F172A", outline: "none",
        fontFamily: "inherit", background: "#fff", resize: "vertical",
        boxSizing: "border-box",
      }}
      onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
      onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
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
    primary: { background: "#1E3A8A", color: "#fff" },
    ghost:   { background: "#F3F4F6", color: "#374151" },
    danger:  { background: "#FEF2F2", color: "#DC2626" },
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
        border: "1px dashed #D1D5DB", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F9FAFB", flexShrink: 0, position: "relative",
      }}>
        {uploading ? (
          <Loader2 size={20} className="animate-spin" style={{ color: "#9CA3AF" }} />
        ) : src ? (
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImageIcon size={24} style={{ color: "#D1D5DB" }} />
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

  // Panel state
  const [panel, setPanel] = useState<{
    type: Section;
    mode: "create" | "edit";
    id?: string;
  } | null>(null);

  // Form state
  const [form, setForm]             = useState<Record<string, string>>({});
  const [imgUrl, setImgUrl]         = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ type: Section; id: string; name: string } | null>(null);

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
    const [ubRes, luRes, soRes] = await Promise.all([
      sb.from("ubicaciones")
        .select("id, edificio, piso, detalle, direccion, grupo_cargo, sociedad_id, imagen_url, sociedades(nombre)")
        .eq("workspace_id", wid).eq("activa", true).order("edificio"),
      sb.from("lugares")
        .select("id, nombre, descripcion, direccion, imagen_url, ubicacion_id, ubicaciones(edificio)")
        .eq("workspace_id", wid).eq("activo", true).order("nombre"),
      sb.from("sociedades")
        .select("id, nombre, imagen_url")
        .eq("workspace_id", wid).eq("activa", true).order("nombre"),
    ]);
    setUbicaciones((ubRes.data ?? []).map((u: any) => ({
      ...u, sociedad_nombre: (u.sociedades as any)?.nombre ?? null,
    })));
    setLugares((luRes.data ?? []).map((l: any) => ({
      ...l, ubicacion_edificio: (l.ubicaciones as any)?.edificio ?? null,
    })));
    setSociedades(soRes.data ?? []);
  }

  function openCreate(type: Section) {
    setPanel({ type, mode: "create" });
    setForm({});
    setImgUrl(null);
  }

  function openEdit(type: Section, item: any) {
    setPanel({ type, mode: "edit", id: item.id });
    if (type === "ubicaciones") {
      setForm({
        edificio:    item.edificio ?? "",
        piso:        item.piso ?? "",
        direccion:   item.direccion ?? "",
        grupo_cargo: item.grupo_cargo ?? "",
        sociedad_id: item.sociedad_id ?? "",
      });
    } else if (type === "lugares") {
      setForm({
        nombre:      item.nombre ?? "",
        descripcion: item.descripcion ?? "",
        direccion:   item.direccion ?? "",
        ubicacion_id: item.ubicacion_id ?? "",
      });
    } else {
      setForm({ nombre: item.nombre ?? "" });
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
        const payload = { nombre: form.nombre?.trim(), imagen_url: imgUrl ?? null };
        if (mode === "create") {
          await sb.from("sociedades").insert({ workspace_id: wsId, ...payload });
        } else {
          await sb.from("sociedades").update(payload).eq("id", id!);
        }
      } else if (type === "ubicaciones") {
        const payload = {
          edificio:    form.edificio?.trim(),
          piso:        form.piso?.trim() || null,
          direccion:   form.direccion?.trim() || null,
          grupo_cargo: form.grupo_cargo?.trim() || null,
          sociedad_id: form.sociedad_id || null,
          imagen_url:  imgUrl ?? null,
        };
        if (mode === "create") {
          await sb.from("ubicaciones").insert({ workspace_id: wsId, activa: true, ...payload });
        } else {
          await sb.from("ubicaciones").update(payload).eq("id", id!);
        }
      } else {
        const payload = {
          nombre:       form.nombre?.trim(),
          descripcion:  form.descripcion?.trim() || null,
          direccion:    form.direccion?.trim() || null,
          ubicacion_id: form.ubicacion_id || null,
          imagen_url:   imgUrl ?? null,
        };
        if (mode === "create") {
          await sb.from("lugares").insert({ workspace_id: wsId, activo: true, ...payload });
        } else {
          await sb.from("lugares").update(payload).eq("id", id!);
        }
      }

      await fetchAll(sb, wsId);
      setPanel(null);
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

  const canEdit = myRol === "admin" || myRol === "jefe";

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
    panel.mode === "create" ? (
      panel.type === "ubicaciones" ? "Nueva ubicación"
      : panel.type === "lugares" ? "Nuevo lugar"
      : "Nueva empresa"
    ) : (
      panel.type === "ubicaciones" ? "Editar ubicación"
      : panel.type === "lugares" ? "Editar lugar"
      : "Editar empresa"
    );

  const canSave = !saving && !uploadingImg && (
    panel?.type === "ubicaciones" ? !!form.edificio?.trim()
    : !!form.nombre?.trim()
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#9CA3AF", gap: 8 }}>
        <Loader2 size={18} className="animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "#fff" }}>

      {/* Main list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: panel ? "1px solid #E2E8F0" : "none" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>Ubicaciones</h1>
          {canEdit && (
            <Btn onClick={() => openCreate(section)}>
              <Plus size={14} />
              {section === "ubicaciones" ? "Nueva ubicación"
               : section === "lugares" ? "Nuevo lugar"
               : "Nueva empresa"}
            </Btn>
          )}
        </div>

        {/* Tabs */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", padding: "0 24px", display: "flex", gap: 0 }}>
          {([["ubicaciones", "Ubicaciones"], ["lugares", "Lugares"], ["sociedades", "Empresas"]] as [Section, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setSection(key); setSearch(""); }}
              style={{
                height: 40, padding: "0 16px",
                background: "none", border: "none",
                borderBottom: section === key ? "2px solid #1E3A8A" : "2px solid transparent",
                color: section === key ? "#1E3A8A" : "#9CA3AF",
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
        <div style={{ flexShrink: 0, padding: "12px 24px", borderBottom: "1px solid #F1F3F5" }}>
          <div style={{ position: "relative", maxWidth: 360 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              style={{
                width: "100%", height: 34, padding: "0 10px 0 32px",
                border: "1px solid #E2E8F0", borderRadius: 6,
                fontSize: 13, color: "#0F172A", outline: "none",
                fontFamily: "inherit", background: "#fff", boxSizing: "border-box",
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}>
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
                sub={[u.piso, u.direccion, u.sociedad_nombre].filter(Boolean).join(" · ")}
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
                onEdit={canEdit ? () => openEdit("lugares", l) : undefined}
                onDelete={canEdit ? () => setConfirmDel({ type: "lugares", id: l.id, name: l.nombre }) : undefined}
              />
            ))
          )}
          {section === "sociedades" && (
            filtered.sociedades.length === 0 ? <Empty label="Sin empresas" /> :
            filtered.sociedades.map(s => (
              <ListRow
                key={s.id}
                img={s.imagen_url}
                name={s.nombre}
                onEdit={canEdit ? () => openEdit("sociedades", s) : undefined}
                onDelete={canEdit ? () => setConfirmDel({ type: "sociedades", id: s.id, name: s.nombre }) : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Edit / Create panel */}
      {panel && (
        <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", background: "#fff" }}>
          {/* Panel header */}
          <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{panelTitle}</span>
            <button type="button" onClick={() => setPanel(null)}
              style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#9CA3AF" }}>
              <X size={15} />
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
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
                    <FieldLabel>Piso / Nivel</FieldLabel>
                    <FieldInput value={form.piso ?? ""} onChange={v => setForm(f => ({ ...f, piso: v }))} placeholder="Ej: 3" />
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
                        border: "1px solid #E2E8F0", borderRadius: 6,
                        fontSize: 13, color: form.sociedad_id ? "#0F172A" : "#9CA3AF",
                        outline: "none", fontFamily: "inherit", background: "#fff",
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
                    <FieldLabel>Edificio / Ubicación</FieldLabel>
                    <select
                      value={form.ubicacion_id ?? ""}
                      onChange={e => setForm(f => ({ ...f, ubicacion_id: e.target.value }))}
                      style={{
                        width: "100%", height: 36, padding: "0 10px",
                        border: "1px solid #E2E8F0", borderRadius: 6,
                        fontSize: 13, color: form.ubicacion_id ? "#0F172A" : "#9CA3AF",
                        outline: "none", fontFamily: "inherit", background: "#fff",
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
                <div>
                  <FieldLabel>Nombre de la empresa *</FieldLabel>
                  <FieldInput value={form.nombre ?? ""} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej: Constructora XYZ SpA" />
                </div>
              )}

            </div>
          </div>

          {/* Panel footer */}
          <div style={{ flexShrink: 0, borderTop: "1px solid #E2E8F0", padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setPanel(null)}>Cancelar</Btn>
            <Btn onClick={handleSave} disabled={!canSave}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {panel.mode === "create" ? "Crear" : "Guardar"}
            </Btn>
          </div>
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
            zIndex: 101, background: "#fff", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(15,23,42,0.18)",
            padding: "28px 28px 22px", width: 380, maxWidth: "90vw",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={18} style={{ color: "#DC2626" }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>¿Desactivar?</p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
                  Se desactivará <strong>"{confirmDel.name}"</strong>. No se eliminará, pero dejará de aparecer.
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
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ListRow({
  img, name, sub, onEdit, onDelete,
}: {
  img: string | null;
  name: string;
  sub?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 24px", borderBottom: "1px solid #F9FAFB",
      transition: "background 0.1s",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = "#FAFAFA"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <Avatar src={img} name={name} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
        {sub && <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit}
          style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#9CA3AF" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = "#374151"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9CA3AF"; }}>
          <Pencil size={14} />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete}
          style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#9CA3AF" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#DC2626"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9CA3AF"; }}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "#C4CDD6", fontSize: 13 }}>
      {label}
    </div>
  );
}
