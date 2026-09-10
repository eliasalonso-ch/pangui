"use client";

import { Children, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MapPin, Building2, Plus, Pencil, Trash2, X, Check,
  Loader2, Search, ChevronRight, QrCode, Package, Wrench, Printer, Share2,
  Camera, Locate, Layers, Users, Minus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { getAuthUser } from "@/lib/auth-user";
import AppLoadingState from "@/components/AppLoadingState";
import HistorialOT from "@/components/catalogo/HistorialOT";
import AccionesCatalogo from "@/components/catalogo/AccionesCatalogo";
import CampoCoordenadas from "@/components/catalogo/CampoCoordenadas";
import SearchSelect from "@/components/catalogo/SearchSelect";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import {
  useUbicacionesFull, useLugaresFull, useSociedadesFull,
  useActivosResumen, useReservasResumen, useCuadrillas,
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

/** Columna donde vive el nombre visible de cada catalogo. */
const NOMBRE_KEY: Record<Section, string> = {
  ubicaciones: "edificio",
  lugares:     "nombre",
  sociedades:  "nombre",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      // Mismo avatar que /ordenes: degradado de marca oscuro con las iniciales
      // en blanco. El tinte claro anterior (--brand-tint) se leia casi vacio.
      background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
      color: "var(--fg-on-brand)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 400,
    }}>
      {initials || <Building2 size={size * 0.5} />}
    </div>
  );
}

/**
 * Fila de formulario del panel de activos (que a su vez viene de OTEditPanel):
 * icono de marca en una canaleta fija de 16, etiqueta y control debajo. El
 * `paddingLeft: 22` de los controles anchos alinea con el texto de la etiqueta.
 */
function FieldRow({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "14px 0" }}>
      <div style={{ width: 16, paddingTop: 3, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", marginBottom: 10, letterSpacing: "0.01em" }}>
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Control de 40px del panel de activos: mismo alto, radio y tokens de borde. */
const otInputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, color: "var(--fg-1)", outline: "none",
  fontFamily: "inherit", background: "var(--surface-1)", boxSizing: "border-box",
};

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
      style={{ ...otInputStyle, background: disabled ? "var(--surface-0)" : "var(--surface-1)" }}
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
        width: "100%", fontSize: 14, color: "var(--fg-1)",
        border: "1px solid var(--border)", borderRadius: 8,
        padding: "12px 14px", outline: "none", resize: "vertical",
        fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.7, minHeight: 92,
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
    fontSize: 14, fontWeight: 400, cursor: disabled ? "default" : "pointer",
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
  const cuadrillasQ  = useCuadrillas(wsId);

  const ubicaciones = ubicacionesQ.data ?? [];
  const lugares     = lugaresQ.data ?? [];
  const sociedades  = sociedadesQ.data ?? [];
  const activos     = activosQ.data ?? [];
  const reservas    = reservasQ.data ?? [];
  const cuadrillas  = cuadrillasQ.data ?? [];

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
  // Coordenadas aparte: el resto del formulario es texto y usa .trim() en todos lados.
  const [coords, setCoords]         = useState<{ lat: number; lng: number } | null>(null);
  const [imgUrl, setImgUrl]         = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [dragOverImage, setDragOverImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
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
    setCoords(null);
    setImgUrl(null);
  }

  function openCreate(type: Section) {
    setPanel({ type, mode: "create" });
    setForm({ qr_code: "" });
    setCoords(null);
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
        cuadrilla_id: item.cuadrilla_id ?? "",
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
        cuadrilla_id: item.cuadrilla_id ?? "",
        qr_code: item.qr_code ?? "",
      });
    } else {
      setForm({ nombre: item.nombre ?? "", descripcion: item.descripcion ?? "", direccion: item.direccion ?? "", qr_code: item.qr_code ?? "", cuadrilla_id: item.cuadrilla_id ?? "" });
    }
    setCoords(item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null);
    setImgUrl(item.imagen_url ?? null);
  }

  async function handleSave() {
    if (!wsId) return;
    const sb = createClient();
    setSaving(true);
    try {
      const { type, mode, id } = panel!;

      if (type === "sociedades") {
        const payload = { nombre: form.nombre?.trim(), descripcion: form.descripcion?.trim() || null, direccion: form.direccion?.trim() || null, qr_code: form.qr_code?.trim() || null, imagen_url: imgUrl ?? null, lat: coords?.lat ?? null, lng: coords?.lng ?? null, cuadrilla_id: form.cuadrilla_id || null };
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
          cuadrilla_id: form.cuadrilla_id || null,
          sociedad_id: form.sociedad_id || null,
          imagen_url:  imgUrl ?? null,
          qr_code:     form.qr_code?.trim() || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          // 'manual' protege la coordenada: el script de geocodificacion nunca la pisa.
          geo_origen: coords ? "manual" : null,
          geo_actualizado_at: coords ? new Date().toISOString() : null,
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
          cuadrilla_id: form.cuadrilla_id || null,
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
    section === "ubicaciones" ? <Building2 size={38} strokeWidth={1.4} />
    : section === "lugares"   ? <MapPin size={38} strokeWidth={1.4} />
    : <Building2 size={38} strokeWidth={1.4} />;

  const emptyTitle =
    section === "ubicaciones" ? "Todavía no hay ubicaciones"
    : section === "lugares"   ? "Todavía no hay lugares específicos"
    : "Todavía no hay asociaciones";

  // Concordancia de género: "el primero" para lugar, "la primera" para
  // ubicación y asociación. Antes decía "Crea el primero" en los tres.
  const emptyCreateLabel =
    section === "lugares" ? "Crear el primero" : "Crear la primera";

  const emptyDescripcion =
    section === "ubicaciones"
      ? "Una ubicación es el edificio o recinto donde viven los activos, y es lo que después permite agrupar las órdenes por lugar."
      : section === "lugares"
      ? "Un lugar específico precisa dónde está un activo dentro de una ubicación: una sala, un piso, un tablero."
      : "Una asociación es la sociedad o razón social a la que pertenece una ubicación, para separar la operación por empresa.";

  const emptySearchTitle =
    section === "ubicaciones" ? "Ninguna ubicación coincide con la búsqueda"
    : section === "lugares"   ? "Ningún lugar coincide con la búsqueda"
    : "Ninguna asociación coincide con la búsqueda";

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
          {/* Fila superior: buscador + acciones, con las mismas medidas que la
              barra de /ordenes (38 de alto, radio 8, primaria en --brand). */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "9px 20px", minHeight: 56, gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 520px", minWidth: 0, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <div style={{ position: "relative", maxWidth: 280, minWidth: 220, flex: "1 1 220px" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{
                    paddingLeft: 34, paddingRight: search ? 28 : 10,
                    height: 38, width: "100%",
                    border: "1px solid var(--border)", borderRadius: 8,
                    fontSize: 14, fontWeight: 400, color: "var(--fg-1)", background: "var(--surface-1)",
                    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Limpiar búsqueda"
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {canEdit && section === "ubicaciones" && (
                <button
                  type="button"
                  onClick={() => router.push("/ubicaciones/mapa")}
                  style={{
                    flexShrink: 0, height: 38, padding: "0 12px",
                    display: "inline-flex", alignItems: "center", gap: 7,
                    border: "1px solid var(--border)", borderRadius: 8,
                    background: "var(--surface-1)", color: "var(--fg-2)",
                    fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  <MapPin size={16} />
                  Posicionar en mapa
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => openCreate(section)}
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
                  {createLabel}
                </button>
              )}
            </div>
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
            filtered.ubicaciones.length === 0 ? <EmptyState
              icon={emptyIcon}
              title={search ? emptySearchTitle : emptyTitle}
              description={emptyDescripcion}
              onCreate={canEdit ? () => openCreate(section) : undefined}
              createLabel={emptyCreateLabel}
              hasSearch={!!search}
            /> :
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
            filtered.lugares.length === 0 ? <EmptyState
              icon={emptyIcon}
              title={search ? emptySearchTitle : emptyTitle}
              description={emptyDescripcion}
              onCreate={canEdit ? () => openCreate(section) : undefined}
              createLabel={emptyCreateLabel}
              hasSearch={!!search}
            /> :
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
            filtered.sociedades.length === 0 ? <EmptyState
              icon={emptyIcon}
              title={search ? emptySearchTitle : emptyTitle}
              description={emptyDescripcion}
              onCreate={canEdit ? () => openCreate(section) : undefined}
              createLabel={emptyCreateLabel}
              hasSearch={!!search}
            /> :
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
            <div style={{ padding: "14px 16px 20px", textAlign: "center", fontSize: 14, color: "var(--fg-4)" }}>
              {currentList.length} en total
            </div>
          )}
        </div>

      {/* Detalle — siempre presente; con placeholder si no hay seleccion. */}
      {!panel ? (
        <EmptyDetail
          icon={section === "lugares" ? <MapPin size={28} strokeWidth={1.5} /> : <Building2 size={28} strokeWidth={1.5} />}
          title={
            section === "ubicaciones" ? "Selecciona una ubicación"
            : section === "lugares"   ? "Selecciona un lugar"
            : "Selecciona una asociación"
          }
        />
      ) : (
        // Misma estructura que OTDetail: una columna sobre el lienzo
        // (--surface-canvas, el blanco crema) con la cabecera fija arriba y UN
        // solo contenedor con scroll debajo. Antes el detalle era una tarjeta
        // blanca (--surface-1) flotando sobre el lienzo; ahora el crema llega
        // hasta el borde y los bloques se separan con lineas, como en la OT.
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column",
          overflow: "hidden", background: "var(--surface-canvas)",
        }}>
          {/* Cabecera fija — no entra en el scroll, igual que la de OTDetail. */}
          <div style={{
            flexShrink: 0, borderBottom: "1px solid var(--border)",
            background: "var(--surface-canvas)",
            padding: "14px 28px", minHeight: 56,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <span style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panelTitle}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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

          {/* Cuerpo — el unico contenedor con scroll, como en OTDetail. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ padding: "0 28px 76px", display: "flex", flexDirection: "column", gap: 0 }}>
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
                <div style={{
                  marginLeft: -28, marginRight: -28,
                  paddingLeft: 28, paddingRight: 28,
                  paddingTop: 16, paddingBottom: 16,
                  minWidth: 0, overflowX: "hidden",
                }}>
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
            <div style={{ paddingTop: 8 }}>

              {/* Titulo — mismo input grande y subrayado que "Nuevo Activo":
                  el nombre encabeza el formulario en vez de ser un campo mas. */}
              <div style={{ marginBottom: 24 }}>
                <input
                  type="text"
                  placeholder={
                    panel.type === "ubicaciones" ? "Registra el nombre del edificio"
                    : panel.type === "lugares"   ? "Registra el nombre del lugar"
                    : "Registra el nombre de la asociación"
                  }
                  value={form[NOMBRE_KEY[panel.type]] ?? ""}
                  onChange={e => setForm(f => ({ ...f, [NOMBRE_KEY[panel.type]]: e.target.value }))}
                  style={{
                    width: "100%", fontSize: 20, fontWeight: 400, color: "var(--fg-1)",
                    border: "none", outline: "none", background: "transparent", padding: "8px 0",
                    borderBottom: form[NOMBRE_KEY[panel.type]] ? "2px solid var(--brand)" : "2px solid var(--border)",
                    fontFamily: "inherit", transition: "border-color 0.15s",
                  }}
                />
              </div>

              {/* Descripcion — suelta bajo el titulo y sin icono, como en el
                  panel de activos. La sangria de 22 la alinea con el texto de
                  las etiquetas de los FieldRow de mas abajo. */}
              <div style={{ padding: "14px 0", paddingLeft: 22 }}>
                <FieldTextarea
                  value={form.descripcion ?? ""}
                  onChange={v => setForm(f => ({ ...f, descripcion: v }))}
                  placeholder="Añade una descripción"
                />
              </div>

              {/* Imagenes — misma zona de arrastre que el panel de activos:
                  vacia ocupa todo el ancho, y con imagen se encoge a un tile
                  junto a la miniatura. Discontinua sutil, no un bloque de
                  color. */}
              <div style={{ padding: "14px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 8 }}>
                  <span style={{ width: 16, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}><Camera size={16} /></span>
                  Imágenes
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadImg(f, panel.type); e.target.value = ""; }}
                />
                <div style={{ display: "flex", alignItems: "stretch", gap: 10, paddingLeft: 22 }}>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImg}
                    onDragOver={e => { e.preventDefault(); if (!uploadingImg) setDragOverImage(true); }}
                    onDragLeave={() => setDragOverImage(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverImage(false);
                      if (uploadingImg) return;
                      const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
                      if (file) handleUploadImg(file, panel.type);
                    }}
                    style={{
                      flex: imgUrl ? "0 0 132px" : 1,
                      minHeight: imgUrl ? 108 : 96,
                      border: `1px dashed ${dragOverImage ? "var(--brand)" : "var(--border-strong)"}`,
                      borderRadius: "var(--r-md)",
                      background: dragOverImage ? "var(--brand-tint)" : "var(--surface-canvas)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 7, color: "var(--fg-3)", fontSize: 14, fontFamily: "inherit",
                      cursor: uploadingImg ? "default" : "pointer", padding: 12,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    {uploadingImg
                      ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--brand)" }} />
                      : <Camera size={16} style={{ color: "var(--brand)" }} />}
                    <span style={{ textAlign: "center", lineHeight: 1.35 }}>
                      {uploadingImg ? "Subiendo…" : imgUrl ? "Reemplazar" : "Agregue o arrastre imágenes"}
                    </span>
                  </button>

                  {imgUrl && (
                    <div style={{ position: "relative", flex: "0 0 132px", minHeight: 108, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={handleRemoveImg}
                        title="Quitar imagen"
                        aria-label="Quitar imagen"
                        style={{
                          position: "absolute", top: 4, right: 4, width: 22, height: 22,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: "none", borderRadius: "var(--r-sm)",
                          background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", padding: 0,
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Ubicaciones fields */}
              {panel.type === "ubicaciones" && (
                <>
                  <FieldRow icon={<MapPin size={16} />} label="Dirección">
                    <FieldInput value={form.direccion ?? ""} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Ej: Av. Principal 1234" />
                  </FieldRow>
                  <FieldRow icon={<Locate size={16} />} label="Coordenadas">
                    <CampoCoordenadas
                      lat={coords?.lat ?? null}
                      lng={coords?.lng ?? null}
                      onChange={setCoords}
                    />
                  </FieldRow>
                  <FieldRow icon={<Layers size={16} />} label="Piso / Nivel">
                    <FieldInput value={form.detalle ?? ""} onChange={v => setForm(f => ({ ...f, detalle: v }))} placeholder="Ej: 3" />
                  </FieldRow>
                  <FieldRow icon={<Users size={16} />} label="Cuadrilla a cargo">
                    <SearchSelect
                      placeholder="Elegir cuadrilla…"
                      value={form.cuadrilla_id ?? ""}
                      options={cuadrillas.map(c => ({ id: c.id, label: c.nombre }))}
                      onChange={v => setForm(f => ({ ...f, cuadrilla_id: v }))}
                      emptyLabel="Sin cuadrilla"
                    />
                  </FieldRow>
                  <FieldRow icon={<Building2 size={16} />} label="Asociación">
                    <SearchSelect
                      placeholder="Elegir asociación…"
                      value={form.sociedad_id ?? ""}
                      options={sociedades.map(s => ({ id: s.id, label: s.nombre, sub: s.direccion ?? undefined }))}
                      onChange={v => setForm(f => ({ ...f, sociedad_id: v }))}
                      emptyLabel="Sin asociación"
                    />
                  </FieldRow>
                </>
              )}

              {/* Lugares fields */}
              {panel.type === "lugares" && (
                <>
                  <FieldRow icon={<MapPin size={16} />} label="Dirección / Referencia">
                    <FieldInput value={form.direccion ?? ""} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Ej: Subterráneo nivel -2" />
                  </FieldRow>
                  <FieldRow icon={<Users size={16} />} label="Cuadrilla a cargo">
                    <SearchSelect
                      placeholder="Elegir cuadrilla…"
                      value={form.cuadrilla_id ?? ""}
                      options={cuadrillas.map(c => ({ id: c.id, label: c.nombre }))}
                      onChange={v => setForm(f => ({ ...f, cuadrilla_id: v }))}
                      emptyLabel="Sin cuadrilla"
                    />
                  </FieldRow>
                  <FieldRow icon={<Building2 size={16} />} label="Edificio / Ubicación">
                    <SearchSelect
                      placeholder="Elegir ubicación…"
                      value={form.ubicacion_id ?? ""}
                      options={ubicaciones.map(u => ({ id: u.id, label: u.edificio, sub: u.direccion ?? undefined }))}
                      onChange={v => setForm(f => ({ ...f, ubicacion_id: v }))}
                      emptyLabel="Sin ubicación"
                    />
                  </FieldRow>
                </>
              )}

              {/* Sociedades fields */}
              {panel.type === "sociedades" && (
                <>
                  <FieldRow icon={<MapPin size={16} />} label="Dirección">
                    <FieldInput value={form.direccion ?? ""} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Dirección" />
                  </FieldRow>
                  <FieldRow icon={<Users size={16} />} label="Cuadrilla a cargo">
                    <SearchSelect
                      placeholder="Elegir cuadrilla…"
                      value={form.cuadrilla_id ?? ""}
                      options={cuadrillas.map(c => ({ id: c.id, label: c.nombre }))}
                      onChange={v => setForm(f => ({ ...f, cuadrilla_id: v }))}
                      emptyLabel="Sin cuadrilla"
                    />
                  </FieldRow>
                  <FieldRow icon={<Locate size={16} />} label="Coordenadas">
                    <CampoCoordenadas
                      lat={coords?.lat ?? null}
                      lng={coords?.lng ?? null}
                      onChange={setCoords}
                    />
                  </FieldRow>
                </>
              )}

              <FieldRow icon={<QrCode size={16} />} label="Código QR">
                <FieldInput value={form.qr_code ?? ""} onChange={v => setForm(f => ({ ...f, qr_code: v }))} placeholder="Código personalizado (opcional)" />
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--fg-4)" }}>Si lo dejas vacío, Pangui asignará un código automáticamente.</p>
              </FieldRow>

            </div>
            )}
          </div>
          </div>

          {/* Pie — barra fija al fondo del panel, igual que en el panel de
              activos: fuera del contenedor con scroll, asi no se despega ni
              tapa el ultimo campo en formularios largos. */}
          {panel.mode !== "view" && <div style={{
            borderTop: "1px solid var(--border)", padding: "16px 28px",
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
            background: "var(--surface-canvas)", flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => setPanel(null)}
              disabled={saving}
              style={{ height: 40, padding: "0 18px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                height: 40, padding: "0 24px", border: "none", borderRadius: 8,
                background: !canSave ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))",
                color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400,
                cursor: canSave ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit",
                boxShadow: !canSave ? "none" : "0 2px 6px rgba(37,99,235,0.25)",
              }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {panel.mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>}
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
                <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: "0 0 4px" }}>¿Desactivar?</p>
                <p style={{ fontSize: 14, color: "var(--fg-3)", margin: 0 }}>
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
          <strong style={{ fontSize: 14, color: "var(--fg-1)" }}>Código QR</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 8, background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}><X size={17} /></button>
        </div>
        <div style={{ padding: "28px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", padding: 24, borderRadius: 18, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box" }}>
            {dataUrl ? <img src={dataUrl} alt={`Código QR de ${name}`} style={{ width: 260, height: 260, maxWidth: "100%" }} /> : <Loader2 size={28} className="animate-spin" style={{ color: "#666", margin: 116 }} />}
            <h2 style={{ margin: "16px 0 6px", fontSize: 14, color: "#111", textAlign: "center" }}>{name}</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#555", textAlign: "center", wordBreak: "break-all" }}>{code}</p>
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

  // Coordenada: se muestra en la vista de detalle para confirmar que quedó guardada.
  const coordTexto = item.lat != null && item.lng != null
    ? `${Number(item.lat).toFixed(6)}, ${Number(item.lng).toFixed(6)}`
    : null;

  const fields = type === "ubicaciones" ? [
    ["Dirección", item.direccion], ["Coordenadas", coordTexto], ["Descripción", item.descripcion],
    ["Piso / Nivel", item.detalle],
    ["Cuadrilla a cargo", item.cuadrilla_nombre ?? item.grupo_cargo],
  ] : type === "lugares" ? [
    ["Ubicación", item.ubicacion_edificio], ["Dirección", item.direccion],
    ["Descripción", item.descripcion], ["Cuadrilla a cargo", item.cuadrilla_nombre ?? item.grupo_cargo],
  ] : [
    ["Dirección", item.direccion], ["Coordenadas", coordTexto], ["Descripción", item.descripcion],
    ["Cuadrilla a cargo", item.cuadrilla_nombre ?? item.grupo_cargo],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Sin tarjeta ni titulo propios: el nombre ya esta en el encabezado del
          panel y los separadores los pone cada DetailGroup. */}
      {(item.imagen_url || fields.some(([, value]) => value)) && (
        <div style={{
          marginLeft: -28, marginRight: -28,
          paddingLeft: 28, paddingRight: 28,
          paddingTop: 16, paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}>
          {item.imagen_url && (
            <img
              src={item.imagen_url}
              alt={name}
              style={{ width: "100%", height: 190, display: "block", objectFit: "contain", background: "var(--surface-2)", borderRadius: "var(--r-md)", marginBottom: 14 }}
            />
          )}
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0" }}>
              <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)" }}>{label}</span>
              <span style={{ fontSize: 14, color: "var(--fg-3)", textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Primer grupo: sin linea arriba. El bloque de imagen/campos ya se
          separa por el `gap` del contenedor. */}
      <DetailGroup title="Código QR">
        <DetailLink
          first
          name={qrValue}
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
const DETAIL_GROUP_MAX = 4;

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  // `Children.toArray` descarta los huecos (null/false) y renumera las keys,
  // asi que el corte cuenta filas reales y no posiciones del array original.
  const items = Children.toArray(children);
  const hidden = Math.max(0, items.length - DETAIL_GROUP_MAX);
  const shown = expanded ? items : items.slice(0, DETAIL_GROUP_MAX);

  return (
    <section style={{
      // Mismo ritmo que las secciones de OTDetail: 16 arriba y abajo, y la
      // linea separadora sale a los bordes del panel con el par -28/+28 (el
      // cuerpo tiene 28 de padding lateral, asi que sin esto la regla se
      // quedaba corta por los dos lados).
      marginLeft: -28, marginRight: -28,
      paddingLeft: 28, paddingRight: 28,
      paddingTop: 16, paddingBottom: 16,
      borderBottom: "1px solid var(--border)",
    }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{title}</h3>
      <div>{shown}</div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            marginTop: 8, padding: 0, border: "none", background: "none",
            color: "var(--brand)", fontSize: 14, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          {expanded ? <Minus size={14} /> : <Plus size={14} />}
          {expanded ? "Ver menos" : `Ver más (${hidden})`}
        </button>
      )}
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
          style={{ width: 28, height: 28, objectFit: "cover", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, flexShrink: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          // Mismo lenguaje que los chips de seccion de OTDetail: tarjeta blanca
          // con borde fino y el icono SIEMPRE en el azul de marca solido. El
          // relleno tintado de antes apagaba el icono.
          background: "var(--surface-1)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)", color: "var(--brand)",
        }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {sub && <div style={{ fontSize: 14, color: "var(--fg-4)", marginTop: 1 }}>{sub}</div>}
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
        boxSizing: "border-box",
        // Mismas tarjetas que OTRow: sobre el lienzo, con su propio borde y una
        // barra de acento de 3px al seleccionar. El borde se queda en 1px para
        // que el contenido no se corra de lado al elegir una fila.
        background: selected ? "var(--row-selected)" : "var(--surface-1)",
        border: `1px solid ${selected ? "var(--brand)" : hover ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        boxShadow: selected ? "inset 3px 0 0 0 var(--brand)" : "none",
        transition: "border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)",
      }}
    >
      <Avatar src={img} name={name} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
        {sub && <p style={{ fontSize: 14, color: "var(--fg-4)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
      </div>
    </div>
  );
}

