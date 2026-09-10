"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, Boxes, Check, ChevronDown, ChevronRight, CircleAlert, DollarSign, ExternalLink, FileText, Hash, ImagePlus,
  Loader2, MapPin, Minus, Package, Paperclip, PackageCheck, PackagePlus, Pencil, Plus, RotateCcw, MoreVertical, Ruler, Search, Trash2, User, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { uploadToR2 } from "@/lib/r2";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import styles from "./partes.module.css";
import { InventoryFilterDialog } from "./InventoryFilterDialog";

interface Material {
  id: string; nombre: string; descripcion: string | null; codigo: string;
  unidad: string; precio_unitario: number | null; ubicacion_bodega: string | null;
  stock_actual: number; stock_minimo: number; imagen_url: string | null; workspace_id: string;
  categoria: string | null; qr_code: string | null;
  created_at: string; updated_at: string;
  archivo_url: string | null; archivo_nombre: string | null;
  fabricante: { id: string; nombre: string } | null;
  proveedor: { id: string; nombre: string } | null;
  adjuntos: Adjunto[];
  creador: { id: string; nombre: string } | null;
  actualizador: { id: string; nombre: string } | null;
}
/** Adjunto del material. Mismo formato que `activos.adjuntos`. */
interface Adjunto {
  url: string; nombre: string; tipo: string;
  mime: string | null; size: number | null; uploaded_at: string;
}
/** Activo al que sirve un material. La tabla `activo_materiales` ya existía en
 *  la base; lo que faltaba era mostrarla, que es lo que convierte el inventario
 *  en un catálogo de repuestos por equipo. */
interface ActivoVinculado {
  id: string; material_id: string; activo_id: string; cantidad_recomendada: number;
  activo: { id: string; nombre: string; imagen_url: string | null; numero_serie: string | null; estado: string | null } | null;
}
/** Cantidad de un material comprometida en OTs abiertas (`orden_partes`). */
interface Compromiso { parte_id: string; cantidad: number; orden_id: string; }

/** Activo del workspace, para el selector de vinculación. */
interface ActivoOpcion { id: string; nombre: string; numero_serie: string | null; imagen_url: string | null; estado: string | null; }

/** Reposición registrada. Espejo de `material_stock_entries`. */
interface StockEntry {
  id: string; parte_id: string; cantidad: number; recibido_at: string; notas: string | null;
  proveedor: { id: string; nombre: string } | null;
}
interface Ubicacion { id: string; edificio: string; direccion: string | null; }
interface Lugar { id: string; nombre: string; ubicacion_id: string | null; }
interface Reservation {
  id: string; parte_id: string; ubicacion_id: string; lugar_id: string | null; cantidad: number;
  parte: Pick<Material, "id" | "nombre" | "codigo" | "unidad" | "imagen_url"> | null;
  lugar: Pick<Lugar, "id" | "nombre"> | null;
}
interface Withdrawal {
  id: string; parte_id: string; ubicacion_id: string; lugar_id: string | null;
  cantidad: number; cantidad_devuelta: number; retirado_at: string; ultima_devolucion_at: string | null;
  parte: Pick<Material, "id" | "nombre" | "codigo" | "unidad" | "imagen_url"> | null;
  lugar: Pick<Lugar, "id" | "nombre"> | null;
}
type StockFilter = "todos" | "agotado" | "bajo" | "ok";
/** Orden de la lista. El valor codifica campo + dirección, como en /ordenes. */
type SortOption =
  | "creacion_asc" | "creacion_desc"
  | "actualizacion_asc" | "actualizacion_desc"
  | "nombre_asc" | "nombre_desc";

/** Menú de orden agrupado por campo, igual que el desplegable de /ordenes:
 *  el grupo se despliega y dentro van las dos direcciones. */
const SORT_GROUPS: { label: string; options: { value: SortOption; label: string }[] }[] = [
  { label: "Fecha de creación", options: [
    { value: "creacion_asc",  label: "Más antiguo primero" },
    { value: "creacion_desc", label: "Más nuevo primero" },
  ] },
  { label: "Última actualización", options: [
    { value: "actualizacion_asc",  label: "Menos reciente primero" },
    { value: "actualizacion_desc", label: "Más reciente primero" },
  ] },
  { label: "Nombre", options: [
    { value: "nombre_asc",  label: "Orden ascendente" },
    { value: "nombre_desc", label: "Orden descendente" },
  ] },
];

/** Tarjetas que se pintan por tanda. La lista completa se filtra en memoria;
 *  esto solo acota cuantas tarjetas existen en el DOM a la vez. */
const VISIBLE_CHUNK = 20;

/** Activos que se muestran de una vez en la ficha del material. */
const ACTIVOS_CHUNK = 4;

function sortLabel(value: SortOption): string {
  for (const group of SORT_GROUPS) {
    const found = group.options.find(o => o.value === value);
    if (found) return `${group.label}: ${found.label}`;
  }
  return "";
}
type EditorState = { mode: "create" | "edit"; material: Material | null } | null;

const emptyForm = {
  nombre: "", descripcion: "", codigo: "", unidad: "und", precio_unitario: "",
  ubicacion_bodega: "", stock_actual: "0", stock_minimo: "0", imagen_url: "",
};

function stockState(material: Material): "agotado" | "bajo" | "ok" {
  if (Number(material.stock_actual) <= 0) return "agotado";
  if (Number(material.stock_actual) <= Number(material.stock_minimo)) return "bajo";
  return "ok";
}

function MaterialImage({ material, large = false }: { material: Pick<Material, "nombre" | "imagen_url">; large?: boolean }) {
  return (
    <div className={large ? styles.heroImage : styles.thumbnail}>
      {material.imagen_url
        ? <Image src={material.imagen_url} alt={material.nombre} fill sizes={large ? "720px" : "40px"} unoptimized />
        : <Package size={large ? 40 : 20} />}
    </div>
  );
}

export default function MaterialesPage() {
  const subscription = useSuscripcion();
  if (subscription.loading) return <Loading />;
  if (subscription.data?.plan_features && !subscription.data.plan_features.inventario) {
    return <UpgradePrompt variant="card" title="Inventario está disponible en Pro" description="Sube tu plan para gestionar materiales, stock disponible y reservas por ubicación." upgradeTo="Pro" />;
  }
  return <MaterialesPageInner />;
}

function Loading() {
  return <div className={styles.loading}><Loader2 size={20} className="animate-spin" /><span>Cargando inventario…</span></div>;
}

function MaterialesPageInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMaterialId = searchParams.get("material");
  const requestedLocationId = searchParams.get("ubicacion");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [role, setRole] = useState("tecnico");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [places, setPlaces] = useState<Lugar[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [activoLinks, setActivoLinks] = useState<ActivoVinculado[]>([]);
  const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
  const [activos, setActivos] = useState<ActivoOpcion[]>([]);
  const [compromisos, setCompromisos] = useState<Compromiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservationWarning, setReservationWarning] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");
  const [sort, setSort] = useState<SortOption>("actualizacion_desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [openSortGroup, setOpenSortGroup] = useState<string | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationFilterId, setLocationFilterId] = useState<string | null>(null);

  /**
   * Al cambiar busqueda, filtro u orden la lista es otra y hay que volver a la
   * primera tanda. Se hace ajustando el estado DURANTE el render cuando la
   * clave cambia -- el patron que React recomienda -- en vez de con un efecto:
   * un efecto pintaria primero la lista nueva con el conteo viejo y recien
   * despues la recortaria, que es un render de mas y un parpadeo.
   */
  const listKey = `${search}|${stockFilter}|${sort}|${locationFilterId ?? ""}`;

  /** Si el vacío se debe a un filtro o a que todavía no hay inventario. */
  const hayFiltrosMateriales =
    search.trim().length > 0 || stockFilter !== "todos" || locationFilterId !== null;
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (prevListKey !== listKey) {
    setPrevListKey(listKey);
    setVisibleCount(VISIBLE_CHUNK);
  }

  useEffect(() => {
    if (!sortOpen) return;
    function onDown(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sortOpen]);

  useEffect(() => {
    if (!requestedMaterialId || !materials.some((material) => material.id === requestedMaterialId)) return;
    setSelectedLocationId(null);
    setEditor(null);
    setSelectedMaterialId(requestedMaterialId);
  }, [materials, requestedMaterialId]);

  useEffect(() => {
    if (!requestedLocationId || !locations.some((location) => location.id === requestedLocationId)) return;
    setSelectedMaterialId(null);
    setEditor(null);
    setSelectedLocationId(requestedLocationId);
  }, [locations, requestedLocationId]);

  const loadData = useCallback(async (wsId: string) => {
    const sb = createClient();
    const [materialRes, locationRes, placeRes, reservationRes, withdrawalRes, activoLinkRes, stockEntryRes, activoRes, compromisoRes] = await Promise.all([
      sb.from("partes").select("id,nombre,descripcion,codigo,unidad,precio_unitario,ubicacion_bodega,stock_actual,stock_minimo,imagen_url,workspace_id,categoria,qr_code,created_at,updated_at,archivo_url,archivo_nombre,adjuntos,fabricante:fabricantes!fabricante_id(id,nombre),proveedor:proveedores!proveedor_id(id,nombre),creador:usuarios!creado_por(id,nombre),actualizador:usuarios!actualizado_por(id,nombre)").eq("workspace_id", wsId).eq("activo", true).order("nombre"),
      sb.from("ubicaciones").select("id,edificio,direccion").eq("workspace_id", wsId).eq("activa", true).order("edificio"),
      sb.from("lugares").select("id,nombre,ubicacion_id").eq("workspace_id", wsId).eq("activo", true).order("nombre"),
      sb.from("material_reservations").select("id,parte_id,ubicacion_id,lugar_id,cantidad,parte:partes!parte_id(id,nombre,codigo,unidad,imagen_url),lugar:lugares!lugar_id(id,nombre)").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      sb.from("material_withdrawals").select("id,parte_id,ubicacion_id,lugar_id,cantidad,cantidad_devuelta,retirado_at,ultima_devolucion_at,parte:partes!parte_id(id,nombre,codigo,unidad,imagen_url),lugar:lugares!lugar_id(id,nombre)").eq("workspace_id", wsId).order("retirado_at", { ascending: false }),
      // Vínculo material ↔ activo. `activo_materiales` no tiene workspace_id
      // propio, así que se acota por los activos del workspace.
      sb.from("activo_materiales").select("id,material_id,activo_id,cantidad_recomendada,activo:activos!activo_id(id,nombre,imagen_url,numero_serie,estado,workspace_id)"),
      sb.from("material_stock_entries").select("id,parte_id,cantidad,recibido_at,notas,proveedor:proveedores!proveedor_id(id,nombre)").eq("workspace_id", wsId).order("recibido_at", { ascending: false }),
      sb.from("activos").select("id,nombre,numero_serie,imagen_url,estado").eq("workspace_id", wsId).order("nombre"),
      // "Comprometidos": lo pedido por OTs que aún no se cierran. `cantidad`
      // menos lo ya utilizado es lo que sigue reservado contra el stock.
      sb.from("orden_partes").select("parte_id,cantidad,cantidad_utilizada,orden_id,ordenes_trabajo!orden_id(estado,workspace_id)"),
    ]);
    setMaterials((materialRes.data ?? []) as unknown as Material[]);
    setLocations((locationRes.data ?? []) as Ubicacion[]);
    setPlaces((placeRes.data ?? []) as Lugar[]);
    if (reservationRes.error) {
      setReservations([]); setReservationWarning(true);
    } else {
      setReservations((reservationRes.data ?? []) as unknown as Reservation[]); setReservationWarning(false);
    }
    setWithdrawals(withdrawalRes.error ? [] : (withdrawalRes.data ?? []) as unknown as Withdrawal[]);
    // El filtro por workspace se aplica acá: el join trae el activo con su
    // workspace_id y los de otros workspaces se descartan.
    setActivoLinks(activoLinkRes.error ? [] : ((activoLinkRes.data ?? []) as unknown as (ActivoVinculado & { activo: { workspace_id?: string } | null })[])
      .filter(link => link.activo?.workspace_id === wsId) as ActivoVinculado[]);
    setStockEntries(stockEntryRes.error ? [] : (stockEntryRes.data ?? []) as unknown as StockEntry[]);
    setActivos(activoRes.error ? [] : (activoRes.data ?? []) as unknown as ActivoOpcion[]);
    // El filtro por workspace y por OT abierta se hace acá: `orden_partes` no
    // tiene workspace_id propio y sólo cuentan las órdenes sin cerrar.
    setCompromisos(compromisoRes.error ? [] : ((compromisoRes.data ?? []) as unknown as
      { parte_id: string; cantidad: number; cantidad_utilizada: number | null; orden_id: string; ordenes_trabajo: { estado: string; workspace_id: string } | null }[])
      .filter(row => row.ordenes_trabajo?.workspace_id === wsId && row.ordenes_trabajo?.estado !== "completado")
      .map(row => ({ parte_id: row.parte_id, orden_id: row.orden_id, cantidad: Math.max(0, Number(row.cantidad) - Number(row.cantidad_utilizada ?? 0)) })));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from("usuarios").select("workspace_id,rol").eq("id", user.id).maybeSingle();
      if (!active || !profile?.workspace_id) return;
      setWorkspaceId(profile.workspace_id); setRole(profile.rol ?? "tecnico");
      await loadData(profile.workspace_id);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [loadData]);

  const selectedMaterial = materials.find(item => item.id === selectedMaterialId) ?? null;
  const selectedLocation = locations.find(item => item.id === selectedLocationId) ?? null;
  const canManage = role === "admin" || role === "owner" || role === "supervisor";
  const lowCount = materials.filter(item => stockState(item) !== "ok").length;

  const filteredMaterials = useMemo(() => materials.filter(material => {
    const q = search.trim().toLowerCase();
    const matches = !q || [material.nombre, material.codigo, material.ubicacion_bodega].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    const reservedAtLocation = !locationFilterId || reservations.some(item => item.ubicacion_id === locationFilterId && item.parte_id === material.id);
    return matches && reservedAtLocation && (stockFilter === "todos" || stockState(material) === stockFilter);
  }).sort((a, b) => {
    switch (sort) {
      case "nombre_asc":         return a.nombre.localeCompare(b.nombre, "es");
      case "nombre_desc":        return b.nombre.localeCompare(a.nombre, "es");
      case "creacion_asc":       return a.created_at.localeCompare(b.created_at);
      case "creacion_desc":      return b.created_at.localeCompare(a.created_at);
      case "actualizacion_asc":  return a.updated_at.localeCompare(b.updated_at);
      default:                   return b.updated_at.localeCompare(a.updated_at);
    }
  }), [locationFilterId, materials, reservations, search, sort, stockFilter]);

  const refresh = async () => { if (workspaceId) await loadData(workspaceId); };

  /**
   * Scroll infinito: al entrar el centinela en pantalla se pinta la siguiente
   * tanda. Se re-suscribe cuando cambia `visibleCount` porque el nodo se
   * desmonta al llegar al final de la lista.
   */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisibleCount(c => c + VISIBLE_CHUNK);
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, filteredMaterials.length]);

  const removeMaterial = async (material: Material) => {
    if (!window.confirm(`¿Eliminar “${material.nombre}” del inventario?`)) return;
    const sb = createClient();
    const { error } = await sb.from("partes").update({ activo: false }).eq("id", material.id);
    if (!error) { setMaterials(prev => prev.filter(item => item.id !== material.id)); setSelectedMaterialId(null); }
  };

  if (loading) return <Loading />;

  const showRight = !!(editor || selectedMaterial || selectedLocation);
  const activeRelationFilter = locationFilterId;
  return (
    <div className={styles.page}>
      {/* Toolbar — mismo lenguaje que /ordenes: barra al tono del lienzo,
          fila superior con buscador + accion primaria, fila inferior de chips
          de filtro. Ver OrdenesBandeja "Navigation header". */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>

        {/* Fila superior */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 20px", minHeight: 56, gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 520px", minWidth: 0, justifyContent: "flex-end", flexWrap: "wrap" }}>

            {/* Buscador */}
            <div style={{ position: "relative", maxWidth: 280, minWidth: 220, flex: "1 1 220px" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar materiales"
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
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar busqueda"
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Nuevo material */}
            {canManage && (
              <button
                type="button"
                onClick={() => setEditor({ mode: "create", material: null })}
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
                Nuevo material
              </button>
            )}
          </div>
        </div>

        {/* Fila de filtros — chips con el mismo alto (34), radio e icono en azul
            de marca que la FilterBar de /ordenes. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 20px", minHeight: 40, flexWrap: "wrap" }}>
          {([
            ["todos", "Todos", <Boxes size={16} key="i" />],
            ["agotado", "Agotado", <CircleAlert size={16} key="i" />],
            ["bajo", "Stock bajo", <AlertTriangle size={16} key="i" />],
            ["ok", "En stock", <Check size={16} key="i" />],
          ] as [StockFilter, string, React.ReactNode][]).map(([value, label, icon]) => {
            const active = stockFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStockFilter(value)}
                aria-pressed={active}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: 34, padding: "0 11px",
                  border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  background: active ? "var(--brand-tint)" : "var(--surface-1)",
                  color: active ? "var(--brand)" : "var(--fg-2)",
                  fontSize: 14, fontWeight: 400,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >
                <span style={{ display: "flex", color: "var(--brand)" }}>{icon}</span>
                {label}
                {active && <Check size={11} />}
              </button>
            );
          })}

          {/* Filtro por relacion (ubicacion / material). Chip con contador,
              igual que los FilterDropdown de /ordenes; el catalogo se elige en
              el dialogo existente. */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            title="Filtrar por ubicación"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 34, padding: "0 11px",
              border: activeRelationFilter ? "1.5px solid var(--brand)" : "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              background: activeRelationFilter ? "var(--brand-tint)" : "var(--surface-1)",
              color: activeRelationFilter ? "var(--brand)" : "var(--fg-2)",
              fontSize: 14, fontWeight: 400,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "flex", color: "var(--brand)" }}>
              <MapPin size={16} />
            </span>
            Ubicación
            {activeRelationFilter && (
              <span style={{ fontSize: 14, fontWeight: 400, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
            )}
          </button>

          {/* Limpiar — solo aparece cuando hay algo que limpiar, como el
              "Limpiar" de los dropdowns de /ordenes. */}
          {(activeRelationFilter || stockFilter !== "todos" || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStockFilter("todos");
                setLocationFilterId(null);
              }}
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

      {reservationWarning && <div className={styles.warning}><CircleAlert size={15} />Las reservas todavía no están habilitadas en la base de datos. Aplica la migración para usar esta sección.</div>}

      <main className={styles.main}>
        <section className={`${styles.listPane} ${showRight ? styles.mobileHidden : ""}`}>
              {/* Linea de conteo + orden — mismo patron que el trigger
                  "Mostrando: … · Orden: …" de /ordenes. */}
              <div ref={sortRef} style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setSortOpen(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    width: "100%", padding: "10px 20px",
                    background: "var(--surface-canvas)", border: "none",
                    fontSize: 14, color: "var(--fg-2)",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-canvas)"; }}
                >
                  <span style={{ color: "var(--fg-3)" }}>Ordenar por:</span>
                  <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--brand-fg)" }} title={sortLabel(sort)}>
                    {sortLabel(sort)}
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
                    {/* Grupo por campo: se despliega y muestra las dos
                        direcciones, en vez de una lista plana de seis. */}
                    {SORT_GROUPS.map(group => {
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
              </div>
              <div className={styles.list}>
                {filteredMaterials.length ? (
                  <>
                    {filteredMaterials.slice(0, visibleCount).map(material => (
                      <MaterialRow
                        key={material.id}
                        material={material}
                        selected={selectedMaterialId === material.id}
                        onClick={() => { setEditor(null); setSelectedMaterialId(material.id); }}
                      />
                    ))}
                    {visibleCount < filteredMaterials.length && (
                      <div ref={sentinelRef} style={{ padding: "14px 16px 18px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                        <Loader2 size={18} className="animate-spin" style={{ color: "var(--brand)" }} />
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={<Boxes size={38} strokeWidth={1.4} />}
                    // Antes decía siempre "no coinciden con los filtros", también
                    // con el inventario vacío y sin ningún filtro puesto.
                    title={hayFiltrosMateriales ? "Ningún material coincide con la búsqueda" : "Todavía no hay materiales"}
                    description="Un material es un repuesto o insumo del inventario: al quedar cargado se puede reservar para una orden y pedir en una orden de compra."
                    onCreate={canManage ? () => setEditor({ mode: "create", material: null }) : undefined}
                    createLabel="Crear el primero"
                    hasSearch={hayFiltrosMateriales}
                  />
                )}
              </div>
        </section>

        <section className={styles.detailPane}>
          {editor ? <MaterialEditor state={editor} workspaceId={workspaceId!} activos={activos} activoLinks={editor.material ? activoLinks.filter(link => link.material_id === editor.material!.id) : []} onClose={() => setEditor(null)} onSaved={async () => { await refresh(); setEditor(null); }} />
            : selectedMaterial ? <MaterialDetail material={selectedMaterial} reservations={reservations.filter(item => item.parte_id === selectedMaterial.id)} locations={locations} canManage={canManage} onClose={() => setSelectedMaterialId(null)} onEdit={() => setEditor({ mode: "edit", material: selectedMaterial })} onDelete={() => removeMaterial(selectedMaterial)} onOpenLocation={id => { setSelectedMaterialId(null); setSelectedLocationId(id); }} activoLinks={activoLinks.filter(link => link.material_id === selectedMaterial.id)} stockEntries={stockEntries.filter(entry => entry.parte_id === selectedMaterial.id)} onOpenActivo={id => router.push(`/activos/activos?id=${encodeURIComponent(id)}`)} onOpenActivoEstado={id => router.push(`/activos/${id}/estado`)} onRestock={() => setRestockOpen(true)} comprometido={compromisos.filter(c => c.parte_id === selectedMaterial.id).reduce((sum, c) => sum + c.cantidad, 0)} places={places} />
            : selectedLocation ? <LocationDetail location={selectedLocation} reservations={reservations.filter(item => item.ubicacion_id === selectedLocation.id)} withdrawals={withdrawals.filter(item => item.ubicacion_id === selectedLocation.id)} canManage={canManage} onClose={() => setSelectedLocationId(null)} onReserve={() => setReserveOpen(true)} onRefresh={refresh} onOpenMaterial={id => { setSelectedLocationId(null); setSelectedMaterialId(id); }} />
            : <EmptyDetail icon={<Package size={28} strokeWidth={1.5} />} title="Selecciona un material" />}
        </section>
      </main>

      {/* La barra "Configuración de OTs" vivía aquí con los mismos toggles
          (requiere_materiales_global / requiere_hoja_global) que ya expone
          /requisitos, que además maneja la exclusión mutua entre módulos.
          Se eliminó para no tener dos lugares editando la misma configuración. */}

      {restockOpen && selectedMaterial && <RestockDialog material={selectedMaterial} onClose={() => setRestockOpen(false)} onSaved={async () => { await refresh(); setRestockOpen(false); }} />}
      {reserveOpen && selectedLocation && <ReservationDialog location={selectedLocation} materials={materials.filter(item => Number(item.stock_actual) > 0)} places={places.filter(item => item.ubicacion_id === selectedLocation.id)} onClose={() => setReserveOpen(false)} onSaved={async () => { await refresh(); setReserveOpen(false); }} />}
      {filterOpen && <InventoryFilterDialog segment="materiales" locations={locations} materials={materials} selectedId={activeRelationFilter} onSelect={id => { setLocationFilterId(id); setFilterOpen(false); }} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  icono como unico portador del color. Misma pieza que RowBadge en OTRow. */
function RowBadge({ icon: Icon, iconColor, children }: { icon?: React.ElementType; iconColor?: string; children: React.ReactNode }) {
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
      {Icon && <Icon size={14} color={iconColor ?? "var(--fg-3)"} strokeWidth={2.25} style={{ display: "block", flexShrink: 0 }} />}
      {children}
    </span>
  );
}

/** Estilo de tarjeta compartido por materiales y ubicaciones. Igual que
 *  ActivoRow y OTRow: tarjeta sobre el lienzo, alto fijo de 108 y seleccion con
 *  acento de 3px hacia adentro para que el contenido no se desplace. */
function cardStyle(selected: boolean): React.CSSProperties {
  return {
    // 88px y no 108: la miniatura bajó de 76 a 32px y el resto era aire.
    width: "100%", height: 88, flexShrink: 0, boxSizing: "border-box",
    display: "flex", gap: 12, alignItems: "center",
    padding: "14px 20px",
    background: selected ? "var(--brand-tint)" : "var(--surface-1)",
    border: `1px solid ${selected ? "var(--brand)" : "var(--border)"}`,
    borderRadius: "var(--r-lg)",
    boxShadow: selected ? "inset 3px 0 0 0 var(--brand)" : "none",
    color: "var(--fg-1)", textAlign: "left", fontFamily: "inherit", cursor: "pointer",
    transition: "background var(--dur-fast) var(--ease)",
  };
}

/** Miniatura de la tarjeta. Ocupa el alto del bloque de texto, no un cuadrado
 *  suelto, para que la tarjeta lea como una unidad — igual que en ActivoRow. */
function RowThumb({ src, fallback }: { src: string | null; fallback: React.ReactNode }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: "var(--r-md)", objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--brand-tint)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", flexShrink: 0 }}>
      {fallback}
    </span>
  );
}

const STOCK_BADGE: Record<"agotado" | "bajo" | "ok", { label: string; icon: React.ElementType; color: string }> = {
  agotado: { label: "Agotado",    icon: CircleAlert,   color: "var(--danger)"  },
  bajo:    { label: "Stock bajo", icon: AlertTriangle, color: "var(--warning)" },
  ok:      { label: "En stock",   icon: Check,         color: "var(--success)" },
};

function MaterialRow({ material, selected, onClick }: { material: Material; selected: boolean; onClick: () => void }) {
  const state = stockState(material);
  const badge = STOCK_BADGE[state];
  return (
    <button
      type="button"
      onClick={onClick}
      style={cardStyle(selected)}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "var(--surface-1)"; }}
    >
      <RowThumb src={material.imagen_url} fallback={<Package size={16} />} />

      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 400, lineHeight: 1.35, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {material.nombre}
        </span>
        <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[material.codigo, material.ubicacion_bodega].filter(Boolean).join(" · ") || "Sin código"}
        </span>
        {/* `nowrap` + `overflow: hidden`: si las etiquetas se envolvieran, la
            tarjeta creceria y se romperia la altura uniforme. */}
        <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", overflow: "hidden" }}>
          <RowBadge icon={badge.icon} iconColor={badge.color}>{badge.label}</RowBadge>
          <RowBadge icon={Boxes} iconColor="var(--brand)">
            {Number(material.stock_actual).toLocaleString("es-CL")} {material.unidad}
          </RowBadge>
        </span>
      </span>
    </button>
  );
}

// Estado del activo — mismos textos y colores que la bandeja de activos y que
// OTDetail: el estado de un equipo tiene que leerse igual esté donde esté.
const ACTIVO_ESTADO_LABEL: Record<string, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

const ACTIVO_ESTADO_COLOR: Record<string, string> = {
  operativo: "var(--success)",
  fuera_servicio: "var(--danger)",
  // Naranja pleno y no `--warning`: ese token es un ámbar oscuro pensado para
  // texto y como relleno de un punto se ve marrón.
  mantencion: "#F59E0B",
  baja: "var(--st-cancel-dot)",
};

function activoEstadoLabel(e: string | null | undefined) {
  return ACTIVO_ESTADO_LABEL[e ?? ""] ?? e ?? "Sin estado";
}
function activoEstadoColor(e: string | null | undefined) {
  return ACTIVO_ESTADO_COLOR[e ?? ""] ?? "var(--fg-4)";
}

function DetailBadge({ icon: Icon, iconColor, children }: { icon?: React.ElementType; iconColor?: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      minHeight: 24, padding: "0 9px",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-sm)",
      background: "var(--surface-1)",
      color: "var(--fg-1)",
      fontSize: 14, fontWeight: 400, whiteSpace: "nowrap",
    }}>
      {Icon && <Icon size={15} color={iconColor ?? "var(--fg-3)"} strokeWidth={2.25} style={{ display: "block", flexShrink: 0 }} />}
      {children}
    </span>
  );
}

/** Barra de acciones fija del detalle. Calcada de la cabecera de OTDetail:
 *  botones cuadrados de 34, icono en azul de marca, "Editar" en solido. */
function DetailHeader({ title, badge, onClose, onEdit, onDelete, extra }: {
  /** Titulo de la ficha. Va en la cabecera fija, a la izquierda, para que siga
   *  visible al desplazar el cuerpo. */
  title: string;
  /** Codigo / numero, en monoespaciado junto al titulo. */
  badge?: string | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  extra?: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const iconBtn: React.CSSProperties = {
    width: 34, height: 34, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    background: "var(--surface-1)", cursor: "pointer",
  };
  return (
    <div style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 28px" }}>
        {/* El codigo va ENCIMA del titulo, no al lado: es el mismo orden que
            usa OTDetail con el chip "OT #". */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          {badge && (
            <span style={{ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 9px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontWeight: 400, fontFamily: "var(--font-mono)", flexShrink: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {badge}
            </span>
          )}
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: 0, lineHeight: 1.3, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </h1>
        </div>
        {extra}
        {onEdit && (
          <button
            type="button" onClick={onEdit}
            style={{ flexShrink: 0, height: 34, padding: "0 13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit" }}
            onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
          >
            <Pencil size={14} />
            Editar
          </button>
        )}
        {/* Eliminar vive dentro del menu de acciones, no suelto en la barra:
            mismo criterio que OTDetail, donde una accion irreversible no se
            deja a un clic de distancia del boton de editar. */}
        {onDelete && (
          <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              title="Más acciones" aria-label="Más acciones"
              aria-haspopup="menu" aria-expanded={menuOpen}
              style={{ ...iconBtn, color: "var(--fg-1)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
                  background: "var(--surface-1)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-sm)",
                  width: 190, overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 12px", background: "var(--surface-1)", border: "none",
                    cursor: "pointer", fontSize: 14, color: "var(--danger)",
                    fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Titulo de seccion del detalle. Mismo tratamiento que en OTDetail: 14/400 en
 *  --fg-1, sin mayusculas ni negrita. */
function DetailSectionTitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>{children}</p>;
}

/** Bloque a sangre completa con linea inferior. Los margenes negativos sacan la
 *  regla hasta el borde y el padding devuelve el texto a su sitio, igual que en
 *  el cuerpo de OTDetail (que tiene 28 de padding lateral). */
function DetailBlock({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      minWidth: 0,
      marginLeft: -28, marginRight: -28,
      paddingLeft: 28, paddingRight: 28,
      paddingTop: 16, paddingBottom: 16,
      borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}

/** Par etiqueta / valor dentro de un bloque. */
function DetailField({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 400, color: danger ? "var(--danger)" : "var(--fg-1)", margin: 0, overflowWrap: "break-word" }}>{value}</p>
    </div>
  );
}

/** Iniciales para el avatar, igual que en OTDetail. */
function initials(n: string) {
  const parts = n.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Linea de auditoria: avatar de 30 + nombre · fecha. */
function AuditLine({ label, usuario, fecha }: {
  label: string;
  usuario: { id: string; nombre: string } | null;
  fecha: string;
}) {
  const cuando = new Date(fecha).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: "50%",
          background: usuario
            ? "linear-gradient(135deg, var(--brand-active), var(--brand))"
            : "var(--surface-hover)",
          color: usuario ? "var(--fg-on-brand)" : "var(--fg-4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 400, flexShrink: 0,
        }}>
          {usuario ? initials(usuario.nombre) : <User size={15} />}
        </span>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
          {usuario ? `${usuario.nombre} · ${cuando}` : cuando}
        </span>
      </div>
    </div>
  );
}

function MaterialDetail({ material, reservations, locations, activoLinks, stockEntries, canManage, onClose, onEdit, onDelete, onOpenLocation, onOpenActivo, onOpenActivoEstado, onRestock, comprometido, places }: { material: Material; reservations: Reservation[]; locations: Ubicacion[]; activoLinks: ActivoVinculado[]; stockEntries: StockEntry[]; canManage: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenLocation: (id: string) => void; onOpenActivo: (id: string) => void; onOpenActivoEstado: (id: string) => void; onRestock: () => void; comprometido: number; places: Lugar[] }) {
  const state = stockState(material);
  const badge = STOCK_BADGE[state];
  const reservado = reservations.reduce((sum, item) => sum + Number(item.cantidad), 0);
  // Lo realmente libre: lo que hay menos lo apartado y lo ya comprometido.
  const disponible = Number(material.stock_actual) - reservado - comprometido;
  /** Activos visibles. Se muestran de a 4 para que la sección no empuje al
   *  resto de la ficha fuera de pantalla cuando un repuesto sirve a decenas
   *  de equipos; "Ver más" agrega otra tanda de 4. */
  const [activosVisibles, setActivosVisibles] = useState(ACTIVOS_CHUNK);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>
      <DetailHeader
        title={material.nombre}
        badge={material.codigo || null}
        onClose={onClose}
        onEdit={canManage ? onEdit : undefined}
        onDelete={canManage ? onDelete : undefined}
        extra={canManage && (
          <button
            type="button" onClick={onRestock}
            style={{ flexShrink: 0, height: 34, padding: "0 13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, fontFamily: "inherit", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
          >
            <PackagePlus size={16} style={{ color: "var(--brand)" }} />
            Reponer
          </button>
        )}
      />

      {/* Cuerpo — el unico contenedor con scroll, como en OTDetail. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ padding: "0 28px 76px", display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Metadatos. El titulo y el codigo viven en la cabecera fija. */}
          <DetailBlock>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "7px 12px", color: "var(--fg-3)", fontSize: 14 }}>
              {material.ubicacion_bodega && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={15} />{material.ubicacion_bodega}</span>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Boxes size={15} />
                {Number(material.stock_actual).toLocaleString("es-CL")} {material.unidad}
              </span>
              <DetailBadge icon={badge.icon} iconColor={badge.color}>{badge.label}</DetailBadge>
            </div>
          </DetailBlock>

          {/* Imagen */}
          {material.imagen_url && (
            <DetailBlock>
              <DetailSectionTitle>Imagen</DetailSectionTitle>
              <div style={{ position: "relative", width: "100%", maxWidth: 320, aspectRatio: "4 / 3", borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-1)" }}>
                <Image src={material.imagen_url} alt={material.nombre} fill sizes="320px" style={{ objectFit: "contain" }} unoptimized />
              </div>
            </DetailBlock>
          )}

          {/* Descripcion */}
          {material.descripcion && (
            <DetailBlock>
              <DetailSectionTitle>Descripción</DetailSectionTitle>
              <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>
                {material.descripcion}
              </p>
            </DetailBlock>
          )}

          {/* Stock — el desglose de la ficha: lo que hay, lo que está apartado
              en ubicaciones, lo que piden las OTs abiertas, y lo que queda
              realmente disponible. */}
          <DetailBlock>
            <DetailSectionTitle>Stock</DetailSectionTitle>
            {/* 3 columnas x 2 filas, llenando por columna: los seis campos
                quedan apilados de a dos (2-2-2) en vez de en una sola línea. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gridTemplateRows: "repeat(2, auto)", gridAutoFlow: "column", gap: "16px 24px" }}>
              <DetailField label="En existencia" value={`${Number(material.stock_actual).toLocaleString("es-CL")} ${material.unidad}`} />
              <DetailField label="Asignado" value={`${reservado.toLocaleString("es-CL")} ${material.unidad}`} />
              <DetailField label="Comprometidos" value={`${comprometido.toLocaleString("es-CL")} ${material.unidad}`} />
              <DetailField
                label="Disponible"
                value={`${disponible.toLocaleString("es-CL")} ${material.unidad}`}
                danger={disponible <= 0}
              />
              <DetailField label="Mínimo en existencia" value={`${Number(material.stock_minimo).toLocaleString("es-CL")} ${material.unidad}`} />
              <DetailField
                label="Precio unitario"
                value={material.precio_unitario != null
                  ? Number(material.precio_unitario).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
                  : "Sin precio"}
              />
            </div>

          </DetailBlock>

          {/* Activos que usan este material. Es lo que convierte el
              inventario en un catálogo de repuestos: desde la parte se llega
              al equipo al que sirve. */}
          {/* Activos que usan este material. Misma tarjeta que ActivoSection en
              OTDetail: fondo --surface-1, miniatura de 34 y el estado del
              equipo a la derecha. La vinculación se hace en crear/editar. */}
          {activoLinks.length > 0 && (
            <DetailBlock>
              <DetailSectionTitle>Activos ({activoLinks.length})</DetailSectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activoLinks.slice(0, activosVisibles).map(link => (
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
                        cambie de alto según haya imagen o no. */}
                    {link.activo?.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={link.activo.imagen_url}
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
                      onClick={() => onOpenActivo(link.activo_id)}
                      title={link.activo?.nombre}
                      style={{
                        flex: 1, minWidth: 0, textAlign: "left",
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        // Tinta normal, no azul de enlace: la fila entera ya se
                        // lee como algo en lo que se puede entrar.
                        fontFamily: "inherit", fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {link.activo?.nombre ?? "Activo"}
                    </button>

                    {/* Estado del equipo. Cambiarlo necesita saber si la parada
                        fue planificada o imprevista y desde cuándo, y esas dos
                        preguntas no caben acá: el botón lleva a la pantalla de
                        estado del activo, que es donde se responden. */}
                    <button
                      type="button"
                      onClick={() => onOpenActivoEstado(link.activo_id)}
                      title={`Cambiar estado de ${link.activo?.nombre ?? "el activo"}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
                        height: 30, padding: "0 10px",
                        background: "var(--surface-1)", border: "1px solid var(--border)",
                        borderRadius: "var(--r-sm)", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 14, color: "var(--fg-1)",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: activoEstadoColor(link.activo?.estado), flexShrink: 0 }} />
                      {activoEstadoLabel(link.activo?.estado)}
                      <ChevronDown size={13} style={{ color: "var(--fg-4)" }} />
                    </button>
                  </div>
                ))}
              </div>

              {activosVisibles < activoLinks.length && (
                <button
                  type="button"
                  onClick={() => setActivosVisibles(n => n + ACTIVOS_CHUNK)}
                  style={{
                    marginTop: 10, padding: 0,
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 14, fontWeight: 400,
                    color: "var(--brand-fg)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Plus size={14} />
                  Ver más ({activoLinks.length - activosVisibles})
                </button>
              )}
            </DetailBlock>
          )}

          {/* Identificación: fabricante, proveedor, categoría y código QR. */}
          {(material.fabricante || material.proveedor || material.categoria || material.qr_code) && (
            <DetailBlock>
              <DetailSectionTitle>Identificación</DetailSectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px 24px" }}>
                {material.fabricante && <DetailField label="Fabricante" value={material.fabricante.nombre} />}
                {material.proveedor && <DetailField label="Proveedor" value={material.proveedor.nombre} />}
                {material.categoria && <DetailField label="Categoría" value={material.categoria} />}
                {material.qr_code && <DetailField label="Código QR / de barras" value={material.qr_code} />}
              </div>
            </DetailBlock>
          )}

          {/* Archivos adjuntos */}
          {material.adjuntos.length > 0 && (
            <DetailBlock>
              <DetailSectionTitle>Archivos adjuntos</DetailSectionTitle>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                {material.adjuntos.map((a, idx) => (
                  <a
                    key={`${a.url}-${idx}`} href={a.url} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-0)", textDecoration: "none", color: "var(--fg-1)", maxWidth: "100%" }}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--brand)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <FileText size={16} />
                    </span>
                    <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.nombre}
                    </span>
                    <ExternalLink size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            </DetailBlock>
          )}

          {/* Historial de reposiciones */}
          {stockEntries.length > 0 && (
            <DetailBlock>
              <DetailSectionTitle>Reposiciones</DetailSectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stockEntries.map(entry => (
                  <div
                    key={entry.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)" }}
                  >
                    <PackagePlus size={15} style={{ color: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
                        +{Number(entry.cantidad).toLocaleString("es-CL")} {material.unidad}
                        {entry.proveedor && <span style={{ color: "var(--fg-3)" }}> · {entry.proveedor.nombre}</span>}
                      </span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)" }}>
                        {new Date(entry.recibido_at).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      {entry.notas && (
                        <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)", whiteSpace: "pre-wrap" }}>
                          {entry.notas}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </DetailBlock>
          )}

          {/* Ubicación — dónde está repartido el material. Es la misma
              información que la lista anterior, pero como tabla: la unidad de
              comparación es la ubicación, no la reserva suelta. */}
          {reservations.length > 0 && (
            <DetailBlock last>
              <DetailSectionTitle>Ubicación</DetailSectionTitle>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 460, borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      {["Ubicación", "Área", "Unidades en existencia", "Mínimo en existencia"].map(h => (
                        <th key={h} style={{ textAlign: "left", fontWeight: 400, color: "var(--fg-3)", padding: "0 12px 8px 0", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map(item => {
                      const location = locations.find(value => value.id === item.ubicacion_id);
                      const lugar = item.lugar?.nombre ?? places.find(pl => pl.id === item.lugar_id)?.nombre ?? "General";
                      return (
                        <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px 10px 0" }}>
                            <button
                              type="button"
                              onClick={() => onOpenLocation(item.ubicacion_id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--brand-fg)" }}
                            >
                              <MapPin size={15} style={{ flexShrink: 0 }} />
                              {location?.edificio ?? "Ubicación"}
                            </button>
                          </td>
                          <td style={{ padding: "10px 12px 10px 0", color: "var(--fg-2)" }}>{lugar}</td>
                          <td style={{ padding: "10px 12px 10px 0", color: "var(--fg-1)" }}>
                            {Number(item.cantidad).toLocaleString("es-CL")} {material.unidad}
                          </td>
                          <td style={{ padding: "10px 12px 10px 0", color: "var(--fg-3)" }}>
                            {Number(material.stock_minimo).toLocaleString("es-CL")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </DetailBlock>
          )}

          {/* Pie: quien creo y quien actualizo, con avatar — mismo formato que
              "Creado por" en OTDetail. Los materiales anteriores a la columna
              de auditoria no tienen autor, y ahi solo va la fecha. */}
          <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <AuditLine
              label="Creado"
              usuario={material.creador}
              fecha={material.created_at}
            />
            <AuditLine
              label="Última actualización"
              usuario={material.actualizador}
              fecha={material.updated_at}
            />
          </div>

        </div>
      </div>
    </div>
  );
}

function LocationDetail({ location, reservations, withdrawals, canManage, onClose, onReserve, onRefresh, onOpenMaterial }: { location: Ubicacion; reservations: Reservation[]; withdrawals: Withdrawal[]; canManage: boolean; onClose: () => void; onReserve: () => void; onRefresh: () => Promise<void>; onOpenMaterial: (id: string) => void }) {
  const release = async (reservation: Reservation) => {
    if (!window.confirm(`¿Devolver ${reservation.cantidad} ${reservation.parte?.unidad ?? "unidades"} al inventario disponible?`)) return;
    const sb = createClient();
    const { error } = await sb.rpc("release_material_reservation", { p_reservation_id: reservation.id, p_cantidad: reservation.cantidad });
    if (error) window.alert(error.message); else await onRefresh();
  };
  const consume = async (reservation: Reservation) => {
    if (!window.confirm(`¿Marcar ${reservation.cantidad} ${reservation.parte?.unidad ?? "unidades"} como retirado? No volverá al stock disponible.`)) return;
    const sb = createClient();
    const { error } = await sb.rpc("consume_material_reservation", { p_reservation_id: reservation.id, p_cantidad: reservation.cantidad });
    if (error) window.alert(error.message); else await onRefresh();
  };
  const returnWithdrawal = async (withdrawal: Withdrawal) => {
    const pending = Number(withdrawal.cantidad) - Number(withdrawal.cantidad_devuelta);
    if (!window.confirm(`¿Devolver ${pending} ${withdrawal.parte?.unidad ?? "unidades"} al stock disponible? El retiro seguirá en el historial.`)) return;
    const sb = createClient();
    const { error } = await sb.rpc("return_material_withdrawal", { p_withdrawal_id: withdrawal.id, p_cantidad: pending });
    if (error) window.alert(error.message); else await onRefresh();
  };
  const date = (value: string) => new Date(value).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>
      <DetailHeader
        title={location.edificio}
        onClose={onClose}
        extra={canManage && (
          <button
            type="button" onClick={onReserve}
            style={{ flexShrink: 0, height: 34, padding: "0 13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit" }}
            onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
          >
            <Plus size={14} />
            Reservar
          </button>
        )}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ padding: "0 28px 76px", display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Metadatos. El titulo vive en la cabecera fija. */}
          <DetailBlock>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "7px 12px", color: "var(--fg-3)", fontSize: 14 }}>
              {location.direccion && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={15} />{location.direccion}</span>
              )}
              <DetailBadge icon={Package} iconColor={reservations.length ? "var(--brand)" : "var(--fg-4)"}>
                {reservations.length
                  ? `${reservations.length} material${reservations.length === 1 ? "" : "es"} reservado${reservations.length === 1 ? "" : "s"}`
                  : "Sin materiales reservados"}
              </DetailBadge>
            </div>
          </DetailBlock>

          {/* Inventario reservado */}
          <DetailBlock last={withdrawals.length === 0}>
            <DetailSectionTitle>Inventario reservado</DetailSectionTitle>
            {reservations.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reservations.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px",
                      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                      background: "var(--surface-1)",
                    }}
                  >
                    <RowThumb src={item.parte?.imagen_url ?? null} fallback={<Package size={20} />} />
                    <button
                      type="button"
                      onClick={() => onOpenMaterial(item.parte_id)}
                      style={{ flex: 1, minWidth: 0, display: "block", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--fg-1)" }}
                    >
                      <span style={{ display: "block", fontSize: 14, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.parte?.nombre ?? "Material"}
                      </span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.lugar?.nombre ?? "Ubicación general"} · {Number(item.cantidad).toLocaleString("es-CL")} {item.parte?.unidad}
                      </span>
                    </button>
                    {canManage && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          type="button" onClick={() => consume(item)}
                          style={{ height: 34, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                        >
                          <PackageCheck size={16} style={{ color: "var(--brand)" }} />
                          Retirado
                        </button>
                        <button
                          type="button" onClick={() => release(item)}
                          style={{ height: 34, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                        >
                          <RotateCcw size={16} style={{ color: "var(--danger)" }} />
                          Devolver
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={<Package size={34} />} title="Sin materiales reservados" subtitle="Reserva materiales disponibles para esta ubicación." />
            )}
          </DetailBlock>

          {/* Historial de retiros */}
          {withdrawals.length > 0 && (
            <DetailBlock last>
              <DetailSectionTitle>Historial de retiros</DetailSectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {withdrawals.map(item => {
                  const pending = Number(item.cantidad) - Number(item.cantidad_devuelta);
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px",
                        border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                        background: "var(--surface-1)",
                      }}
                    >
                      <RowThumb src={item.parte?.imagen_url ?? null} fallback={<Package size={20} />} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.parte?.nombre ?? "Material"}
                        </span>
                        <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)" }}>
                          Retirado el {date(item.retirado_at)}
                        </span>
                        <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-3)" }}>
                          {item.lugar?.nombre ?? "Ubicación general"} · {pending > 0 ? `${pending} ${item.parte?.unidad ?? ""} fuera de inventario` : "Devuelto completamente"}
                        </span>
                        {item.ultima_devolucion_at && (
                          <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-4)" }}>
                            Última devolución: {date(item.ultima_devolucion_at)}
                          </span>
                        )}
                      </span>
                      <DetailBadge icon={Boxes} iconColor="var(--brand)">
                        {Number(item.cantidad).toLocaleString("es-CL")} {item.parte?.unidad}
                      </DetailBadge>
                      {canManage && pending > 0 && (
                        <button
                          type="button" onClick={() => returnWithdrawal(item)}
                          style={{ flexShrink: 0, height: 34, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                        >
                          <RotateCcw size={16} style={{ color: "var(--danger)" }} />
                          Devolver
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </DetailBlock>
          )}

        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className={styles.infoSection}><h3>{title}</h3><div className={styles.infoCard}>{children}</div></section>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className={styles.infoRow}><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <div className={styles.empty}>{icon}<strong>{title}</strong><span>{subtitle}</span></div>; }

/** Selector de activos: buscador con los elegidos como fichas adentro y un
 *  desplegable con casillas. Mismo patron que `TokenSearch` en los filtros de
 *  /ordenes -- ver lo seleccionado sin cerrar el panel evita el problema del
 *  contador solo ("3" no dice *cuales* tres). */
function ActivoPicker({ activos, selected, onToggle }: {
  activos: ActivoOpcion[];
  selected: { activo_id: string; cantidad: number; existingId?: string }[];
  onToggle: (activoId: string) => void;
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
  const shown = activos.filter(a =>
    !q || a.nombre.toLowerCase().includes(q) || (a.numero_serie ?? "").toLowerCase().includes(q));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Campo con fichas */}
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4,
          minHeight: 40, padding: "4px 8px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8, background: "var(--surface-1)", cursor: "text",
        }}
      >
        {selected.map(sel => {
          const activo = activos.find(a => a.id === sel.activo_id);
          return (
            <span
              key={sel.activo_id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 220,
                padding: "2px 4px 2px 7px", borderRadius: 4,
                background: "var(--brand-tint)", color: "var(--brand)", fontSize: 14,
              }}
            >
              <Package size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activo?.nombre ?? "Activo"}
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onToggle(sel.activo_id); }}
                aria-label={`Quitar ${activo?.nombre ?? "activo"}`}
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.7 }}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length ? "" : "Buscar activo…"}
          style={{ flex: 1, minWidth: 90, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit", height: 30 }}
        />
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          aria-label={open ? "Cerrar lista" : "Abrir lista"}
          style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 2, cursor: "pointer", flexShrink: 0 }}
        >
          <ChevronDown size={16} color="var(--brand-fg)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
      </div>

      {/* Desplegable con casillas */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "2px 0 6px" }}>
            {shown.map(a => {
              const active = selected.some(sel => sel.activo_id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => onToggle(a.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0,
                    padding: "8px 12px", background: active ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  {a.imagen_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.imagen_url} alt="" style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", objectFit: "cover", flexShrink: 0 }} />
                    : <span style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Package size={15} /></span>}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: active ? "var(--brand)" : "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.nombre}
                  </span>
                  {/* Casilla: el estado NO seleccionado tambien tiene que verse. */}
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

/** Estilo de campo compartido, identico a `otInputStyle` en ActivosBandeja. */
const otInputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, color: "var(--fg-1)", outline: "none",
  fontFamily: "inherit", background: "var(--surface-1)", boxSizing: "border-box",
};

/** Fila de formulario: icono de marca a la izquierda, etiqueta y control.
 *  Misma pieza que FieldRow en ActivosBandeja. */
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

/** Crear / editar material. Calcado del ActivoForm de /activos: cabecera de
 *  64px con titulo de 20px, cuerpo con titulo subrayado + descripcion, zona de
 *  imagen arrastrable, filas FieldRow y pie con Cancelar / Guardar. */
function MaterialEditor({ state, workspaceId, activos, activoLinks, onClose, onSaved }: { state: NonNullable<EditorState>; workspaceId: string; activos: ActivoOpcion[]; activoLinks: ActivoVinculado[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const material = state.material;
  const [form, setForm] = useState({ ...emptyForm, ...(material ? { nombre: material.nombre, descripcion: material.descripcion ?? "", codigo: material.codigo, unidad: material.unidad, precio_unitario: material.precio_unitario?.toString() ?? "", ubicacion_bodega: material.ubicacion_bodega ?? "", stock_actual: material.stock_actual.toString(), stock_minimo: material.stock_minimo.toString(), imagen_url: material.imagen_url ?? "" } : {}) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverImage, setDragOverImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>(() => material?.adjuntos ?? []);
  const [uploadingAdjunto, setUploadingAdjunto] = useState(false);
  const adjuntoInputRef = useRef<HTMLInputElement>(null);
  /**
   * Activos vinculados, editados como borrador y confirmados al guardar.
   *
   * `activo_materiales` es una tabla aparte, así que se calcula el diff contra
   * lo que había: se insertan los nuevos y se borran los quitados. Escribir en
   * el momento de cada clic dejaría vínculos creados aunque el usuario después
   * cancelara el formulario.
   */
  const [links, setLinks] = useState<{ activo_id: string; cantidad: number; existingId?: string }[]>(
    () => activoLinks.map(l => ({ activo_id: l.activo_id, cantidad: Number(l.cantidad_recomendada), existingId: l.id })),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  /**
   * La imagen se sube apenas se elige, igual que en ActivoForm, y `imagen_url`
   * solo llega a guardar la URL definitiva de R2.
   *
   * Antes se guardaba `URL.createObjectURL(file)` como vista previa dentro del
   * mismo campo que se persiste, y la subida se ignoraba si fallaba. Cuando eso
   * pasaba, la fila terminaba con una `blob:http://localhost…` en la base: un
   * puntero a la memoria de una pestaña que ya se cerró, así que la imagen se
   * veía rota para siempre y para todos. Un blob nunca puede tocar el payload.
   */
  const takeImage = async (next: File | undefined) => {
    if (!next) return;
    setUploadingImage(true); setError(null);
    try {
      set("imagen_url", await uploadToR2(next, "partes"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploadingImage(false);
    }
  };

  const pickAdjuntos = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingAdjunto(true); setError(null);
    try {
      const subidos: Adjunto[] = [];
      for (const file of files) {
        const url = await uploadToR2(file, "partes/adjuntos");
        subidos.push({
          url,
          nombre: file.name,
          tipo: file.type.startsWith("image/") ? "foto" : "archivo",
          mime: file.type || null,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
      }
      setAdjuntos(prev => [...prev, ...subidos]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el adjunto.");
    } finally {
      setUploadingAdjunto(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true); setError(null);
    const sb = createClient();
    const imageUrl = form.imagen_url || null;
    const payload = { workspace_id: workspaceId, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, codigo: form.codigo.trim(), unidad: form.unidad || "und", precio_unitario: form.precio_unitario ? Number(form.precio_unitario) : null, ubicacion_bodega: form.ubicacion_bodega.trim() || null, stock_actual: Number(form.stock_actual) || 0, stock_minimo: Number(form.stock_minimo) || 0, imagen_url: imageUrl, adjuntos, activo: true };
    const { data: { user } } = await sb.auth.getUser();
    const result = state.mode === "create"
      ? await sb.from("partes").insert({ ...payload, creado_por: user?.id ?? null }).select("id").single()
      : await sb.from("partes").update(payload).eq("id", material!.id).select("id").single();
    if (result.error) { setError(result.error.message); setSaving(false); return; }

    // Vínculos con activos: se insertan los añadidos y se borran los quitados.
    const parteId = (result.data as { id: string }).id;
    const removed = activoLinks.filter(prev => !links.some(l => l.existingId === prev.id));
    const added = links.filter(l => !l.existingId);
    if (removed.length > 0) {
      const { error: delError } = await sb.from("activo_materiales").delete().in("id", removed.map(l => l.id));
      if (delError) { setError(delError.message); setSaving(false); return; }
    }
    if (added.length > 0) {
      const { error: insError } = await sb.from("activo_materiales").insert(
        added.map(l => ({ material_id: parteId, activo_id: l.activo_id, cantidad_recomendada: l.cantidad })),
      );
      if (insError) { setError(insError.message); setSaving(false); return; }
    }
    await onSaved();
  };

  const isCreate = state.mode === "create";
  const canSave = form.nombre.trim().length > 0 && !saving;

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
          {isCreate ? "Nuevo Material" : "Editar Material"}
        </h2>
        <button
          type="button" onClick={onClose} aria-label="Cerrar"
          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", cursor: "pointer", color: "var(--fg-3)" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Cuerpo desplazable */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "28px 28px 40px", maxWidth: 1180 }}>

          {/* Titulo */}
          <div style={{ marginBottom: 24 }}>
            <input
              type="text"
              placeholder="Registra el nombre del material"
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

          {/* Descripcion */}
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

          {/* Imagenes — zona de arrastre. Vacia ocupa todo el ancho; con imagen
              se encoge a un tile junto a la miniatura. */}
          <div style={{ padding: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 8 }}>
              <span style={{ width: 16, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}><ImagePlus size={16} /></span>
              Imágenes
            </div>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { const next = e.target.files?.[0]; e.target.value = ""; void takeImage(next); }} />
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, paddingLeft: 22 }}>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploadingImage}
                onDragOver={e => { e.preventDefault(); if (!uploadingImage) setDragOverImage(true); }}
                onDragLeave={() => setDragOverImage(false)}
                onDrop={e => { e.preventDefault(); setDragOverImage(false); if (!uploadingImage) void takeImage(Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"))); }}
                style={{
                  flex: form.imagen_url ? "0 0 132px" : 1,
                  minHeight: form.imagen_url ? 108 : 96,
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
                  : <ImagePlus size={16} style={{ color: "var(--brand)" }} />}
                <span style={{ textAlign: "center", lineHeight: 1.35 }}>
                  {uploadingImage ? "Subiendo…" : form.imagen_url ? "Reemplazar" : "Agregue o arrastre imágenes"}
                </span>
              </button>

              {form.imagen_url && (
                <div style={{ position: "relative", flex: "0 0 132px", minHeight: 108, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imagen_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button
                    type="button"
                    onClick={() => set("imagen_url", "")}
                    title="Quitar imagen" aria-label="Quitar imagen"
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

          {/* Activos a los que sirve este material. Es lo que convierte el
              inventario en un catálogo de repuestos: la parte se declara acá,
              junto al resto de sus datos, y la ficha sólo la muestra. */}
          <FieldRow icon={<Package size={16} />} label="Activos">
            <ActivoPicker
              activos={activos}
              selected={links}
              onToggle={activoId => setLinks(prev => prev.some(l => l.activo_id === activoId)
                ? prev.filter(l => l.activo_id !== activoId)
                : [...prev, { activo_id: activoId, cantidad: 1 }])}
            />
          </FieldRow>

          <FieldRow icon={<Hash size={16} />} label="Código">
            <input
              type="text"
              placeholder="Introduce el código"
              value={form.codigo}
              onChange={e => set("codigo", e.target.value)}
              style={{ ...otInputStyle, fontFamily: "monospace" }}
            />
          </FieldRow>

          <FieldRow icon={<Ruler size={16} />} label="Unidad">
            <input
              type="text"
              placeholder="Ej: und, m, kg"
              value={form.unidad}
              onChange={e => set("unidad", e.target.value)}
              style={otInputStyle}
            />
          </FieldRow>

          <FieldRow icon={<Boxes size={16} />} label="Stock actual">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={form.stock_actual}
              onChange={e => set("stock_actual", e.target.value.replace(/[^0-9]/g, ""))}
              style={otInputStyle}
            />
          </FieldRow>

          <FieldRow icon={<AlertTriangle size={16} />} label="Stock mínimo">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={form.stock_minimo}
              onChange={e => set("stock_minimo", e.target.value.replace(/[^0-9]/g, ""))}
              style={otInputStyle}
            />
          </FieldRow>

          <FieldRow icon={<MapPin size={16} />} label="Ubicación en bodega">
            <input
              type="text"
              placeholder="Ej: Estante A3"
              value={form.ubicacion_bodega}
              onChange={e => set("ubicacion_bodega", e.target.value)}
              style={otInputStyle}
            />
          </FieldRow>

          <FieldRow icon={<DollarSign size={16} />} label="Precio unitario">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 12500"
              value={form.precio_unitario}
              onChange={e => set("precio_unitario", e.target.value.replace(/[^0-9]/g, ""))}
              style={otInputStyle}
            />
          </FieldRow>

          {/* Adjuntos — fichas tecnicas, manuales, certificados. Mismo bloque
              que en ActivoForm. */}
          <div style={{ padding: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 16, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}><Paperclip size={16} /></span>
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em" }}>Adjuntos</span>
              </div>
              <button
                type="button" onClick={() => adjuntoInputRef.current?.click()} disabled={uploadingAdjunto}
                style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--surface-1)", color: "var(--brand)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}
              >
                {uploadingAdjunto ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Adjuntar archivo
              </button>
              <input
                ref={adjuntoInputRef} type="file" multiple style={{ display: "none" }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.dwg,.dxf,.zip,image/*"
                onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void pickAdjuntos(files); }}
              />
            </div>
            {adjuntos.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22 }}>
                {adjuntos.map((a, i) => (
                  <div key={`${a.url}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
                    <FileText size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.nombre}
                    </span>
                    <button
                      type="button" onClick={() => setAdjuntos(prev => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Quitar ${a.nombre}`}
                      style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", flexShrink: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button" onClick={() => adjuntoInputRef.current?.click()} disabled={uploadingAdjunto}
                style={{ width: "calc(100% - 22px)", marginLeft: 22, border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--fg-3)", cursor: "pointer", background: "var(--surface-canvas)", fontFamily: "inherit", boxSizing: "border-box" }}
              >
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
    </form>
  );
}

/** Reponer stock. Escribe por `receive_material_stock`, la RPC que ya existía:
 *  inserta en `material_stock_entries` y sube `partes.stock_actual` en la misma
 *  transacción. Un update directo a la columna dejaría el historial sin la
 *  entrada correspondiente. */
function RestockDialog({ material, onClose, onSaved }: { material: Material; onClose: () => void; onSaved: () => Promise<void> }) {
  const [cantidad, setCantidad] = useState(0);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (cantidad <= 0) { setError("Indica una cantidad mayor que cero."); return; }
    setSaving(true); setError(null);
    const sb = createClient();
    const { error: rpcError } = await sb.rpc("receive_material_stock", {
      p_parte_id: material.id,
      p_proveedor_id: material.proveedor?.id ?? null,
      p_cantidad: cantidad,
      p_recibido_at: new Date().toISOString(),
      p_notas: notas.trim() || null,
    });
    if (rpcError) { setError(rpcError.message); setSaving(false); }
    else await onSaved();
  };

  const stepButton: React.CSSProperties = {
    width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    background: "var(--surface-1)", color: "var(--brand)", cursor: "pointer",
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Reponer material"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "min(480px, 100%)", border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface-canvas)", boxShadow: "var(--shadow-lg)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 40px)" }}
      >
        {/* Cabecera — mismo formato que el panel de creación. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>Reponer material</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", cursor: "pointer", color: "var(--fg-3)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "28px 28px 32px" }}>
          {/* Cantidad — menos / campo / más, centrado. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <button
              type="button" onClick={() => setCantidad(v => Math.max(0, v - 1))} aria-label="Restar una unidad"
              style={stepButton}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              <Minus size={16} />
            </button>
            <input
              type="text" inputMode="numeric" value={String(cantidad)}
              onChange={e => setCantidad(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
              aria-label="Cantidad a reponer"
              style={{ ...otInputStyle, width: 140, textAlign: "center" }}
            />
            <button
              type="button" onClick={() => setCantidad(v => v + 1)} aria-label="Sumar una unidad"
              style={stepButton}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              <Plus size={16} />
            </button>
          </div>
          <p style={{ marginTop: 8, textAlign: "center", fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>
            {material.unidad} · quedará en {(Number(material.stock_actual) + cantidad).toLocaleString("es-CL")}
          </p>

          <FieldRow icon={<FileText size={16} />} label="Puedes dejar una nota explicando el cambio">
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              style={{
                width: "100%", fontSize: 14, color: "var(--fg-1)",
                border: "1px solid var(--border)", borderRadius: 8,
                padding: "12px 14px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.7, minHeight: 92,
                boxSizing: "border-box",
              }}
            />
          </FieldRow>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-canvas)", flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            {error && <span style={{ fontSize: 14, color: "var(--danger)" }}>{error}</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button" onClick={onClose} disabled={saving}
              style={{ height: 40, padding: "0 18px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancelar
            </button>
            <button
              type="button" onClick={confirm} disabled={saving || cantidad <= 0}
              style={{ height: 40, padding: "0 24px", border: "none", borderRadius: 8, background: (saving || cantidad <= 0) ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, cursor: (saving || cantidad <= 0) ? "default" : "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", boxShadow: (saving || cantidad <= 0) ? "none" : "0 2px 6px rgba(37,99,235,0.25)" }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Confirmar reposición
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReservationDialog({ location, materials, places, onClose, onSaved }: { location: Ubicacion; materials: Material[]; places: Lugar[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [materialId, setMaterialId] = useState(""); const [placeId, setPlaceId] = useState(""); const [quantity, setQuantity] = useState("1"); const [saving, setSaving] = useState(false);
  const selected = materials.find(item => item.id === materialId);
  const save = async () => { const amount = Number(quantity); if (!selected || amount <= 0 || amount > selected.stock_actual) return; setSaving(true); const sb = createClient(); const { error } = await sb.rpc("reserve_material", { p_parte_id: selected.id, p_ubicacion_id: location.id, p_lugar_id: placeId || null, p_cantidad: amount }); setSaving(false); if (error) window.alert(error.message); else await onSaved(); };
  return <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={styles.dialog}><div className={styles.dialogHeader}><div><h2>Reservar material</h2><p>{location.edificio}</p></div><button className={styles.iconButton} onClick={onClose}><X size={17} /></button></div><div className={styles.dialogBody}><label className={styles.field}><span>Material disponible</span><select value={materialId} onChange={e => setMaterialId(e.target.value)}><option value="">Seleccionar material…</option>{materials.map(item => <option key={item.id} value={item.id}>{item.nombre} · {item.stock_actual} {item.unidad}</option>)}</select></label><label className={styles.field}><span>Destino</span><select value={placeId} onChange={e => setPlaceId(e.target.value)}><option value="">Ubicación general</option>{places.map(place => <option key={place.id} value={place.id}>{place.nombre}</option>)}</select></label><FieldRow icon={<Boxes size={16} />} label={`Cantidad${selected ? ` (${selected.unidad})` : ""}`}><input type="text" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} style={otInputStyle} /></FieldRow>{selected && Number(quantity) > selected.stock_actual && <p className={styles.error}>Solo hay {selected.stock_actual} {selected.unidad} disponibles.</p>}</div><div className={styles.dialogFooter}><button className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton} disabled={!selected || Number(quantity) <= 0 || Number(quantity) > (selected?.stock_actual ?? 0) || saving} onClick={save}>{saving && <Loader2 size={14} className="animate-spin" />}Reservar</button></div></div></div>;
}
