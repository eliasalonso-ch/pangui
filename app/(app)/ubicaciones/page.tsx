"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MapPin, Building2, Plus, Pencil, Trash2, X, Check,
  Loader2, Search, ChevronRight, Image as ImageIcon, Upload, QrCode, Package, Wrench, Printer, Share2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-user";
import AppLoadingState from "@/components/AppLoadingState";
import HistorialOT from "@/components/catalogo/HistorialOT";
import AccionesCatalogo from "@/components/catalogo/AccionesCatalogo";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import {
  useUbicacionesFull, useLugaresFull, useSociedadesFull,
  useActivosResumen, useReservasResumen,
  type UbicacionFull, type LugarFull, type SociedadFull,
  type ActivoResumen, type ReservaResumen,
} from "@/lib/queries";

// ── Types ─────────────────────────────────────────────────────────────────────

// Las filas vienen de los hooks de lib/queries.ts; aca solo se les pone el
// nombre corto que ya usaba el resto del archivo.
type Sociedad      = SociedadFull;
type Ubicacion     = UbicacionFull;
type Lugar         = LugarFull;

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [wsId, setWsId]             = useState<string | null>(null);
  const [myRol, setMyRol]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const section: Section = pathname.endsWith("/lugares")
    ? "lugares"
    : pathname.endsWith("/asociaciones")
      ? "sociedades"
      : "ubicaciones";
  const [search, setSearch]         = useState("");
  const pageSize = 50;
  const [page, setPage]             = useState(1);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Volver al principio al cambiar de pestaña o al buscar: si no, una busqueda
  // que devuelve 3 filas seguiria arrastrando el scroll de la anterior.
  useEffect(() => { setPage(1); }, [section, search]);

  // Data — via TanStack, asi volver a /ubicaciones no vuelve a pedir los cinco
  // catalogos. Son datos casi estaticos: REFERENCE_STALE_TIME es 15 min.
  const queryClient = useQueryClient();
  const ubicacionesQ = useUbicacionesFull(wsId);
  const lugaresQ     = useLugaresFull(wsId);
  const sociedadesQ  = useSociedadesFull(wsId);
  const activosQ     = useActivosResumen(wsId);
  const reservasQ    = useReservasResumen(wsId);

  const ubicaciones = ubicacionesQ.data ?? [];
  const lugares     = lugaresQ.data ?? [];
  const sociedades  = sociedadesQ.data ?? [];
  const activos     = activosQ.data ?? [];
  const reservas    = reservasQ.data ?? [];

  // Panel state
  const [panel, setPanel] = useState<{
    type: Section;
    mode: "create" | "edit" | "view";
    id?: string;
  } | null>(() => searchParams.get("nueva") === "1"
    ? { type: "ubicaciones", mode: "create" }
    : searchParams.get("id")
      ? { type: "ubicaciones", mode: "view", id: searchParams.get("id")! }
      : null);

  // Form state
  const [form, setForm]             = useState<Record<string, string>>(() => searchParams.get("nueva") === "1" ? { qr_code: "" } : {} as Record<string, string>);
  const [imgUrl, setImgUrl]         = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ type: Section; id: string; name: string } | null>(null);
  const [qrModal, setQrModal] = useState<{ name: string; code: string } | null>(null);

  // Solo resuelve el perfil: los cinco catalogos los traen los hooks de arriba
  // en cuanto wsId deja de ser null.
  useEffect(() => {
    async function load() {
      const user = await getAuthUser();
      if (!user) { router.replace("/login"); return; }

      const sb = createClient();
      const { data: perfil } = await sb
        .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) { setLoading(false); return; }

      setWsId(perfil.workspace_id);
      setMyRol(perfil.rol);
      setLoading(false);
    }
    load();
  }, [router]);

  /** Refresca los catalogos tras guardar o borrar. */
  function invalidarCatalogos() {
    for (const key of ["ubicaciones-full", "lugares-full", "sociedades-full", "activos-resumen", "reservas-resumen"]) {
      queryClient.invalidateQueries({ queryKey: [key, wsId] });
    }
    // Los pickers de otras pantallas leen las versiones cortas del mismo dato.
    queryClient.invalidateQueries({ queryKey: ["ubicaciones"] });
    queryClient.invalidateQueries({ queryKey: ["lugares"] });
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

      invalidarCatalogos();
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
      invalidarCatalogos();
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

  const searchPlaceholder =
    section === "ubicaciones" ? "Buscar ubicaciones…"
    : section === "lugares"   ? "Buscar lugares…"
    : "Buscar asociaciones…";

  const createLabel =
    section === "ubicaciones" ? "Nueva ubicación"
    : section === "lugares"   ? "Nuevo lugar"
    : "Nueva asociación";

  const emptyIcon =
    section === "ubicaciones" ? <Building2 size={32} />
    : section === "lugares"   ? <MapPin size={32} />
    : <Building2 size={32} />;

  const emptyTitle =
    section === "ubicaciones" ? "No hay ubicaciones aún"
    : section === "lugares"   ? "No hay lugares específicos aún"
    : "No hay asociaciones aún";

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

  // Paginado en cliente: los catalogos ya estan en memoria (473 lugares es el
  // mas grande), asi que paginar en el servidor solo agregaria una ida y vuelta
  // por pagina y romperia la busqueda instantanea, que filtra sobre el total.
  // Lo que si evita es dibujar cientos de filas de una.
  const visibleCount = pageSize * page;
  const currentList = filtered[section];
  const pageItems = currentList.slice(0, visibleCount);
  const hasMore = currentList.length > visibleCount;

  // rootMargin adelanta la carga 300px, asi la siguiente tanda ya esta dibujada
  // cuando el centinela llega al borde y el scroll no se corta.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) setPage(p => p + 1); },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, section, search]);

  const canSave = !saving && !uploadingImg && (
    panel?.type === "ubicaciones" ? !!form.edificio?.trim()
    : !!form.nombre?.trim()
  );
  const selectedItem = !panel?.id ? null
    : panel.type === "ubicaciones" ? ubicaciones.find(item => item.id === panel.id) ?? null
    : panel.type === "lugares" ? lugares.find(item => item.id === panel.id) ?? null
    : sociedades.find(item => item.id === panel.id) ?? null;

  /** El nombre visible cambia de columna segun el catalogo. */
  function nombreDe(type: Section, item: Ubicacion | Lugar | Sociedad): string {
    return type === "ubicaciones" ? (item as Ubicacion).edificio : (item as Lugar | Sociedad).nombre;
  }

  // En vista el titulo es el nombre del elemento (como en /categorias, que
  // muestra "Eléctrico" y no "Detalle de categoría"); al crear o editar
  // describe la accion.
  const panelTitle = !panel ? "" :
    panel.mode === "view" ? (
      selectedItem ? nombreDe(panel.type, selectedItem) : ""
    ) : panel.mode === "create" ? (
      panel.type === "ubicaciones" ? "Nueva ubicación"
      : panel.type === "lugares" ? "Nuevo lugar"
      : "Nueva asociación"
    ) : (
      panel.type === "ubicaciones" ? "Editar ubicación"
      : panel.type === "lugares" ? "Editar lugar"
      : "Editar asociación"
    );


  // Con cache tibia los hooks resuelven al instante y esto no llega a verse;
  // en frio espera a que llegue la lista de la pestaña actual.
  const listaCargando =
    section === "ubicaciones" ? ubicacionesQ.isPending
    : section === "lugares"   ? lugaresQ.isPending
    : sociedadesQ.isPending;

  if (loading || (wsId && listaCargando)) {
    return <AppLoadingState label="Cargando ubicaciones…" minHeight="60dvh" />;
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden", background: "var(--surface-canvas)" }}>

      {/* Main list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Toolbar */}
        {/* Toolbar — mismo patron que /categorias: buscador y accion alineados
            a la derecha, tokens de radio y foco compartidos. */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", justifyContent: "flex-end" }}>
            <div style={{ position: "relative", width: 320 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  width: "100%", height: 36, paddingLeft: 32, paddingRight: search ? 32 : 12,
                  border: "1px solid var(--border)", borderRadius: "var(--r-md)", fontSize: 13,
                  background: "var(--surface-1)", outline: "none", fontFamily: "inherit", color: "var(--fg-1)",
                  boxSizing: "border-box",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => openCreate(section)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: 36, padding: "0 14px",
                  background: "var(--brand)", border: "none", borderRadius: "var(--r-md)", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, color: "var(--fg-on-brand)", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={14} />
                {createLabel}
              </button>
            )}
          </div>
        </div>

        {/* Master–detail: columna fija de tarjetas + detalle flexible, igual
            que /categorias. Antes la lista ocupaba todo y el detalle era un
            panel de 380px que solo aparecia al seleccionar. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        {/* Lista de tarjetas */}
        <div style={{
          width: 380, flexShrink: 0, borderRight: "1px solid var(--border)",
          overflowY: "auto", background: "var(--surface-canvas)",
          display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px",
        }}>
          {section === "ubicaciones" && (
            filtered.ubicaciones.length === 0 ? <Empty icon={emptyIcon} title={search ? "Sin resultados" : emptyTitle} hint={!search && canEdit ? "Crea el primero con el boton de arriba" : undefined} /> :
            (pageItems as any[]).map(u => (
              <ListRow
                key={u.id}
                selected={panel?.id === u.id}
                img={u.imagen_url}
                name={u.edificio}
                sub={[u.detalle, u.direccion, u.sociedad_nombre].filter(Boolean).join(" · ")}
                onOpen={() => openDetail("ubicaciones", u.id)}
              />
            ))
          )}
          {section === "lugares" && (
            filtered.lugares.length === 0 ? <Empty icon={emptyIcon} title={search ? "Sin resultados" : emptyTitle} hint={!search && canEdit ? "Crea el primero con el boton de arriba" : undefined} /> :
            (pageItems as any[]).map(l => (
              <ListRow
                key={l.id}
                selected={panel?.id === l.id}
                img={l.imagen_url}
                name={l.nombre}
                sub={[l.ubicacion_edificio, l.descripcion].filter(Boolean).join(" · ")}
                onOpen={() => openDetail("lugares", l.id)}
              />
            ))
          )}
          {section === "sociedades" && (
            filtered.sociedades.length === 0 ? <Empty icon={emptyIcon} title={search ? "Sin resultados" : emptyTitle} hint={!search && canEdit ? "Crea el primero con el boton de arriba" : undefined} /> :
            (pageItems as any[]).map(s => (
              <ListRow
                key={s.id}
                selected={panel?.id === s.id}
                img={s.imagen_url}
                name={s.nombre}
                onOpen={() => openDetail("sociedades", s.id)}
              />
            ))
          )}

          {/* Scroll infinito: el centinela avisa cuando esta por entrar en
              pantalla y se dibuja la siguiente tanda. Los datos ya estan en
              memoria, asi que no hay peticion de por medio. */}
          {hasMore && (
            <div ref={sentinelRef} style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          )}
          {!hasMore && currentList.length > pageSize && (
            <div style={{ padding: "14px 16px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-4)" }}>
              {currentList.length} en total
            </div>
          )}
        </div>

      {/* Detalle — siempre presente; con placeholder si no hay seleccion. */}
      {!panel ? (
        <div style={{
          flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)",
        }}>
          {section === "lugares" ? <MapPin size={40} style={{ opacity: 0.5 }} /> : <Building2 size={40} style={{ opacity: 0.5 }} />}
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-3)" }}>
            {section === "ubicaciones" ? "Selecciona una ubicación"
             : section === "lugares"   ? "Selecciona un lugar"
             : "Selecciona una asociación"}
          </div>
          <div style={{ fontSize: 12.5 }}>El detalle aparecerá aquí</div>
        </div>
      ) : (
        // El panel va sobre el lienzo (--surface-canvas) y la tarjeta de adentro
        // es la que lleva --surface-1, igual que en /categorias. Antes el panel
        // entero era --surface-1 y quedaba un bloque blanco plano.
        // Sin `display:flex` aca: en columna flex la tarjeta quedaba acotada al
        // alto disponible y el scroll no llegaba al final. Como bloque normal,
        // la tarjeta crece con su contenido y este div la desplaza.
        <div style={{ flex: 1, minWidth: 0, background: "var(--surface-canvas)", overflowY: "auto", padding: "8px 20px 20px" }}>
          <div style={{
            background: "var(--surface-1)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
          }}>
          {/* Panel header */}
          <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>{panelTitle}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Mismo par Editar + ⋮ que /categorias e /itos. */}
              {panel.mode === "view" && selectedItem && (
                <AccionesCatalogo
                  puedeEditar={canEdit}
                  puedeEliminar={canEdit}
                  onEdit={() => openEdit(panel.type, selectedItem)}
                  onDelete={() => setConfirmDel({
                    type: panel.type,
                    id: selectedItem.id,
                    name: nombreDe(panel.type, selectedItem),
                  })}
                />
              )}
            </div>
          </div>

          {/* Panel body — el scroll lo lleva el contenedor de afuera. */}
          <div style={{ padding: "20px" }}>
            {panel.mode === "view" && selectedItem ? (
              <>
                <EntityDetail
                  type={panel.type}
                  item={selectedItem}
                  ubicaciones={ubicaciones}
                  lugares={lugares}
                  sociedades={sociedades}
                  activos={activos}
                  reservas={reservas}
                  onOpen={(type, id) => openDetail(type, id)}
                  onQr={(name, code) => setQrModal({ name, code })}
                />

                {/* Mismo historial que /categorias e /itos: la serie y la lista
                    de OTs salen del componente compartido, que ahora tambien
                    filtra por ubicacion, lugar y sociedad. */}
                {/* `minWidth: 0` contiene al ResponsiveContainer de Recharts,
                    que si no mide de mas y se sale de la tarjeta. */}
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)", minWidth: 0, overflowX: "hidden" }}>
                  <HistorialOT
                    workspaceId={wsId}
                    target={
                      panel.type === "ubicaciones" ? { tipo: "ubicacion", ubicacionId: selectedItem.id }
                      : panel.type === "lugares"   ? { tipo: "lugar", lugarId: selectedItem.id }
                      : { tipo: "sociedad", sociedadId: selectedItem.id }
                    }
                  />
                </div>
              </>
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

          {/* Panel footer — pegajoso al pie de la tarjeta, como el CTA de
              /categorias, para que no se pierda en formularios largos. */}
          {panel.mode !== "view" && <div style={{
            position: "sticky", bottom: 0, zIndex: 10,
            borderTop: "1px solid var(--border)", padding: "14px 20px",
            display: "flex", justifyContent: "flex-end", gap: 8,
            background: "var(--surface-1)", borderRadius: "0 0 var(--r-lg) var(--r-lg)",
          }}>
            <Btn variant="ghost" onClick={() => setPanel(null)}>Cancelar</Btn>
            <Btn onClick={handleSave} disabled={!canSave}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {panel.mode === "create" ? "Crear" : "Guardar"}
            </Btn>
          </div>}
          </div>
        </div>
      )}
        </div>
      </div>

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

function EntityDetail({ type, item, ubicaciones, lugares, sociedades, activos, reservas, onOpen, onQr }: {
  type: Section;
  item: any;
  ubicaciones: Ubicacion[];
  lugares: Lugar[];
  sociedades: Sociedad[];
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
  // La asociación de una ubicación sale de los campos planos y pasa a ser una
  // fila abrible, igual que los lugares específicos.
  const linkedSociedad = type === "ubicaciones" && item.sociedad_id
    ? sociedades.find(s => s.id === item.sociedad_id) ?? null
    : null;
  // Un lugar hereda la asociación de su ubicación padre.
  const lugarSociedad = type === "lugares" && item.ubicacion_id
    ? (() => {
        const padre = ubicaciones.find(u => u.id === item.ubicacion_id);
        return padre?.sociedad_id ? sociedades.find(s => s.id === padre.sociedad_id) ?? null : null;
      })()
    : null;
  const sociedadAbrible = linkedSociedad ?? lugarSociedad;

  const fields = type === "ubicaciones" ? [
    ["Dirección", item.direccion], ["Descripción", item.descripcion ?? item.detalle],
    ["Grupo a cargo", item.grupo_cargo],
  ] : type === "lugares" ? [
    ["Ubicación", item.ubicacion_edificio], ["Dirección", item.direccion],
    ["Descripción", item.descripcion], ["Grupo a cargo", item.grupo_cargo],
  ] : [["Dirección", item.direccion], ["Descripción", item.descripcion]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Sin tarjeta ni titulo propios: el nombre ya esta en el encabezado del
          panel y los separadores los pone cada DetailGroup. */}
      {(item.imagen_url || fields.some(([, value]) => value)) && (
        <div>
          {item.imagen_url && (
            <img
              src={item.imagen_url}
              alt={name}
              style={{ width: "100%", height: 190, display: "block", objectFit: "contain", background: "var(--surface-2)", borderRadius: "var(--r-md)", marginBottom: 14 }}
            />
          )}
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-2)" }}>{label}</span>
              <span style={{ fontSize: 13, color: "var(--fg-3)", textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Primer grupo: sin linea arriba. El bloque de imagen/campos ya se
          separa por el `gap` del contenedor. */}
      <DetailGroup title="Código QR" first>
        <DetailLink
          first
          name="Código QR"
          sub={qrValue}
          icon={<QrCode size={15} />}
          onClick={() => onQr(name, qrValue)}
        />
      </DetailGroup>

      {sociedadAbrible && (
        <DetailGroup title="Asociación">
          <DetailLink
            first
            name={sociedadAbrible.nombre}
            sub={sociedadAbrible.direccion}
            img={sociedadAbrible.imagen_url}
            icon={<Building2 size={15} />}
            onClick={() => onOpen("sociedades", sociedadAbrible.id)}
          />
        </DetailGroup>
      )}
      {linkedLocations.length > 0 && <DetailGroup title={`Ubicaciones (${linkedLocations.length})`}>{linkedLocations.map((u, i) => <DetailLink key={u.id} first={i === 0} name={u.edificio} sub={u.direccion} img={u.imagen_url} icon={<MapPin size={15} />} onClick={() => onOpen("ubicaciones", u.id)} />)}</DetailGroup>}
      {linkedPlaces.length > 0 && <DetailGroup title={`Lugares específicos (${linkedPlaces.length})`}>{linkedPlaces.map((l, i) => <DetailLink key={l.id} first={i === 0} name={l.nombre} sub={l.descripcion} img={l.imagen_url} icon={<MapPin size={15} />} onClick={() => onOpen("lugares", l.id)} />)}</DetailGroup>}
      {linkedAssets.length > 0 && <DetailGroup title={`Activos (${linkedAssets.length})`}>{linkedAssets.map((a, i) => <DetailLink key={a.id} first={i === 0} name={a.nombre} sub={a.numero_serie} img={a.imagen_url} icon={<Wrench size={15} />} />)}</DetailGroup>}
      {linkedReservations.length > 0 && <DetailGroup title={`Materiales reservados (${linkedReservations.length})`}>{linkedReservations.map((r, i) => <DetailLink key={r.id} first={i === 0} name={r.parte?.nombre ?? "Material"} sub={`${Number(r.cantidad).toLocaleString("es-CL")} ${r.parte?.unidad ?? ""}`} img={r.parte?.imagen_url} icon={<Package size={15} />} />)}</DetailGroup>}
    </div>
  );
}

/**
 * Grupo de una lista relacionada. Sin caja ni redondeo propios: el titulo va
 * sobre las filas y un separador arriba las agrupa, como en la referencia. La
 * tarjeta del detalle ya aporta borde y fondo.
 */
function DetailGroup({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section style={{
      paddingTop: first ? 0 : 16,
      // El primer grupo no lleva linea arriba: no separa de nada.
      borderTop: first ? "none" : "1px solid var(--border)",
    }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

/**
 * Fila de una lista relacionada (lugares, activos, materiales).
 *
 * Muestra la foto real cuando existe y cae al icono del tipo cuando no. Las
 * filas son compactas y sin redondeo: la tarjeta contenedora ya lo aporta.
 */
function DetailLink({ name, sub, icon, img, first, onClick }: {
  name: string;
  sub?: string | null;
  icon: React.ReactNode;
  img?: string | null;
  first?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        width: "100%", minHeight: 44, padding: "8px 0", display: "flex",
        alignItems: "center", gap: 12, border: "none",
        // El separador va ARRIBA y no en la primera fila: asi el ultimo
        // elemento no deja una linea suelta pegada al grupo siguiente.
        borderTop: first ? "none" : "1px solid var(--border)",
        background: "transparent",
        color: "var(--fg-2)", fontFamily: "inherit", textAlign: "left",
        cursor: onClick ? "pointer" : "default",
      } as React.CSSProperties}
    >
      {img ? (
        <img
          src={img}
          alt=""
          style={{ width: 28, height: 28, objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, flexShrink: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "var(--brand-tint)", color: "var(--brand)",
        }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--fg-4)", marginTop: 1 }}>{sub}</div>}
      </div>
      {onClick && <ChevronRight size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
    </Tag>
  );
}

/**
 * Tarjeta de la columna izquierda. Mismo patron que CategoriaRow en
 * /categorias: seleccionable, borde de marca cuando esta activa y acciones
 * que aparecen al pasar el mouse.
 */
function ListRow({
  img, name, sub, selected, onOpen,
}: {
  img: string | null;
  name: string;
  sub?: string;
  selected?: boolean;
  onOpen?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={e => { if (onOpen && (e.key === "Enter" || e.key === " ")) onOpen(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", cursor: onOpen ? "pointer" : "default", flexShrink: 0,
        background: selected ? "var(--brand-tint)" : "var(--surface-1)",
        border: `1px solid ${selected ? "var(--brand)" : hover ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        transition: "border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)",
      }}
    >
      <Avatar src={img} name={name} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
        {sub && <p style={{ fontSize: 12, color: "var(--fg-4)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
      </div>
    </div>
  );
}

/** Mismo vacio que /categorias: icono, titulo y pista de que hacer. */
function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: 240, color: "var(--fg-4)", gap: 8, padding: 24, textAlign: "center",
    }}>
      {icon}
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-3)" }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5 }}>{hint}</div>}
    </div>
  );
}
