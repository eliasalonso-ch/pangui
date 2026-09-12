"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  Box, Boxes, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Search, Trash2, X,
  Building2, User, MapPin, Calendar, Hash, GitBranch, FileText, Pencil,
  Maximize2, Inbox, Clock, Link2, CheckCircle2, RefreshCw, PlusCircle, ArrowDown,
  Check, Camera, Paperclip, File as FileIcon, Tag, Factory, Truck, AlertCircle, DollarSign,
  MoreVertical, Locate, Users, Gauge, Wifi,
} from "lucide-react";
import {
  ACTIVO_SELECT, createActivo, deleteActivo, updateActivo, fetchActivo,
  fetchActivoOTHistoryPage, fetchActivoActividadPage,
  createFabricante, createModelo, createProveedor,
  type ActivoOTHistoryRow, type ActivoActividadRow,
} from "@/lib/activos-api";
import AuditFooter from "@/components/catalogo/AuditFooter";
import SearchSelect from "@/components/activos/SearchSelect";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { cambiarEstadoActivo, fetchPeriodoVigente, type EstadoPeriodo } from "@/lib/activo-estado-api";
import {
  fetchMedidoresDeActivo, nivelDeLectura,
  type MedidorConUltima, type NivelLectura,
} from "@/lib/medidores-api";
import NuevoMedidorDialog from "@/components/activos/NuevoMedidorDialog";
import { uploadToR2 } from "@/lib/r2";
import { createClient, logRealtimeChannel } from "@/lib/supabase";
import type {
  Activo, AssetAttachment, AssetCriticality, AssetStatus, Fabricante, LugarEspecifico,
  Modelo, Proveedor, Sociedad, Ubicacion, Usuario,
} from "@/types/ordenes";

/** Repuestos que se muestran de una vez en la ficha del activo. */
const PARTES_CHUNK = 4;

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
  // Naranja pleno y no `--warning`: ese token vale #B26A00 en modo claro —un
  // ambar oscuro calculado para texto— y como relleno de un punto se ve marron.
  mantencion: "#F59E0B",
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

// `baja` NO se ofrece: retirar un activo ya es la acción "Eliminar" del menú ⋮
// (pone activos.activo = false, y el log lo registra como "Activo dado de
// baja"). Tener además un estado con el mismo significado dejaba dos caminos
// para lo mismo, que se contradicen entre sí. El valor sigue siendo válido en
// la base para no invalidar filas viejas; simplemente no se puede elegir.
const ESTADO_OPCIONES: AssetStatus[] = ["operativo", "mantencion", "fuera_servicio"];

type ActivoTab = "general" | "detalles" | "historial";

/**
 * Secciones de la ficha de activo. Espeja `dashboardNav` de OTDetail: la barra
 * es solo de iconos, así que el nombre viaja en `label` para el title y el
 * aria-label — sin eso la barra es inaccesible y no se puede leer al pasar.
 */
const ACTIVO_NAV: { tab: ActivoTab; label: string; icon: React.ElementType }[] = [
  { tab: "general",   label: "General",   icon: Box },
  { tab: "detalles",  label: "Detalles",  icon: FileText },
  { tab: "historial", label: "Historial", icon: Clock },
];
const ACTIVIDAD_PAGE_SIZE = 20;
const OT_PAGE_SIZE = 20;

type CritFilter = AssetCriticality | "all";

type ActivoSortOption =
  | "nombre_asc" | "nombre_desc"
  | "creacion_asc" | "creacion_desc"
  | "estado_asc" | "estado_desc"
  | "criticidad_desc" | "criticidad_asc";

/** Menu de orden agrupado por campo, igual que el de materiales: el grupo se
 *  despliega y dentro van las dos direcciones. Una lista plana de ocho
 *  opciones obliga a leerlas todas para encontrar la que se busca. */
const ACTIVO_SORT_GROUPS: { label: string; options: { value: ActivoSortOption; label: string }[] }[] = [
  { label: "Nombre", options: [
    { value: "nombre_asc",  label: "Orden ascendente" },
    { value: "nombre_desc", label: "Orden descendente" },
  ] },
  { label: "Fecha de creación", options: [
    { value: "creacion_asc",  label: "Más antiguo primero" },
    { value: "creacion_desc", label: "Más nuevo primero" },
  ] },
  { label: "Estado", options: [
    { value: "estado_asc",  label: "Orden ascendente" },
    { value: "estado_desc", label: "Orden descendente" },
  ] },
  { label: "Criticidad", options: [
    { value: "criticidad_desc", label: "Más alta primero" },
    { value: "criticidad_asc",  label: "Más baja primero" },
  ] },
];

function activoSortLabel(value: ActivoSortOption): string {
  for (const group of ACTIVO_SORT_GROUPS) {
    const found = group.options.find(o => o.value === value);
    if (found) return `${group.label}: ${found.label}`;
  }
  return "";
}

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
  materiales: MaterialOpcion[];
  cuadrillas: CuadrillaOpcion[];
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
    {/* Mismas medidas que los chips de FilterBar en /ordenes: 34 de alto,
        radio --r-sm y 14px normal. Antes medía 28 y se veía como otro
        componente al lado de la misma barra en la pantalla vecina. */}
    <button ref={buttonRef} type="button" onClick={toggleMenu} style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 11px", border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)", borderRadius: "var(--r-sm)", background: active ? "var(--brand-tint)" : "var(--surface-1)", color: active ? "var(--brand)" : "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {/* El ícono va siempre en azul de marca, también con el chip inactivo:
          es lo que identifica al filtro de un vistazo. */}
      <span style={{ display: "flex", color: "var(--brand)" }}>{icon}</span>
      {label}
    </button>
    {open && createPortal(<div ref={menuRef} style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, zIndex: 10000, minWidth: 220, padding: 6, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-md)" }}>{children}</div>, document.body)}
  </div>;
}

// 14px en peso normal, como el resto de la app: el `500 12px` de antes era el
// único texto de ese tamaño en toda la pantalla.
/**
 * Chip de filtro sobre un catalogo: "Todas" mas una opcion por fila. Existe
 * para no repetir el mismo bloque en cada filtro — con seis chips el markup
 * inline se volvia imposible de leer.
 */
/** Cuantas opciones se pintan de entrada y cuantas suma cada tanda al bajar. */
const CATALOGO_TANDA = 30;

/**
 * Chip de filtro sobre un catalogo: buscador arriba y la lista debajo.
 *
 * Dos cosas que no son decorativas:
 *
 * 1. **Buscador.** Con decenas de ubicaciones o responsables, encontrar uno
 *    desplazando es peor que escribir tres letras. Mismo comportamiento que los
 *    filtros de /ordenes.
 *
 * 2. **Carga incremental.** Se pintan `CATALOGO_TANDA` filas y se agregan mas al
 *    llegar al final del scroll. Antes se montaban TODAS de una: con un catalogo
 *    grande son cientos de nodos por menu, y se pagan aunque el usuario escriba
 *    dos letras y elija la primera opcion.
 */
function CatalogFilter({ label, icon, value, onChange, options, allLabel = "Todas", searchPlaceholder }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; nombre: string; count?: number }[];
  allLabel?: string;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const [visibles, setVisibles] = useState(CATALOGO_TANDA);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter(o => o.nombre.toLowerCase().includes(t)) : options;
  }, [options, q]);

  /**
   * Buscar tambien reinicia el paginado, y se hace en el mismo set: escribir es
   * volver a la primera tanda. Con un efecto aparte seria un render en cascada,
   * y ademas un termino con pocos resultados heredaria el "ya mostre 90" de la
   * busqueda anterior.
   */
  function buscar(texto: string) {
    setQ(texto);
    setVisibles(CATALOGO_TANDA);
  }

  const mostradas = filtradas.slice(0, visibles);
  const hayMas = filtradas.length > mostradas.length;

  return (
    <AssetFilterDropdown label={label} icon={icon} active={value !== "all"}>
      {/* El buscador solo aparece cuando hay suficientes opciones para que
          desplazarse moleste; con cuatro filas es ruido. */}
      {options.length > 8 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
          <Search size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
          <input
            autoFocus
            value={q}
            onChange={e => buscar(e.target.value)}
            placeholder={searchPlaceholder ?? `Buscar ${label.toLowerCase()}…`}
            style={{ flex: 1, minWidth: 0, height: 28, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit" }}
          />
          {q && (
            <button type="button" onClick={() => buscar("")} aria-label="Limpiar búsqueda"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>
      )}

      <div
        style={{ maxHeight: 320, overflowY: "auto" }}
        onScroll={e => {
          if (!hayMas) return;
          const el = e.currentTarget;
          // 48px de margen: la tanda siguiente se pide justo antes de tocar el
          // fondo, para que no se vea el salto.
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
            setVisibles(v => v + CATALOGO_TANDA);
          }
        }}
      >
        {/* "Todas" solo con la busqueda vacia: con un termino escrito es una
            fila que no coincide con lo buscado. */}
        {!q && (
          <button
            type="button"
            onClick={() => onChange("all")}
            style={{ ...assetFilterOptionStyle, background: value === "all" ? "var(--brand-tint)" : "transparent", color: value === "all" ? "var(--brand-fg)" : "var(--fg-2)" }}
          >
            {allLabel}
          </button>
        )}
        {mostradas.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{ ...assetFilterOptionStyle, background: value === o.id ? "var(--brand-tint)" : "transparent", color: value === o.id ? "var(--brand-fg)" : "var(--fg-2)" }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre}</span>
            {o.count !== undefined && <span style={{ color: "var(--fg-4)", marginLeft: 8 }}>{o.count}</span>}
          </button>
        ))}
        {filtradas.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
        )}
        {hayMas && (
          <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>
            {filtradas.length - mostradas.length} más…
          </div>
        )}
      </div>
    </AssetFilterDropdown>
  );
}

const assetFilterOptionStyle: React.CSSProperties = { display: "flex", alignItems: "center", width: "100%", minHeight: 34, padding: "0 10px", border: 0, borderRadius: 6, background: "transparent", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, fontFamily: "inherit", textAlign: "left", cursor: "pointer" };

/**
 * Icono solido: el color va en el trazo del icono, no en el texto ni en el
 * fondo. Copiado de OTRow para que las etiquetas de las dos listas sean
 * indistinguibles.
 */
function SolidIcon({ icon: Icon, color, size = 14 }: { icon: React.ElementType; color: string; size?: number }) {
  return <Icon size={size} color={color} strokeWidth={2.25} style={{ display: "block", flexShrink: 0 }} />;
}

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  ícono sólido como único portador del color. Misma que RowBadge en OTRow. */
function RowBadge({ icon: Icon, iconColor, dotColor, children }: {
  icon?: React.ElementType;
  iconColor?: string;
  /** Alternativa al icono: un punto de color, para estados. */
  dotColor?: string;
  children: React.ReactNode;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 14, fontWeight: 400,
      padding: "0 8px", minHeight: 22,
      border: "1px solid var(--border)",
      borderRadius: "var(--r-sm)",
      color: "var(--fg-1)",
      background: "var(--surface-1)",
      whiteSpace: "nowrap",
    }}>
      {dotColor && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
      {Icon && <SolidIcon icon={Icon} color={iconColor ?? "var(--fg-3)"} />}
      {children}
    </span>
  );
}

/**
 * Tarjeta de activo. Copia el lenguaje de OTRow: altura fija, miniatura a la
 * altura del bloque de texto y etiquetas con fondo blanco y borde gris —el
 * color solo en el icono—, en vez del punto de color suelto que tenía antes.
 */
function ActivoRow({ activo, selected, onClick }: { activo: Activo; selected: boolean; onClick: () => void }) {
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const critCfg = CRITICIDAD_COLOR[crit];
  const location = ubicacionLabel(activo);
  const estado = (activo.estado ?? "operativo") as AssetStatus;

  return (
    <button
      onClick={onClick}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "var(--surface-1)"; }}
      style={{
        width: "100%",
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "14px 20px",
        // Altura fija, como en OTRow: todas las tarjetas miden lo mismo aunque
        // el nombre o la ubicación cambien de largo. Bajó de 108 al pasar la
        // miniatura de 76 a 32px.
        height: 88,
        flexShrink: 0,
        boxSizing: "border-box",
        border: `1px solid ${selected ? "var(--brand)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        background: selected ? "var(--row-selected)" : "var(--surface-1)",
        // La selección se marca con un acento de 3px por dentro: el borde sigue
        // midiendo 1px, así que el contenido no se corre al seleccionar.
        boxShadow: selected ? "inset 3px 0 0 0 var(--brand)" : "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background var(--dur-fast) var(--ease)",
      }}
    >
      {/* Miniatura de 32px, la misma que proveedores y órdenes de compra.
          Antes ocupaba 76px al alto del texto: al bajarla la tarjeta también
          bajó de 108 a 76px, porque si no quedaba puro aire. */}
      {activo.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={activo.imagen_url} alt="" style={{ width: 32, height: 32, borderRadius: "var(--r-md)", objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0 }} />
      ) : (
        <span style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--brand-tint)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", flexShrink: 0 }}>
          <Box size={16} />
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 400, lineHeight: 1.35, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activo.nombre}
        </span>
        {/* Solo la ubicación: el n° de serie es un dato de ficha, no algo que
            se lea de un vistazo en la lista. Vive en el panel de detalle. */}
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, color: "var(--fg-3)", overflow: "hidden", whiteSpace: "nowrap" }}>
          <MapPin size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {location || "Sin ubicación"}
          </span>
        </span>
        {/* `nowrap` + `overflow: hidden`: si las etiquetas se envolvieran, la
            tarjeta crecería y se rompería la altura uniforme. */}
        <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", overflow: "hidden" }}>
          <RowBadge dotColor={ESTADO_COLOR[estado]}>
            {estadoLabel(activo.estado)}
          </RowBadge>
          <RowBadge icon={AlertCircle} iconColor={critCfg.color}>
            {CRITICIDAD_LABEL[crit]}
          </RowBadge>
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

// SearchSelect vive ahora en components/activos/SearchSelect.tsx: lo comparte
// el diálogo de cambio de estado para elegir el motivo de una parada.

/**
 * Cuadrillas a cargo de un activo. Igual que MaterialPicker (fichas + lista
 * desplegable), porque un equipo puede necesitar varios oficios a la vez.
 */
function CuadrillaPicker({ cuadrillas, selected, onToggle, disabled }: {
  cuadrillas: { id: string; nombre: string; icono?: string | null; color?: string | null }[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = cuadrillas.filter(c => !q || c.nombre.toLowerCase().includes(q));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => { if (!disabled) setOpen(true); }}
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4,
          minHeight: 40, padding: "4px 8px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8, background: "var(--surface-1)",
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {selected.map(id => {
          const c = cuadrillas.find(x => x.id === id);
          return (
            <span
              key={id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 260,
                padding: "2px 4px 2px 7px", borderRadius: 4,
                background: "var(--brand-tint)", color: "var(--brand)", fontSize: 14,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c?.nombre ?? "Cuadrilla"}
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onToggle(id); }}
                aria-label={`Quitar ${c?.nombre ?? "cuadrilla"}`}
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.7 }}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          disabled={disabled}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          placeholder={selected.length ? "" : "Empiece a escribir…"}
          style={{ flex: 1, minWidth: 110, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit", height: 30 }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={e => { e.stopPropagation(); if (!disabled) setOpen(v => !v); }}
          aria-label={open ? "Cerrar lista" : "Abrir lista"}
          style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 2, cursor: "pointer", flexShrink: 0 }}
        >
          <ChevronDown size={16} color="var(--brand-fg)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
      </div>

      {open && !disabled && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "2px 0 6px" }}>
            {shown.map(c => {
              const active = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => onToggle(c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0,
                    padding: "8px 12px", background: active ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Color e icono propios de la cuadrilla: es lo que la
                      distingue de un vistazo, igual que en /usuarios. */}
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: c.color ?? "var(--brand)", color: "#fff",
                  }}>
                    <Users size={15} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: active ? "var(--brand)" : "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.nombre}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 15, height: 15, flexShrink: 0, borderRadius: 3,
                      border: active ? "none" : "1.5px solid var(--border-strong, var(--border))",
                      background: active ? "var(--brand)" : "var(--surface-0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {active && <Check size={11} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>
                {cuadrillas.length === 0 ? "No hay cuadrillas creadas" : "Sin resultados"}
              </div>
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
];

const CRITICIDAD_FORM_OPTIONS: { value: AssetCriticality; label: string }[] = [
  { value: "critico", label: "Crítico" },
  { value: "semi_critico", label: "Semi-crítico" },
  { value: "no_critico", label: "No crítico" },
];

/** Material del catalogo, para el selector de repuestos. */
interface MaterialOpcion {
  id: string; nombre: string; codigo: string; unidad: string; imagen_url: string | null;
}

/** Cuadrilla del workspace, para el selector "Cuadrillas a cargo". */
interface CuadrillaOpcion {
  id: string; nombre: string; icono: string | null; color: string | null;
}

/** Selector de materiales: buscador con los elegidos como fichas adentro y un
 *  desplegable con casillas. Mismo patron que el selector de activos en la
 *  ficha del material -- ver lo seleccionado sin cerrar el panel evita el
 *  problema del contador solo ("3" no dice *cuales* tres). */
function MaterialPicker({ materiales, selected, onToggle, disabled }: {
  materiales: MaterialOpcion[];
  selected: { material_id: string; cantidad: number; existingId?: string }[];
  onToggle: (materialId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = materiales.filter(m =>
    !q || m.nombre.toLowerCase().includes(q) || m.codigo.toLowerCase().includes(q));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => { if (!disabled) setOpen(true); }}
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4,
          minHeight: 40, padding: "4px 8px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8, background: "var(--surface-1)",
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {selected.map(sel => {
          const material = materiales.find(m => m.id === sel.material_id);
          return (
            <span
              key={sel.material_id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 260,
                padding: "2px 4px 2px 7px", borderRadius: 4,
                background: "var(--brand-tint)", color: "var(--brand)", fontSize: 14,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {material?.nombre ?? "Material"}
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onToggle(sel.material_id); }}
                aria-label={`Quitar ${material?.nombre ?? "material"}`}
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.7 }}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          disabled={disabled}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          placeholder={selected.length ? "" : "Empiece a escribir…"}
          style={{ flex: 1, minWidth: 110, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit", height: 30 }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={e => { e.stopPropagation(); if (!disabled) setOpen(v => !v); }}
          aria-label={open ? "Cerrar lista" : "Abrir lista"}
          style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 2, cursor: "pointer", flexShrink: 0 }}
        >
          <ChevronDown size={16} color="var(--brand-fg)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "2px 0 6px" }}>
            {shown.map(m => {
              const active = selected.some(sel => sel.material_id === m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => onToggle(m.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0,
                    padding: "8px 12px", background: active ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  {m.imagen_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.imagen_url} alt="" style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", objectFit: "cover", flexShrink: 0 }} />
                    : <span style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Boxes size={15} /></span>}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: active ? "var(--brand)" : "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.nombre}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 15, height: 15, flexShrink: 0, borderRadius: 3,
                      border: active ? "none" : "1.5px solid var(--border-strong, var(--border))",
                      background: active ? "var(--brand)" : "var(--surface-0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {active && <Check size={11} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivoForm({
  activo, padreInicial, usuarios, ubicaciones, lugares, sociedades, fabricantes, modelos, proveedores,
  activos, materiales, cuadrillas, wsId, onSaved, onClose,
  onFabricanteCreado, onModeloCreado, onProveedorCreado,
}: {
  activo?: Activo | null;
  /** Alta de un sub-activo: el padre viene elegido desde la ficha. */
  padreInicial?: string | null;
  materiales: MaterialOpcion[];
  cuadrillas: CuadrillaOpcion[];
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
  onFabricanteCreado: (f: Fabricante) => void;
  onModeloCreado: (m: Modelo) => void;
  onProveedorCreado: (p: Proveedor) => void;
}) {
  const [form, setForm] = useState({
    nombre: activo?.nombre ?? "",
    descripcion: activo?.descripcion ?? "",
    numero_serie: activo?.numero_serie ?? "",
    año_fabricacion: activo?.año_fabricacion ? String(activo.año_fabricacion) : "",
    costo_hora_parada: activo?.costo_hora_parada != null ? String(activo.costo_hora_parada) : "",
    criticidad: (activo?.criticidad ?? "no_critico") as AssetCriticality,
    estado: (activo?.estado ?? "operativo") as AssetStatus,
    fabricante_id: activo?.fabricante_id ?? "",
    modelo_id: activo?.modelo_id ?? "",
    ubicacion_id: activo?.ubicacion_id ?? "",
    lugar_id: activo?.lugar_id ?? "",
    sociedad_id: activo?.sociedad_id ?? "",
    responsable_id: activo?.responsable_id ?? "",
    proveedor_id: activo?.proveedor_id ?? "",
    activo_padre_id: activo?.activo_padre_id ?? padreInicial ?? "",
  });
  const [imagenUrl, setImagenUrl] = useState<string | null>(activo?.imagen_url ?? null);
  const [adjuntos, setAdjuntos] = useState<AssetAttachment[]>(
    Array.isArray(activo?.adjuntos) ? activo!.adjuntos! : [],
  );
  /**
   * Repuestos vinculados, editados como borrador y confirmados al guardar.
   *
   * `activo_materiales` es una tabla aparte, asi que se calcula el diff contra
   * lo que habia: se insertan los nuevos y se borran los quitados. Escribir en
   * cada clic dejaria vinculos creados aunque el usuario cancelara el formulario.
   */
  const [materialLinks, setMaterialLinks] = useState<{ material_id: string; cantidad: number; existingId?: string }[]>(
    () => (activo?.materiales ?? []).map(m => ({ material_id: m.material_id, cantidad: Number(m.cantidad_recomendada), existingId: m.id })),
  );
  /**
   * Cuadrillas a cargo, como borrador igual que los repuestos: el diff contra
   * lo que habia se aplica al guardar, no en cada clic.
   */
  const [cuadrillaIds, setCuadrillaIds] = useState<string[]>(
    () => (activo?.cuadrillas ?? []).map(c => c.cuadrilla_id),
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOverImage, setDragOverImage] = useState(false);
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
  /**
   * Candidatos a activo padre: todos menos este y su propia descendencia.
   *
   * Excluir solo el activo mismo no alcanza. Si A es padre de B, ofrecer B como
   * padre de A cierra un círculo: el recorrido de la jerarquía no termina nunca.
   * La base lo rechaza (trg_validar_activo_padre), pero llegar hasta allá
   * significa mostrarle al usuario un error de Postgres; mejor no ofrecerlo.
   */
  const parentOptions = (() => {
    const descendientes = new Set<string>();
    if (activo?.id) {
      const pendientes = [activo.id];
      while (pendientes.length > 0) {
        const actual = pendientes.pop()!;
        for (const a of activos) {
          if (a.activo_padre_id === actual && !descendientes.has(a.id)) {
            descendientes.add(a.id);
            pendientes.push(a.id);
          }
        }
      }
    }
    return activos
      .filter(a => a.id !== activo?.id && !descendientes.has(a.id))
      .map(a => ({ id: a.id, label: a.nombre + (a.numero_serie ? ` (${a.numero_serie})` : "") }));
  })();

  async function uploadImagen(file: File) {
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

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadImagen(file);
  }

  // El drop y el selector comparten `uploadImagen`. Solo se toma el primer
  // archivo: `imagen_url` guarda una sola imagen.
  async function handleDropImage(e: React.DragEvent) {
    e.preventDefault();
    setDragOverImage(false);
    if (uploadingImage) return;
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
    if (file) await uploadImagen(file);
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
        costo_hora_parada: form.costo_hora_parada.trim() ? Number(form.costo_hora_parada.trim()) : null,
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

      // Repuestos: se insertan los anadidos y se borran los quitados.
      const previos = activo?.materiales ?? [];
      const quitados = previos.filter(prev => !materialLinks.some(l => l.existingId === prev.id));
      const anadidos = materialLinks.filter(l => !l.existingId);
      if (quitados.length > 0 || anadidos.length > 0) {
        const sb = createClient();
        if (quitados.length > 0) {
          const { error: delError } = await sb.from("activo_materiales").delete().in("id", quitados.map(l => l.id));
          if (delError) throw new Error(delError.message);
        }
        if (anadidos.length > 0) {
          const { error: insError } = await sb.from("activo_materiales").insert(
            anadidos.map(l => ({ activo_id: saved.id, material_id: l.material_id, cantidad_recomendada: l.cantidad })),
          );
          if (insError) throw new Error(insError.message);
        }
      }

      // Cuadrillas a cargo: se borran las quitadas y se insertan las nuevas.
      // La PK es (activo_id, cuadrilla_id), asi que no hay ids intermedios.
      const previasC = (activo?.cuadrillas ?? []).map(c => c.cuadrilla_id);
      const quitadasC = previasC.filter(id => !cuadrillaIds.includes(id));
      const anadidasC = cuadrillaIds.filter(id => !previasC.includes(id));
      if (quitadasC.length > 0 || anadidasC.length > 0) {
        const sb = createClient();
        if (quitadasC.length > 0) {
          const { error: delC } = await sb.from("activo_cuadrillas")
            .delete().eq("activo_id", saved.id).in("cuadrilla_id", quitadasC);
          if (delC) throw new Error(delC.message);
        }
        if (anadidasC.length > 0) {
          const { error: insC } = await sb.from("activo_cuadrillas").insert(
            anadidasC.map(cid => ({ activo_id: saved.id, cuadrilla_id: cid })),
          );
          if (insC) throw new Error(insC.message);
        }
      }

      // Se relee: `saved` es de antes de escribir `activo_materiales` y
      // `activo_cuadrillas`, asi que sus vinculos estan desactualizados. Sin
      // esto, una cuadrilla recien asignada se ve como "Sin cuadrilla" hasta
      // recargar la pagina.
      const conVinculos = (quitados.length > 0 || anadidos.length > 0 || quitadasC.length > 0 || anadidasC.length > 0)
        ? await fetchActivo(saved.id).catch(() => saved)
        : saved;

      onSaved(conVinculos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
      setSaving(false);
    }
  }

  const canSave = form.nombre.trim().length > 0 && !saving;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
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
                width: "100%", fontSize: 20, fontWeight: 400, color: "var(--fg-1)",
                border: "none", outline: "none", background: "transparent", padding: "8px 0",
                borderBottom: form.nombre ? "2px solid var(--brand)" : "2px solid var(--border)",
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
            />
          </div>

          {/* Description */}
          <div style={{ padding: "14px 0", paddingLeft: 22 }}>
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

          {/* Imágenes — zona de arrastre. Vacía ocupa todo el ancho; con imagen
              se encoge a un tile junto a la miniatura, que se puede reemplazar
              soltando otra encima. Paleta igual a "Álbumes de fotos" en la
              creación de OT: discontinua sutil, no un bloque de color. */}
          <div style={{ padding: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 8 }}>
              <span style={{ width: 16, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}><Camera size={16} /></span>
              Imágenes
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, paddingLeft: 22 }}>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                onDragOver={e => { e.preventDefault(); if (!uploadingImage) setDragOverImage(true); }}
                onDragLeave={() => setDragOverImage(false)}
                onDrop={handleDropImage}
                style={{
                  // Sin imagen se estira; con imagen queda del ancho de la miniatura.
                  flex: imagenUrl ? "0 0 132px" : 1,
                  minHeight: imagenUrl ? 108 : 96,
                  border: `1px dashed ${dragOverImage ? "var(--brand)" : "var(--border-strong)"}`,
                  borderRadius: "var(--r-md)",
                  background: dragOverImage ? "var(--brand-tint)" : "var(--surface-canvas)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 7, color: "var(--fg-3)", fontSize: 14, fontFamily: "inherit",
                  cursor: uploadingImage ? "default" : "pointer", padding: 12,
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {uploadingImage
                  ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--brand)" }} />
                  : <Camera size={16} style={{ color: "var(--brand)" }} />}
                <span style={{ textAlign: "center", lineHeight: 1.35 }}>
                  {uploadingImage ? "Subiendo…" : imagenUrl ? "Reemplazar" : "Agregue o arrastre imágenes"}
                </span>
              </button>

              {imagenUrl && (
                <div style={{ position: "relative", flex: "0 0 132px", minHeight: 108, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagenUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button
                    type="button"
                    onClick={() => setImagenUrl(null)}
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

          <FieldRow icon={<Hash size={16} />} label="N° de serie">
            <input
              type="text"
              placeholder="Introduce el número de serie"
              value={form.numero_serie}
              onChange={e => set("numero_serie", e.target.value)}
              style={{ ...otInputStyle, fontFamily: "monospace" }}
            />
          </FieldRow>

          <FieldRow icon={<RefreshCw size={16} />} label="Estado">
            <select value={form.estado} onChange={e => set("estado", e.target.value as AssetStatus)}
              style={otInputStyle}>
              {ESTADO_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>

          <FieldRow icon={<AlertCircle size={16} />} label="Criticidad">
            <select value={form.criticidad} onChange={e => set("criticidad", e.target.value as AssetCriticality)}
              style={otInputStyle}>
              {CRITICIDAD_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>

          <FieldRow icon={<Factory size={16} />} label="Fabricante">
            <SearchSelect
              placeholder="Elegir fabricante…"
              value={form.fabricante_id}
              options={fabricanteOptions}
              onChange={v => set("fabricante_id", v)}
              createLabel="Crear fabricante"
              onCreate={async nombre => {
                const nuevo = await createFabricante(wsId, nombre);
                onFabricanteCreado(nuevo);
                return nuevo.id;
              }}
            />
          </FieldRow>

          <FieldRow icon={<Tag size={16} />} label="Modelo">
            <SearchSelect
              placeholder={form.fabricante_id ? "Elegir modelo…" : "Elige fabricante primero"}
              value={form.modelo_id}
              options={modeloOptions}
              onChange={v => set("modelo_id", v)}
              disabled={!form.fabricante_id}
              createLabel="Crear modelo"
              // Un modelo cuelga de un fabricante, y el campo esta deshabilitado
              // hasta que haya uno, asi que aca form.fabricante_id nunca es "".
              onCreate={async nombre => {
                const nuevo = await createModelo(wsId, form.fabricante_id, nombre);
                onModeloCreado(nuevo);
                return nuevo.id;
              }}
            />
          </FieldRow>

          <FieldRow icon={<Calendar size={16} />} label="Año">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 2022"
              value={form.año_fabricacion}
              onChange={e => set("año_fabricacion", e.target.value.replace(/[^0-9]/g, ""))}
              style={otInputStyle}
            />
          </FieldRow>

          {/* Lo que cuesta una hora con este equipo detenido.
              Es el dato que convierte "47 horas de parada" en un monto, que es
              la única forma de que la analítica sirva para pedir presupuesto.
              No se puede derivar: depende de la línea, del turno y del precio
              del producto, así que lo carga el cliente. Si queda vacío, los
              informes muestran las horas sin convertir en vez de inventar. */}
          <FieldRow icon={<DollarSign size={16} />} label="Costo por hora detenido">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 850000"
              value={form.costo_hora_parada}
              onChange={e => set("costo_hora_parada", e.target.value.replace(/[^0-9]/g, ""))}
              style={otInputStyle}
            />
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
              Producción perdida por hora. Alimenta el costo de las paradas en Analítica.
            </p>
          </FieldRow>

          <FieldRow icon={<Building2 size={16} />} label="Cliente">
            <SearchSelect placeholder="Elegir cliente…" value={form.sociedad_id} options={sociedadOptions} onChange={v => set("sociedad_id", v)} emptyLabel="Sin cliente" />
          </FieldRow>

          <FieldRow icon={<MapPin size={16} />} label="Ubicación">
            <SearchSelect placeholder="Elegir ubicación…" value={form.ubicacion_id} options={ubicOptions} onChange={v => set("ubicacion_id", v)} emptyLabel="Sin ubicación" />
          </FieldRow>

          <FieldRow icon={<Locate size={16} />} label="Lugar">
            <SearchSelect
              placeholder={form.ubicacion_id ? "Elegir lugar…" : "Elige ubicación primero"}
              value={form.lugar_id}
              options={lugarOptions}
              onChange={v => set("lugar_id", v)}
              disabled={!form.ubicacion_id}
              emptyLabel="Sin lugar"
            />
          </FieldRow>

          {/* Responsable y Cuadrillas a cargo se excluyen: el activo lo cuida
              UNA persona o UN grupo, no las dos cosas — si no, no se sabe a
              quien reclamarle. La exclusion va en los dos sentidos para poder
              cambiar de idea sin tener que vaciar el otro campo primero. */}
          <FieldRow icon={<User size={16} />} label="Responsable">
            <SearchSelect
              placeholder="Elegir responsable…"
              value={form.responsable_id}
              options={responsableOptions}
              onChange={v => set("responsable_id", v)}
              emptyLabel="Sin responsable"
              disabled={cuadrillaIds.length > 0}
            />
            {cuadrillaIds.length > 0 && (
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
                Quita las cuadrillas a cargo para asignar una persona.
              </p>
            )}
          </FieldRow>

          <FieldRow icon={<Truck size={16} />} label="Proveedor">
            <SearchSelect
              placeholder="Elegir proveedor…"
              value={form.proveedor_id}
              options={proveedorOptions}
              onChange={v => set("proveedor_id", v)}
              emptyLabel="Sin proveedor"
              createLabel="Crear proveedor"
              // Solo el nombre: contacto/email/telefono se completan despues en
              // la ficha del proveedor, no vale trabar el alta del activo por eso.
              onCreate={async nombre => {
                const nuevo = await createProveedor(wsId, nombre);
                onProveedorCreado(nuevo);
                return nuevo.id;
              }}
            />
          </FieldRow>

          <FieldRow icon={<GitBranch size={16} />} label="Activo padre">
            <SearchSelect placeholder="Elegir activo padre…" value={form.activo_padre_id} options={parentOptions} onChange={v => set("activo_padre_id", v)} emptyLabel="Sin activo padre" />
          </FieldRow>

          {/* Repuestos que sirven a este equipo. Es el mismo vinculo que se ve
              desde la ficha del material, editable desde los dos lados. */}
          <FieldRow icon={<Boxes size={16} />} label="Partes">
            <MaterialPicker
              materiales={materiales}
              selected={materialLinks}
              onToggle={materialId => setMaterialLinks(prev => prev.some(l => l.material_id === materialId)
                ? prev.filter(l => l.material_id !== materialId)
                : [...prev, { material_id: materialId, cantidad: 1 }])}
            />
          </FieldRow>

          {/* Cuadrillas a cargo: que oficios mantienen este equipo. Es un dato
              del activo, no de la OT — la OT sigue teniendo responsables
              personales. */}
          <FieldRow icon={<Users size={16} />} label="Cuadrillas a cargo">
            <CuadrillaPicker
              cuadrillas={cuadrillas}
              selected={cuadrillaIds}
              onToggle={id => setCuadrillaIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              disabled={!!form.responsable_id}
            />
            {form.responsable_id && (
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
                Quita el responsable para asignar cuadrillas.
              </p>
            )}
          </FieldRow>

          {/* Adjuntos */}
          <div style={{ padding: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 16, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}><Paperclip size={16} /></span>
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em" }}>
                  Adjuntos
                </span>
              </div>
              <button type="button" onClick={() => adjuntoInputRef.current?.click()} disabled={uploadingAdjunto}
                style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--surface-1)", color: "var(--brand)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}>
                {uploadingAdjunto ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Adjuntar archivo
              </button>
              <input ref={adjuntoInputRef} type="file" multiple style={{ display: "none" }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.dwg,.dxf,.zip,image/*"
                onChange={handlePickAdjuntos} />
            </div>
            {adjuntos.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22 }}>
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
                style={{ width: "calc(100% - 22px)", marginLeft: 22, border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", padding: "18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--fg-3)", cursor: "pointer", background: "var(--surface-canvas)", fontFamily: "inherit", boxSizing: "border-box" }}>
                <span style={{ fontSize: 14 }}>PDF, Word, Excel, manuales, imágenes…</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-canvas)", flexShrink: 0 }}>
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
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: 0 }}>{title}</p>
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
// ── Estado (pestaña General) ─────────────────────────────────────────────────
/**
 * Tarjeta de estado del activo: el selector, quién lo cambió por última vez, y
 * la entrada al historial.
 *
 * Ocupa el lugar que tenia la foto. La foto describe al equipo y encaja con la
 * ficha técnica (Detalles); lo que se quiere saber al abrir un activo es si
 * está funcionando y desde cuándo.
 *
 * "Ver más" es además el único acceso visible a /activos/[id]/estado.
 */
function EstadoCard({ activo, onChangeEstado, changing }: {
  activo: Activo;
  onChangeEstado: (e: AssetStatus) => void;
  changing: boolean;
}) {
  const router = useRouter();
  // El menu se dibuja en un portal sobre document.body, no dentro de la
  // tarjeta: `Card` lleva `overflow: hidden` para redondear sus esquinas, y eso
  // RECORTA cualquier hijo posicionado por mas z-index que tenga — el recorte
  // no mira el orden de apilamiento. Por eso las opciones salian cortadas al
  // borde de la tarjeta.
  const [abierto, setAbierto] = useState<{ top: number; left: number; width: number } | null>(null);
  const [vigente, setVigente] = useState<EstadoPeriodo | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  // El período vigente da "desde cuándo" y "por quién". Si el activo no tiene
  // historial todavía, la línea no se muestra en vez de inventar una fecha.
  useEffect(() => {
    let cancelado = false;
    fetchPeriodoVigente(activo.id)
      .then(p => { if (!cancelado) setVigente(p); })
      .catch(() => { if (!cancelado) setVigente(null); });
    return () => { cancelado = true; };
  }, [activo.id, activo.estado]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (menuRef.current?.contains(t) || botonRef.current?.contains(t)) return;
      setAbierto(null);
    };
    // Con posicion fija el menu no sigue al contenido: se cierra al desplazar,
    // igual que el menu de fila de la tabla de Equipo.
    const cerrar = () => setAbierto(null);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  /** Mide el boton y abre (o cierra) el menu anclado a el. */
  function alternar() {
    if (abierto) { setAbierto(null); return; }
    const r = botonRef.current?.getBoundingClientRect();
    if (!r) return;
    setAbierto({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  return (
    <div>
      <SectionHeader
        title="Estado"
        action={
          <button
            type="button"
            onClick={() => router.push(`/activos/${activo.id}/estado`)}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 400, color: "var(--brand)" }}
          >
            Ver más <ChevronRight size={14} />
          </button>
        }
      />
      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ display: "inline-block" }}>
            <button
              ref={botonRef}
              type="button"
              onClick={alternar}
              disabled={changing}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, cursor: changing ? "default" : "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--fg-1)" }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: estadoColor(activo.estado), flexShrink: 0 }} />
              {estadoLabel(activo.estado)}
              {changing
                ? <Loader2 size={14} className="animate-spin" style={{ color: "var(--fg-4)" }} />
                : <ChevronDown size={14} style={{ color: "var(--fg-4)" }} />}
            </button>
            {abierto && typeof document !== "undefined" && createPortal(
              <div ref={menuRef} style={{ position: "fixed", top: abierto.top, left: abierto.left, zIndex: 9999, minWidth: Math.max(abierto.width, 200), background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                {ESTADO_OPCIONES.filter(e => e !== activo.estado).map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setAbierto(null); onChangeEstado(e); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--fg-1)", textAlign: "left" }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: ESTADO_COLOR[e] }} />
                    {ESTADO_LABEL[e]}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>

          {vigente && (
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
              {vigente.creador?.nombre
                ? <>Última actualización por <span style={{ color: "var(--fg-2)" }}>{vigente.creador.nombre}</span>{" "}</>
                : "En este estado "}
              desde el {new Date(vigente.inicio).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Lecturas de medidores (pestaña General) ──────────────────────────────────

const NIVEL_COLOR: Record<NivelLectura, string> = {
  normal: "#10B981",
  advertencia: "#F59E0B",
  critico: "#EF4444",
};

const NIVEL_LABEL: Record<NivelLectura, string> = {
  normal: "Normal",
  advertencia: "Advertencia",
  critico: "Crítico",
};

/** "hace 4 s" / "hace 3 min" — a qué distancia quedó la última lectura. */
function haceCuanto(iso: string): string {
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return `hace ${seg} s`;
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return `hace ${Math.round(seg / 86400)} d`;
}

/**
 * Una fila del panel: el número grande, su unidad y en qué franja cayó.
 *
 * El valor es lo único que la vista necesita destacar —es el dato que el
 * usuario vino a mirar—, así que va en cuerpo grande y el resto queda de apoyo.
 */
function MedidorRow({ medidor, last }: { medidor: MedidorConUltima; last: boolean }) {
  const nivel = medidor.ultima ? nivelDeLectura(medidor.ultima.valor, medidor) : null;
  const color = nivel ? NIVEL_COLOR[nivel] : "var(--fg-4)";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-1)" }}>
          {/* El ícono distingue de un vistazo el medidor que se alimenta solo
              del que alguien carga a mano en la ronda. */}
          {medidor.tipo === "automatizado"
            ? <Wifi size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
            : <User size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{medidor.nombre}</span>
        </span>
        <span style={{ fontSize: 14, color: "var(--fg-4)" }}>
          {medidor.ultima ? haceCuanto(medidor.ultima.ts) : "Sin lecturas"}
          {medidor.critico != null && ` · crítico ${medidor.critico} ${medidor.unidad}`}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {nivel && nivel !== "normal" && (
          <span style={{ padding: "2px 8px", borderRadius: "var(--r-xs)", fontSize: 14, background: color + "22", color }}>
            {NIVEL_LABEL[nivel]}
          </span>
        )}
        <span style={{ fontSize: 22, fontWeight: 500, color, fontVariantNumeric: "tabular-nums" }}>
          {medidor.ultima ? medidor.ultima.valor : "—"}
          <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", marginLeft: 4 }}>{medidor.unidad}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Panel de lecturas en vivo.
 *
 * Se suscribe a `medidor_lecturas` del activo: cuando el dispositivo publica,
 * el número cambia solo. Es el punto de la función —ver el dato de la máquina
 * moverse— y por eso no hay polling: sin cambios no se consulta nada.
 */
function MedidoresCard({ activo }: { activo: Activo }) {
  const [medidores, setMedidores] = useState<MedidorConUltima[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedidoresDeActivo(activo.id)
      .then(m => { if (!cancelled) setMedidores(m); })
      .catch(() => { if (!cancelled) setMedidores([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activo.id]);

  // Los ids son la dependencia real de la suscripción: mientras no cambien, el
  // canal no necesita rearmarse aunque lleguen lecturas nuevas.
  const idsMedidores = useMemo(() => medidores.map(m => m.id).sort().join(","), [medidores]);

  useEffect(() => {
    if (!idsMedidores) return;
    const ids = new Set(idsMedidores.split(","));
    const sb = createClient();
    const channelName = `medidor-lecturas-${activo.id}`;
    const channelDetails = {
      channelName,
      screen: "ActivosBandeja",
      table: "medidor_lecturas",
      filter: `workspace_id=eq.${activo.workspace_id}`,
    };
    logRealtimeChannel("create", channelDetails, sb);

    // Se filtra por workspace y no por medidor: postgres_changes admite un solo
    // filtro por suscripción, así que filtrar por medidor obligaría a un canal
    // por medidor. Llega algo de más y se descarta acá.
    const channel = sb
      .channel(channelName)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "medidor_lecturas", filter: `workspace_id=eq.${activo.workspace_id}` },
        (payload) => {
          const fila = payload.new as { id: string; medidor_id: string; valor: number; ts: string; creado_por: string | null; created_at: string };
          if (!ids.has(fila.medidor_id)) return;
          setMedidores(prev => prev.map(m => {
            if (m.id !== fila.medidor_id) return m;
            // Una lectura atrasada (buffer de un gateway que reconecta) no debe
            // pisar a la última: `ultima` es la más reciente por `ts`, no la
            // que llegó al final.
            if (m.ultima && new Date(fila.ts) < new Date(m.ultima.ts)) return m;
            return { ...m, ultima: fila };
          }));
        })
      .subscribe();

    return () => {
      logRealtimeChannel("remove", channelDetails, sb);
      sb.removeChannel(channel);
    };
  }, [idsMedidores, activo.id, activo.workspace_id]);

  // Mientras carga no se pinta nada: un esqueleto que aparece y desaparece en
  // 200ms mueve el resto de la ficha hacia abajo y molesta más de lo que informa.
  if (loading) return null;

  return (
    <div>
      <SectionHeader
        title="Lecturas de medidores"
        action={
          <button
            type="button"
            onClick={() => setCreando(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 400, color: "var(--brand)" }}
          >
            <Plus size={14} /> Agregar
          </button>
        }
      />
      <Card>
        {medidores.length === 0 ? (
          <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <Gauge size={20} style={{ color: "var(--fg-4)" }} />
            <span style={{ fontSize: 14, color: "var(--fg-4)", textAlign: "center" }}>
              Sin medidores. Agrega uno para seguir su condición en vivo.
            </span>
          </div>
        ) : medidores.map((m, i) => (
          <MedidorRow key={m.id} medidor={m} last={i === medidores.length - 1} />
        ))}
      </Card>

      {creando && activo.workspace_id && (
        <NuevoMedidorDialog
          workspaceId={activo.workspace_id}
          activoId={activo.id}
          ubicacionId={activo.ubicacion_id}
          onClose={() => setCreando(false)}
          onCreado={medidor => setMedidores(prev => [...prev, { ...medidor, ultima: null }])}
        />
      )}
    </div>
  );
}

function GeneralTab({ activo, onChangeEstado, changingEstado }: {
  activo: Activo;
  onChangeEstado: (e: AssetStatus) => void;
  changingEstado: boolean;
}) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
      <EstadoCard activo={activo} onChangeEstado={onChangeEstado} changing={changingEstado} />

      <MedidoresCard activo={activo} />

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
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 7, marginTop: 0 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0, display: "flex", alignItems: "center", gap: 10, lineHeight: 1.45 }}>
        <span style={{
          width: 30, height: 30, borderRadius: "var(--r-sm)",
          background: "var(--surface-1)", color: "var(--brand)",
          border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</span>
        {value}
      </p>
    </div>
  );
}

const META_GRID: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "24px 72px",
};

// ── Detalles tab — OTDetail idiom: flowing sections + meta-field grids ─────────
function DetallesTab({ activo, hijos, padreActivo, onOpenActivo, onOpenMaterial, onFullscreen, onCrearSubActivo }: { activo: Activo; hijos: Activo[]; padreActivo?: Activo | null; onOpenActivo: (id: string) => void; onOpenMaterial: (id: string) => void; onFullscreen: () => void; onCrearSubActivo?: (padreId: string) => void }) {
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const adjuntos = Array.isArray(activo.adjuntos) ? activo.adjuntos : [];
  const ubic = ubicacionLabel(activo);
  const partes = activo.materiales ?? [];
  /**
   * Activo padre, buscado en la lista que ya tenemos en memoria.
   *
   * NO se usa el embed `activo.parent`. En una tabla que se referencia a si
   * misma, `activos!activo_padre_id` le dice a PostgREST el nombre de la
   * COLUMNA y lo resuelve al reves: devuelve las filas cuyo `activo_padre_id`
   * apunta a esta —los HIJOS—, asi que la ficha mostraba al primer hijo como
   * "Activo padre" y los que si tenian padre no mostraban ninguno. Nombrar la
   * constraint tampoco sirve: PostgREST no la tiene en su cache de esquema y
   * responde PGRST200, con lo cual la consulta entera falla y el listado sale
   * vacio.
   *
   * `activo_padre_id` ya viene como columna y la bandeja ya tiene todos los
   * activos cargados, asi que resolverlo en memoria es exacto, no agrega una
   * consulta y no depende de como PostgREST interprete la FK.
   */
  const padre = padreActivo ?? null;
  /** Se muestran de a 4 para que la seccion no empuje al resto de la ficha
   *  fuera de pantalla cuando un equipo tiene decenas de repuestos. */
  const [partesVisibles, setPartesVisibles] = useState(PARTES_CHUNK);

  const equipoFields = [
    { label: "Criticidad", value: CRITICIDAD_LABEL[crit], icon: <AlertCircle size={16} /> },
    { label: "Fabricante", value: activo.fabricante?.nombre ?? "Sin fabricante", icon: <Factory size={16} /> },
    { label: "Modelo", value: activo.modelo?.nombre ?? "Sin modelo", icon: <Tag size={16} /> },
    { label: "N° de serie", value: activo.numero_serie ?? "Sin número de serie", icon: <Hash size={16} /> },
    { label: "Año", value: activo.año_fabricacion ? String(activo.año_fabricacion) : "Sin año", icon: <Calendar size={16} /> },
    {
      label: "Costo por hora detenido",
      value: activo.costo_hora_parada != null
        ? `$${Math.round(Number(activo.costo_hora_parada)).toLocaleString("es-CL")}/h`
        : "Sin informar",
      icon: <DollarSign size={16} />,
    },
    { label: "Proveedor", value: activo.proveedor?.nombre ?? "Sin proveedor", icon: <Truck size={16} /> },
  ];

  const ubicFields: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: "Cliente", value: activo.sociedad?.nombre ?? "Sin cliente", icon: <Building2 size={16} /> },
    { label: "Ubicación", value: ubic ?? "Sin ubicación", icon: <MapPin size={16} /> },
    { label: "Lugar", value: activo.lugar?.nombre ?? "Sin lugar específico", icon: <Locate size={16} /> },
  ];

  // Responsable y Cuadrillas se excluyen entre si (ver el formulario), asi que
  // se muestra SOLO la que tenga valor: con las dos siempre visibles, una de
  // ellas decia "Sin responsable" / "Sin cuadrilla" aunque el activo estuviera
  // perfectamente asignado por la otra via.
  const nombresCuadrillas = (activo.cuadrillas ?? [])
    .map(c => c.cuadrilla?.nombre).filter(Boolean).join(", ");
  if (activo.responsable?.nombre) {
    ubicFields.push({ label: "Responsable", value: activo.responsable.nombre, icon: <User size={16} /> });
  }
  if (nombresCuadrillas) {
    ubicFields.push({ label: "Cuadrillas a cargo", value: nombresCuadrillas, icon: <Users size={16} /> });
  }

  return (
    <div>
      {/* Foto del equipo. Vivía en General, pero ahí competía con el estado y las
          OTs; acá acompaña a la ficha técnica, que es lo que describe. */}
      {activo.imagen_url && (
        <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>Imágenes</p>
          <button
            onClick={onFullscreen}
            title="Ver imagen completa"
            style={{ position: "relative", width: 104, height: 104, borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)", border: "1px solid var(--border)", padding: 0, cursor: "pointer", display: "block" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activo.imagen_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span style={{ position: "absolute", bottom: 5, right: 5, background: "rgba(0,0,0,0.45)", borderRadius: "50%", padding: 5, color: "#fff", display: "inline-flex" }}><Maximize2 size={13} /></span>
          </button>
        </div>
      )}

      {/* Descripción — texto corrido, sin tarjeta */}
      {activo.descripcion && (
        <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>
            <FileText size={16} style={{ color: "var(--brand)" }} />
            Descripción
          </p>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{activo.descripcion}</p>
        </div>
      )}

      {/* Equipo */}
      {equipoFields.length > 0 && (
        <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={META_GRID}>
            {equipoFields.map(f => <MetaField key={f.label} {...f} />)}
          </div>
        </div>
      )}

      {/* Ubicación y responsabilidad */}
      {ubicFields.length > 0 && (
        <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={META_GRID}>
            {ubicFields.map(f => <MetaField key={f.label} {...f} />)}
          </div>
        </div>
      )}

      {/* Adjuntos y manuales */}
      {adjuntos.length > 0 && (
        <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>Archivos adjuntos</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            {adjuntos.map((a, idx) => (
              <a key={`${a.url}-${idx}`} href={a.url} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-0)", textDecoration: "none", color: "var(--fg-1)", maxWidth: "100%" }}>
                <span style={{ width: 30, height: 30, borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--brand)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={16} /></span>
                <span style={{ fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre ?? a.tipo ?? "Adjunto"}</span>
                <ExternalLink size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Partes — los repuestos que sirven a este equipo. Mismo vinculo que se
          ve desde la ficha del material; se edita en crear/editar activo. */}
      {partes.length > 0 && (
        <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>Partes ({partes.length})</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {partes.slice(0, partesVisibles).map(link => {
              const material = link.material;
              const bajo = material != null && Number(material.stock_actual) <= Number(material.stock_minimo);
              return (
                <div
                  key={link.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                    background: "var(--surface-1)",
                  }}
                >
                  {/* Miniatura: sin foto va el icono, para que la fila no
                      cambie de alto segun haya imagen o no. */}
                  {material?.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={material.imagen_url}
                      alt=""
                      style={{ width: 34, height: 34, borderRadius: "var(--r-xs)", objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0, display: "block" }}
                    />
                  ) : (
                    <span style={{
                      width: 34, height: 34, borderRadius: "var(--r-xs)",
                      background: "var(--surface-hover)", color: "var(--brand)",
                      border: "1px solid var(--border)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Boxes size={16} />
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenMaterial(link.material_id)}
                    title={material?.nombre}
                    style={{
                      flex: 1, minWidth: 0, textAlign: "left",
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {material?.nombre ?? "Material"}
                  </button>

                  {/* Stock: el dato que decide si el repuesto esta disponible
                      cuando hace falta. En rojo si esta bajo el minimo. */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
                    height: 30, padding: "0 10px",
                    background: "var(--surface-1)", border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    fontSize: 14, color: bajo ? "var(--danger)" : "var(--fg-1)",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: bajo ? "var(--danger)" : "var(--success)", flexShrink: 0 }} />
                    {Number(material?.stock_actual ?? 0).toLocaleString("es-CL")} {material?.unidad ?? ""}
                  </span>
                </div>
              );
            })}
          </div>

          {partesVisibles < partes.length && (
            <button
              type="button"
              onClick={() => setPartesVisibles(n => n + PARTES_CHUNK)}
              style={{
                marginTop: 10, padding: 0,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 14, fontWeight: 400,
                color: "var(--brand-fg)",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <Plus size={14} />
              Ver más ({partes.length - partesVisibles})
            </button>
          )}
        </div>
      )}

      {/* Jerarquía — solo si hay algo que mostrar. La tarjeta "Sin activo
          padre" ocupaba un bloque entero en la mayoría de los activos (que no
          cuelgan de ninguno) para no decir nada ni ofrecer ninguna acción: el
          padre se asigna en crear/editar, no acá. */}
      {/* Jerarquía.
          El padre, si lo hay, y los sub-activos con su propio botón de alta.
          La sección se muestra siempre que se pueda crear: es el único lugar
          desde donde se arma el árbol hacia abajo, y esconderla cuando todavía
          no hay hijos dejaba sin camino al primero. */}
      {(padre || hijos.length > 0 || onCrearSubActivo) && (
      <div style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          {padre && (
            <button onClick={() => onOpenActivo(padre.id)} style={{ width: "100%", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><GitBranch size={15} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em" }}>Activo padre</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{padre.nombre}</span>
              </span>
              <ChevronRight size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
              Sub-activos ({hijos.length})
            </span>
            {onCrearSubActivo && (
              <button
                type="button"
                onClick={() => onCrearSubActivo(activo.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--brand-fg)" }}
              >
                <PlusCircle size={15} /> Crear sub-activo
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hijos.map(h => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)" }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-hover)", color: "var(--fg-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ArrowDown size={15} /></span>
                <button
                  type="button"
                  onClick={() => onOpenActivo(h.id)}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {h.nombre}
                </button>
                {/* Estado del componente a la vista: es el dato que dice si el
                    equipo padre puede trabajar o no. */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, height: 26, padding: "0 9px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", fontSize: 14, color: "var(--fg-1)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: estadoColor(h.estado), flexShrink: 0 }} />
                  {estadoLabel(h.estado)}
                </span>
                {/* Anidar sin tener que abrir el hijo primero: es la forma en
                    que se arma un árbol de varios niveles de un tirón. */}
                {onCrearSubActivo && (
                  <button
                    type="button"
                    title={`Crear un sub-activo dentro de ${h.nombre}`}
                    onClick={() => onCrearSubActivo(h.id)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--brand-fg)" }}
                  >
                    <PlusCircle size={14} /> Sub-activo
                  </button>
                )}
                <ChevronRight size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
              </div>
            ))}

            {hijos.length === 0 && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>
                Agrega los componentes que forman parte de este activo.
              </p>
            )}
          </div>
      </div>
      )}

      {/* Pie: quien creo y quien actualizo, con avatar — el mismo componente
          que usa la ficha de material. Los activos anteriores a las columnas de
          auditoria no tienen autor, y ahi va solo la fecha. */}
      <AuditFooter
        creador={activo.creador}
        creadoEn={activo.created_at}
        actualizador={activo.actualizador}
        actualizadoEn={activo.updated_at}
      />
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
      <div style={{ padding: "64px 24px 48px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span style={{ width: 64, height: 64, borderRadius: "var(--r-md)", background: "var(--brand-tint)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Clock size={30} /></span>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Sin actividad</span>
        <span style={{ fontSize: 14, color: "var(--fg-4)", textAlign: "center" }}>Los cambios y las OTs de este activo se registrarán aquí.</span>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 16 }}>
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
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: idx === rows.length - 1 && nextPage == null ? "none" : "1px solid var(--border)" }}>
              <span style={{ width: 30, height: 30, borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: cfg.color, border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} /></span>
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
  activo, activos, onEdit, onDeleted, onUpdated, onCrearSubActivo, onOpenActivo,
}: {
  activo: Activo;
  activos: Activo[];
  onEdit: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (activo: Activo) => void;
  /** Abre el alta con este activo (o un hijo suyo) ya puesto como padre. */
  onCrearSubActivo?: (padreId: string) => void;
  /** Selecciona otro activo de la jerarquía en la misma bandeja. */
  onOpenActivo?: (id: string) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ActivoTab>("general");
  const [deleting, setDeleting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [changingEstado, setChangingEstado] = useState(false);
  const [accionesMenuOpen, setAccionesMenuOpen] = useState(false);
  const accionesMenuRef = useRef<HTMLDivElement>(null);
  const hijos = activos.filter(a => a.activo_padre_id === activo.id);
  /**
   * El activo padre sale de la lista que ya está en memoria, no del embed
   * `activo.parent`: ver el comentario en DetallesTab. Acá `activos` está en
   * alcance y ya trae todo el workspace, así que la búsqueda es exacta y no
   * cuesta una consulta más.
   */
  const padreActivo = activo.activo_padre_id
    ? activos.find(a => a.id === activo.activo_padre_id) ?? null
    : null;

  // Reset to the first tab whenever a different asset is opened.
  useEffect(() => { setTab("general"); }, [activo.id]);

  // Esc cierra el visor, igual que el lightbox de OTDetail.
  useEffect(() => {
    if (!fullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fullscreen]);

  // Cierra el menú de acciones al hacer clic fuera. El de estado ya no está
  // acá: vive en EstadoCard, que gestiona el suyo.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
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

  // Cambio rápido de estado.
  //
  // Pasa por `cambiar_estado_activo`, no por `updateActivo`: esa función cierra
  // el período abierto en `activo_estado_periodos` y abre el nuevo, que es de
  // donde sale el tiempo de inactividad real. Escribir `activos.estado` a secas
  // dejaría el historial con huecos y las horas mal contadas.
  //
  // Una parada necesita saber si fue planificada o imprevista, y acá no hay
  // dónde preguntarlo, así que esos casos se derivan a /activos/[id]/estado.
  // "Operativo" no lleva tipo, así que se resuelve en el momento.
  async function handleChangeEstado(nuevo: AssetStatus) {
    if (nuevo === activo.estado) return;

    if (nuevo !== "operativo") {
      router.push(`/activos/${activo.id}/estado`);
      return;
    }

    setChangingEstado(true);
    try {
      await cambiarEstadoActivo({ activoId: activo.id, estado: nuevo });
      // Releer para que la fila del panel refleje el estado ya escrito por la
      // función; `cambiar_estado_activo` devuelve el id del período, no el activo.
      const saved = await updateActivo(activo.id, { nombre: activo.nombre });
      onUpdated(saved);
    } finally {
      setChangingEstado(false);
    }
  }

  /**
   * Abrir otro activo desde la jerarquía.
   *
   * NO puede ser `router.push("/activos/activos?id=…")`. El activo abierto vive
   * en el estado de la bandeja (`selected`), y el `?id=` de la URL se escribe
   * DESDE ese estado con replaceState — nunca se lee de vuelta al navegar. Con
   * push cambiaba la barra de direcciones y el panel se quedaba donde estaba:
   * los enlaces al activo padre y a los sub-activos no hacían nada.
   */
  const openActivo = (id: string) => onOpenActivo?.(id);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* ── Cabecera ──
          Mismo idioma que OTDetail: la barra de secciones va primero y en todas
          las pestañas, solo con iconos del mismo tamaño. El icono va SIEMPRE en
          azul de marca —es lo que identifica la sección de un vistazo— y la
          activa se distingue solo por el borde de 1.5px, sin relleno tintado.
          El título NO vive acá: baja al cuerpo con el scroll. */}
      <div style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 28px" }}>
          <div style={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "hidden" }}>
            <div role="tablist" aria-label="Secciones del activo" style={{ display: "flex", alignItems: "center", gap: 6, width: "max-content", minWidth: "100%" }}>
              {ACTIVO_NAV.map(item => {
                const active = tab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={item.label}
                    title={item.label}
                    onClick={e => {
                      // Al hacer clic el puntero se queda encima y no dispara
                      // onMouseLeave, así que el fondo de hover se limpia acá.
                      e.currentTarget.style.background = "var(--surface-1)";
                      setTab(item.tab);
                    }}
                    style={{
                      height: 34, width: 38, padding: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "var(--surface-1)",
                      border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                      borderRadius: "var(--r-sm)",
                      color: "var(--brand)",
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
                      transition: "background 0.12s, border-color 0.12s, color 0.12s",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                    onFocus={e => { e.currentTarget.style.outline = "none"; }}
                  >
                    <span style={{ width: 18, height: 18, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <item.icon size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editar y el menú de acciones van en la misma fila que las
              secciones, disponibles desde cualquier pestaña. */}
          <button
            type="button"
            onClick={onEdit}
            style={{ flexShrink: 0, height: 34, padding: "0 13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit" }}
            onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
          >
            <Pencil size={14} />
            Editar
          </button>

          <div ref={accionesMenuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setAccionesMenuOpen(v => !v)}
              title="Más acciones"
              style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-1)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <MoreVertical size={16} />}
            </button>
            {accionesMenuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-sm)", width: 210, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => { setAccionesMenuOpen(false); router.push(`/activos/${activo.id}/estado`); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--surface-1)", border: "none", cursor: "pointer", fontSize: 14, color: "var(--fg-1)", fontFamily: "inherit", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                >
                  <Clock size={14} /> Ver historial de estado
                </button>
                <button
                  type="button"
                  onClick={() => { setAccionesMenuOpen(false); handleDelete(); }}
                  disabled={deleting}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--surface-1)", border: "none", borderTop: "1px solid var(--border)", cursor: deleting ? "default" : "pointer", fontSize: 14, color: "var(--danger)", fontFamily: "inherit", textAlign: "left" }}
                  onMouseEnter={e => { if (!deleting) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Cuerpo ──
          El único contenedor con scroll: la barra de secciones queda fija
          encima. El padding lateral de 28 lo fija acá el cuerpo, y las
          secciones a sangre lo compensan con márgenes negativos. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", background: "var(--surface-canvas)" }}>
        <div style={{ padding: "0 28px 76px", display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Título y metadatos: dentro del área con scroll, no en la cabecera
              fija — igual que en OTDetail. La línea va como borderBottom de
              este bloque, no como un <hr> aparte, y los márgenes negativos la
              llevan hasta el borde mientras el padding devuelve el texto. */}
          <div style={{
            minWidth: 0,
            marginLeft: -28, marginRight: -28,
            paddingLeft: 28, paddingRight: 28,
            paddingTop: 16, paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}>
            {activo.numero_serie && (
              <div style={{ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 9px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontWeight: 400, fontFamily: "monospace", marginBottom: 8 }}>
                {activo.numero_serie}
              </div>
            )}
            <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: 0, lineHeight: 1.3, overflowWrap: "break-word", wordBreak: "break-word" }}>
              {activo.nombre}
            </h1>
          </div>

          {tab === "general" && <GeneralTab activo={activo} onChangeEstado={handleChangeEstado} changingEstado={changingEstado} />}
          {tab === "detalles" && <DetallesTab activo={activo} hijos={hijos} padreActivo={padreActivo} onOpenActivo={openActivo} onOpenMaterial={id => router.push(`/partes?material=${encodeURIComponent(id)}`)} onFullscreen={() => setFullscreen(true)} onCrearSubActivo={onCrearSubActivo} />}
          {tab === "historial" && <HistorialTab activoId={activo.id} onOpenOT={(otId) => router.push(`/ordenes?id=${encodeURIComponent(otId)}`)} />}
        </div>
      </div>

      {/* Fullscreen photo viewer */}
      {/* Visor de imagen, en un portal sobre document.body.
          El portal NO es opcional: la barra de navegacion de esta pantalla es
          `position:relative; zIndex:100`, o sea un contexto de apilamiento, y
          la raiz ademas tiene `overflow:hidden`. Un visor renderizado aca
          dentro compite solo contra sus hermanos —su zIndex jamas supera al de
          la barra por mas alto que sea— y encima queda recortado. Por eso la
          foto salia por debajo del buscador y las migas.
          OTDetail no necesita portal porque no tiene ese ancestro. */}
      {fullscreen && activo.imagen_url && typeof document !== "undefined" && createPortal(
        <div
          style={{ background: "var(--surface-0)", zIndex: 200 }}
          className="fixed inset-0 flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          {/* Cerrar — esquina superior derecha */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setFullscreen(false); }}
            aria-label="Cerrar"
            className="absolute top-5 flex items-center justify-center"
            style={{
              right: "calc(0.25rem + 15px)",
              color: "var(--fg-1)", background: "transparent", border: "none", padding: 0, cursor: "pointer",
            }}
          >
            <X size={64} strokeWidth={1} />
          </button>

          <div className="relative inline-block max-h-[82vh] max-w-[78vw]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activo.imagen_url}
              alt=""
              className="block max-h-[82vh] max-w-[78vw] select-none object-contain shadow-2xl"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ActivosBandeja({ initialActivos, usuarios, ubicaciones, lugares, sociedades, fabricantes: fabricantesIniciales, modelos: modelosIniciales, proveedores: proveedoresIniciales, materiales, cuadrillas, myRol, wsId, initialSelectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [activos, setActivos] = useState<Activo[]>(initialActivos);
  /**
   * Catalogos como estado local, no props directas.
   *
   * Llegan del servidor, pero ahora se pueden crear desde el desplegable del
   * formulario. Si se leyeran de la prop, el fabricante recien creado no
   * aparecia en la lista hasta recargar la pagina.
   */
  const [fabricantes, setFabricantes] = useState<Fabricante[]>(fabricantesIniciales);
  const [modelos, setModelos] = useState<Modelo[]>(modelosIniciales);
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales);
  const porNombre = <T extends { nombre: string }>(lista: T[]) =>
    [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const selectedRef = useRef<string | null>(initialSelectedId ?? null);
  /**
   * Formulario abierto: `null` cerrado, un activo = editando, `"new"` = alta
   * suelta, `{ bajo }` = alta de un sub-activo con el padre ya elegido.
   *
   * Esa última forma es lo que permite "Crear Sub-Activo" desde la ficha: el
   * activo nace colgando del que se estaba mirando, sin que el usuario tenga
   * que buscarlo de nuevo en el selector de activo padre.
   */
  const [editing, setEditing] = useState<Activo | null | "new" | { bajo: string }>(null);
  const [search, setSearch] = useState("");
  const locationsView = pathname.endsWith("/ubicaciones");
  const [filterCrit, setFilterCrit] = useState<CritFilter>("all");
  const [filterSociedadId, setFilterSociedadId] = useState<string | "all">("all");
  const [filterEstado, setFilterEstado] = useState<AssetStatus | "all">("all");
  const [filterUbicacionId, setFilterUbicacionId] = useState<string | "all">("all");
  const [filterLugarId, setFilterLugarId] = useState<string | "all">("all");
  // "sin" = activos sin responsable asignado, que es una pregunta real: son los
  // que no tienen a nadie a cargo.
  const [filterResponsableId, setFilterResponsableId] = useState<string | "all" | "sin">("all");
  const [filterFabricanteId, setFilterFabricanteId] = useState<string | "all">("all");
  const [filterModeloId, setFilterModeloId] = useState<string | "all">("all");
  const [sort, setSort] = useState<ActivoSortOption>("nombre_asc");
  const [sortOpen, setSortOpen] = useState(false);
  const [openSortGroup, setOpenSortGroup] = useState<string | null>(null);
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
    // Namespaced by workspace like `ordenes-trabajo-${wsId}`: the binding below is
    // already workspace-scoped, so a bare name would make a wsId change tear down
    // and re-create the SAME topic, racing the async removeChannel.
    const channelName = `activos-list-${wsId}`;
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
    // Se calcula acá y no se toma de `hayFiltros`: esa constante se declara más
    // abajo, así que usarla dentro del memo la leería antes de existir.
    const filtrando = filterCrit !== "all" || filterSociedadId !== "all"
      || filterEstado !== "all" || filterUbicacionId !== "all" || filterLugarId !== "all"
      || filterResponsableId !== "all" || filterFabricanteId !== "all" || filterModeloId !== "all";
    const list = activos.filter(a => {
      /**
       * Los sub-activos no aparecen sueltos en el listado: viven dentro de la
       * ficha de su padre. Un motor listado al lado de su propia máquina hace
       * que el inventario cuente dos veces lo mismo.
       *
       * La excepción es buscar o filtrar: si alguien escribe "motor", quiere
       * ese motor, esté donde esté. Esconderlo ahí sería un resultado faltante
       * sin explicación. El padre puede no estar en `activos` si quedó fuera de
       * este workspace, así que solo se oculta cuando el padre está a la vista.
       */
      if (!q && !filtrando && a.activo_padre_id
          && activos.some(p => p.id === a.activo_padre_id)) return false;
      if (filterCrit !== "all" && a.criticidad !== filterCrit) return false;
      if (filterSociedadId !== "all" && a.sociedad_id !== filterSociedadId) return false;
      // `operativo` es el valor por defecto: un activo sin estado cargado
      // cuenta como operativo, igual que en el resto de la pantalla.
      if (filterEstado !== "all" && (a.estado ?? "operativo") !== filterEstado) return false;
      if (filterUbicacionId !== "all" && a.ubicacion_id !== filterUbicacionId) return false;
      if (filterLugarId !== "all" && a.lugar_id !== filterLugarId) return false;
      if (filterResponsableId === "sin" && a.responsable_id) return false;
      if (filterResponsableId !== "all" && filterResponsableId !== "sin" && a.responsable_id !== filterResponsableId) return false;
      if (filterFabricanteId !== "all" && a.fabricante_id !== filterFabricanteId) return false;
      if (filterModeloId !== "all" && a.modelo_id !== filterModeloId) return false;
      if (!q) return true;
      return [a.nombre, a.numero_serie, a.fabricante?.nombre, a.modelo?.nombre, a.sociedad?.nombre, ubicacionLabel(a)]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
    list.sort((a, b) => {
      switch (sort) {
        case "nombre_desc":
          return b.nombre.localeCompare(a.nombre, "es");
        case "estado_asc":
          return estadoLabel(a.estado).localeCompare(estadoLabel(b.estado), "es") || a.nombre.localeCompare(b.nombre, "es");
        case "estado_desc":
          return estadoLabel(b.estado).localeCompare(estadoLabel(a.estado), "es") || a.nombre.localeCompare(b.nombre, "es");
        case "criticidad_desc":
          return (CRIT_ORDER[b.criticidad ?? "no_critico"] ?? 0) - (CRIT_ORDER[a.criticidad ?? "no_critico"] ?? 0) || a.nombre.localeCompare(b.nombre, "es");
        case "criticidad_asc":
          return (CRIT_ORDER[a.criticidad ?? "no_critico"] ?? 0) - (CRIT_ORDER[b.criticidad ?? "no_critico"] ?? 0) || a.nombre.localeCompare(b.nombre, "es");
        case "creacion_desc":
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        case "creacion_asc":
          return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        default:
          return a.nombre.localeCompare(b.nombre, "es");
      }
    });
    return list;
  }, [activos, search, filterCrit, filterSociedadId, filterEstado, filterUbicacionId,
      filterLugarId, filterResponsableId, filterFabricanteId, filterModeloId, sort]);

  // Cuantos activos hay en cada estado, para que el menu diga de entrada si
  // vale la pena filtrar por "Fuera de servicio".
  const estadoCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activos) {
      const e = a.estado ?? "operativo";
      m.set(e, (m.get(e) ?? 0) + 1);
    }
    return m;
  }, [activos]);

  const hayFiltros = filterCrit !== "all" || filterSociedadId !== "all"
    || filterEstado !== "all" || filterUbicacionId !== "all" || filterLugarId !== "all"
    || filterResponsableId !== "all" || filterFabricanteId !== "all" || filterModeloId !== "all";

  function limpiarFiltros() {
    setFilterCrit("all");
    setFilterSociedadId("all");
    setFilterEstado("all");
    setFilterUbicacionId("all");
    setFilterLugarId("all");
    setFilterResponsableId("all");
    setFilterFabricanteId("all");
    setFilterModeloId("all");
  }

  /**
   * Opciones de un filtro de catalogo, derivadas de los activos que HAY.
   *
   * Los catalogos (fabricantes, modelos, ubicaciones...) son globales del
   * workspace y pueden tener cientos de filas; la mayoria sin un solo activo
   * asociado. Ofrecerlas todas llena el menu de opciones que no filtran nada:
   * al elegirlas la lista queda vacia. Solo se listan los valores realmente en
   * uso, con cuantos activos tiene cada uno.
   *
   * Se calcula sobre `activos` —que ya esta en memoria— asi que no agrega
   * ninguna consulta.
   */
  function useOpcionesEnUso<T extends { id: string }>(
    catalogo: T[],
    campo: (a: Activo) => string | null | undefined,
    nombre: (t: T) => string,
  ) {
    return useMemo(() => {
      const counts = new Map<string, number>();
      for (const a of activos) {
        const id = campo(a);
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return catalogo
        .filter(t => counts.has(t.id))
        .map(t => ({ id: t.id, nombre: nombre(t), count: counts.get(t.id) ?? 0 }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
      // `campo` y `nombre` se redefinen en cada render (son lambdas en el punto
      // de uso); dependen solo de `activos` y del catalogo, que son los que
      // realmente cambian el resultado.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activos, catalogo]);
  }

  const opcionesUbicacion   = useOpcionesEnUso(ubicaciones, a => a.ubicacion_id,   u => u.edificio ?? "Sin nombre");
  const opcionesLugar       = useOpcionesEnUso(lugares,     a => a.lugar_id,       l => l.nombre);
  const opcionesResponsable = useOpcionesEnUso(usuarios,    a => a.responsable_id, u => u.nombre);
  const opcionesFabricante  = useOpcionesEnUso(fabricantes, a => a.fabricante_id,  f => f.nombre);
  const opcionesModelo      = useOpcionesEnUso(modelos,     a => a.modelo_id,      m => m.nombre);
  const opcionesSociedad    = useOpcionesEnUso(sociedades,  a => a.sociedad_id,    s => s.nombre);

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
      <div style={{ position: "relative", zIndex: 10, flexShrink: 0, overflow: "visible", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>

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
          {!locationsView && <AssetFilterDropdown label="Criticidad" icon={<AlertCircle size={16} />} active={filterCrit !== "all"}>{([['all','Todas'],['critico','Crítico'],['semi_critico','Semi-crítico'],['no_critico','No crítico']] as [CritFilter,string][]).map(([value, label]) => <button key={value} type="button" onClick={() => setFilterCrit(value)} style={{ ...assetFilterOptionStyle, background: filterCrit === value ? "var(--brand-tint)" : "transparent", color: filterCrit === value ? "var(--brand-fg)" : "var(--fg-2)" }}>{label}</button>)}</AssetFilterDropdown>}
          <CatalogFilter
            label="Sociedad" icon={<Building2 size={16} />}
            value={filterSociedadId} onChange={setFilterSociedadId}
            options={opcionesSociedad}
          />
          {!locationsView && (
            <AssetFilterDropdown label="Estado" icon={<RefreshCw size={16} />} active={filterEstado !== "all"}>
              <button type="button" onClick={() => setFilterEstado("all")} style={{ ...assetFilterOptionStyle, background: filterEstado === "all" ? "var(--brand-tint)" : "transparent", color: filterEstado === "all" ? "var(--brand-fg)" : "var(--fg-2)" }}>Todos</button>
              {ESTADO_OPCIONES.map(e => (
                <button key={e} type="button" onClick={() => setFilterEstado(e)} style={{ ...assetFilterOptionStyle, background: filterEstado === e ? "var(--brand-tint)" : "transparent", color: filterEstado === e ? "var(--brand-fg)" : "var(--fg-2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ESTADO_COLOR[e], flexShrink: 0, marginRight: 8 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{ESTADO_LABEL[e]}</span>
                  <span style={{ color: "var(--fg-4)", marginLeft: 8 }}>{estadoCounts.get(e) ?? 0}</span>
                </button>
              ))}
            </AssetFilterDropdown>
          )}
          {!locationsView && (
            <CatalogFilter
              label="Ubicación" icon={<MapPin size={16} />}
              value={filterUbicacionId} onChange={setFilterUbicacionId}
              options={opcionesUbicacion}
            />
          )}
          {!locationsView && (
            <CatalogFilter
              label="Lugar" icon={<MapPin size={16} />}
              value={filterLugarId} onChange={setFilterLugarId}
              options={opcionesLugar}
            />
          )}
          {!locationsView && (
            <CatalogFilter
              label="Responsable" icon={<User size={16} />}
              value={filterResponsableId} onChange={setFilterResponsableId}
              options={[
                { id: "sin", nombre: "Sin responsable" },
                ...opcionesResponsable,
              ]}
              allLabel="Todos"
            />
          )}
          {!locationsView && (
            <CatalogFilter
              label="Fabricante" icon={<Factory size={16} />}
              value={filterFabricanteId} onChange={setFilterFabricanteId}
              options={opcionesFabricante}
            />
          )}
          {!locationsView && (
            <CatalogFilter
              label="Modelo" icon={<Tag size={16} />}
              value={filterModeloId} onChange={setFilterModeloId}
              // Si hay un fabricante elegido, solo sus modelos: la lista
              // completa mezcla modelos de marcas que ya quedaron fuera.
              // Con un fabricante elegido, solo sus modelos: la lista completa
              // mezcla modelos de marcas que ya quedaron fuera del filtro.
              options={filterFabricanteId === "all"
                ? opcionesModelo
                : opcionesModelo.filter(o => modelos.find(m => m.id === o.id)?.fabricante_id === filterFabricanteId)}
            />
          )}
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              style={{
                display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 11px",
                border: "1px dashed var(--border)", borderRadius: "var(--r-sm)",
                background: "transparent", color: "var(--fg-3)",
                fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              <X size={14} />
              Limpiar
            </button>
          )}
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
              <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 400, color: "var(--brand-fg)" }} title={activoSortLabel(sort)}>
                {activoSortLabel(sort)}
              </span>
              <ChevronDown size={14} color="var(--brand-fg)" style={{ flexShrink: 0, transform: sortOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              <span style={{ marginLeft: "auto" }} />
            </button>
            {sortOpen && (
              <div style={{
                position: "absolute", left: 8, right: 8, top: "calc(100% + 4px)", zIndex: 50,
                background: "var(--surface-1)", border: "1px solid var(--border)",
                borderRadius: 8, boxShadow: "var(--shadow-md)",
                maxHeight: "min(480px, calc(100vh - 260px))", overflowX: "hidden", overflowY: "auto",
                scrollbarGutter: "stable both-edges",
              }}>
                {/* Grupo por campo: se despliega y muestra las dos direcciones,
                    en vez de una lista plana. */}
                {ACTIVO_SORT_GROUPS.map(group => {
                  const isOpen = openSortGroup === group.label || group.options.some(o => o.value === sort && openSortGroup === null);
                  return (
                    <div key={group.label}>
                      <button
                        type="button"
                        onClick={() => setOpenSortGroup(isOpen ? "" : group.label)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "9px 14px", textAlign: "left",
                          background: "transparent", border: "none",
                          fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <ChevronDown size={14} color="var(--brand-fg)" style={{ flexShrink: 0, transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                        <span style={{ flex: 1 }}>{group.label}</span>
                      </button>

                      {isOpen && group.options.map(opt => {
                        const isActive = sort === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { setSort(opt.value); setSortOpen(false); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              width: "100%", padding: "9px 14px 9px 36px", textAlign: "left",
                              background: isActive ? "var(--brand-tint)" : "transparent",
                              border: "none", fontSize: 14, fontWeight: 400,
                              color: isActive ? "var(--brand-fg)" : "var(--fg-1)",
                              cursor: "pointer", fontFamily: "inherit",
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span style={{ flex: 1 }}>{opt.label}</span>
                            {isActive && <Check size={12} style={{ color: "var(--brand)" }} />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
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
              <EmptyState
                icon={<Box size={38} strokeWidth={1.4} />}
                title={
                  search || filterCrit !== "all" || filterSociedadId !== "all"
                    ? "Ningún activo coincide con la búsqueda"
                    : "Todavía no hay activos"
                }
                description="Un activo es el equipo o instalación que se mantiene. Con él cargado, sus órdenes, planes e historial quedan colgando del mismo lugar."
                onCreate={canCreate ? openCreate : undefined}
                createLabel="Crear el primero"
                hasSearch={!!search || filterCrit !== "all" || filterSociedadId !== "all"}
              />
            ) : filtered.map(activo => (
              <ActivoRow key={activo.id} activo={activo} selected={selected === activo.id} onClick={() => { setEditing(null); setSelected(prev => prev === activo.id ? null : activo.id); }} />
            ))}
            {locationsView && assetLocations.length === 0 && <EmptyState icon={<MapPin size={38} strokeWidth={1.4} />} title={search ? "Ninguna ubicación coincide con la búsqueda" : "Sin ubicaciones con activos"} description="Cuando un activo quede asignado a una ubicación, esa ubicación aparecerá acá con su total." hasSearch={!!search} />}
          </div>
        </div>

        {/* RIGHT: detail or form */}
        {(isDesktop || showRight) && (
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", background: "var(--c-bg, var(--surface-canvas))" }}>
            {locationsView ? (
              <EmptyDetail icon={<MapPin size={28} strokeWidth={1.5} />} title="Selecciona una ubicación" hint="Abre una ubicación para ver sus activos" />
            ) : editing ? (
              <ActivoForm
                activo={typeof editing === "object" && editing !== null && "bajo" in editing ? null : (editing === "new" ? null : editing)}
                padreInicial={typeof editing === "object" && editing !== null && "bajo" in editing ? editing.bajo : null}
                cuadrillas={cuadrillas}
                usuarios={usuarios}
                ubicaciones={ubicaciones}
                lugares={lugares}
                sociedades={sociedades}
                fabricantes={fabricantes}
                modelos={modelos}
                proveedores={proveedores}
                materiales={materiales}
                activos={activos}
                wsId={wsId}
                onSaved={handleSaved}
                onClose={() => setEditing(null)}
                onFabricanteCreado={f => setFabricantes(prev => porNombre([...prev, f]))}
                onModeloCreado={m => setModelos(prev => porNombre([...prev, m]))}
                onProveedorCreado={p => setProveedores(prev => porNombre([...prev, p]))}
              />
            ) : selectedActivo ? (
              <ActivoDetail
                activo={selectedActivo}
                activos={activos}
                onEdit={() => setEditing(selectedActivo)}
                onDeleted={handleDeleted}
                onUpdated={handleSaved}
                onCrearSubActivo={canCreate ? (padreId => setEditing({ bajo: padreId })) : undefined}
                onOpenActivo={id => { setEditing(null); setSelected(id); }}
              />
            ) : (
              <EmptyDetail icon={<Box size={28} strokeWidth={1.5} />} title="Selecciona un activo" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
