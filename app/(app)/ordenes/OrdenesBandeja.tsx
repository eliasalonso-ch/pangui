"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X, ChevronDown, Loader2, FileText, ArrowUpDown, Download } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { fetchOrden, deleteOrden, LIST_SELECT, parseDescMeta } from "@/lib/ordenes-api";
import OTRow from "./OTRow";
import OTDetail from "./OTDetail";
import OTCrearPanel from "./OTCrearPanel";
import OTEditPanel from "./OTEditPanel";
import OTFiltrosPanel from "./OTFiltrosPanel";
import { FilterBar } from "./OTFiltrosPanel";
import type {
  OrdenListItem, OrdenTrabajo,
  Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Estado, FiltrosState, SortOption,
} from "@/types/ordenes";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_ESTADOS  = new Set<Estado>(["pendiente","en_espera","en_curso"]);
const CLOSED_ESTADOS  = new Set<Estado>(["completado"]);
const PRIORIDAD_ORDER: Record<string, number> = { urgente:4, alta:3, media:2, baja:1, ninguna:0 };

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "prioridad_desc",    label: "Prioridad: Más alto primero" },
  { value: "created_at_desc",   label: "Más recientes primero" },
  { value: "fecha_termino_asc", label: "Fecha límite" },
  { value: "prioridad_asc",     label: "Prioridad: Más bajo primero" },
  { value: "ubicacion",         label: "Ubicación" },
];

const EMPTY_FILTROS: FiltrosState = {
  estados: [], prioridades: [], tipos: [],
  asignadoIds: [], ubicacionIds: [], sociedadIds: [],
  fechaVencimiento: null,
  sinAsignar: false,
  soloAsignados: false,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialOrdenes:  OrdenListItem[];
  usuarios:        Usuario[];
  ubicaciones:     Ubicacion[];
  lugares:         LugarEspecifico[];
  sociedades:      Sociedad[];
  activos:         Activo[];
  categorias:      CategoriaOT[];
  myId:            string;
  myRol:           string | null;
  wsId:            string;
  initialSelectedId?: string | null;
  initialPanel?:   "create" | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrdenesBandeja({
  initialOrdenes, usuarios, ubicaciones, lugares, sociedades, activos, categorias,
  myId, myRol, wsId, initialSelectedId, initialPanel,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ordenes, setOrdenes]   = useState<OrdenListItem[]>(initialOrdenes);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const [detail, setDetail]     = useState<OrdenTrabajo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [tab, setTab]           = useState<"activas" | "cerradas" | "sin_asignar" | "levantamientos">(() => {
    const f = searchParams?.get("filtro");
    if (f === "completadas_hoy")  return "cerradas";
    if (f === "sin_asignar")      return "sin_asignar";
    if (f === "levantamientos")   return "levantamientos";
    // abiertas, en_curso, bloqueadas, urgentes, etc. all show activas tab
    return "activas";
  });
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<SortOption>("created_at_desc");
  const [levAccordion, setLevAccordion] = useState<{ activos: boolean; cerrados: boolean }>({ activos: true, cerrados: false });

  // Pre-apply filter from URL param (e.g. ?filtro=urgentes from inicio dashboard)
  const [filtros, setFiltros]   = useState<FiltrosState>(() => {
    const f = searchParams?.get("filtro");
    if (f === "urgentes")         return { ...EMPTY_FILTROS, prioridades: ["urgente"] };
    if (f === "alta_prioridad")   return { ...EMPTY_FILTROS, prioridades: ["urgente", "alta"] };
    if (f === "en_curso")         return { ...EMPTY_FILTROS, estados: ["en_curso"] };
    if (f === "abiertas")         return { ...EMPTY_FILTROS, estados: ["pendiente", "en_espera"] };
    if (f === "bloqueadas")       return { ...EMPTY_FILTROS, estados: ["en_espera"] };
    if (f === "sin_asignar")      return { ...EMPTY_FILTROS, sinAsignar: true };
    if (f === "asignado")         return { ...EMPTY_FILTROS, soloAsignados: true };
    if (f === "levantamientos")   return EMPTY_FILTROS;
    if (f === "vencidas")         return { ...EMPTY_FILTROS, fechaVencimiento: "vencidas" as const };
    if (f === "vence_hoy")        return { ...EMPTY_FILTROS, fechaVencimiento: "hoy" as const };
    if (f === "completadas_hoy")  return { ...EMPTY_FILTROS, estados: ["completado"] };
    return EMPTY_FILTROS;
  });
  const [isDesktop, setIsDesktop] = useState(false);
  const [sortOpen, setSortOpen]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportConfigOpen, setExportConfigOpen] = useState(false);

  type ExportCol =
    | "numero" | "n_serie" | "hito" | "estado" | "prioridad" | "tipo_trabajo"
    | "descripcion" | "solicitante"
    | "categoria" | "ubicacion" | "activo" | "asignados" | "creado" | "fecha_limite" | "resumen"
    | "hoja_calculo" | "materiales_inventario" | "fotos";

  const EXPORT_COLS: { key: ExportCol; label: string; group: string }[] = [
    { key: "numero",       label: "ID (N° interno)",     group: "Información general" },
    { key: "n_serie",      label: "N° OT (SF folio)",    group: "Información general" },
    { key: "hito",         label: "Hito",                group: "Información general" },
    { key: "estado",       label: "Estado",              group: "Información general" },
    { key: "fecha_limite", label: "Fecha término",       group: "Información general" },
    { key: "ubicacion",    label: "Ubicación",           group: "Información general" },
    { key: "descripcion",  label: "Descripción",         group: "Información general" },
    { key: "solicitante",  label: "Solicitante",         group: "Información general" },
    { key: "prioridad",    label: "Prioridad",           group: "Información general" },
    { key: "tipo_trabajo", label: "Tipo",                group: "Información general" },
    { key: "categoria",    label: "Categoría",           group: "Información general" },
    { key: "activo",       label: "Activo / Equipo",     group: "Información general" },
    { key: "asignados",    label: "Asignados",           group: "Información general" },
    { key: "creado",       label: "Creado el",           group: "Fechas" },
    { key: "resumen",               label: "Hoja de resumen KPIs",    group: "Otros" },
    { key: "hoja_calculo",          label: "Hoja de cálculo",         group: "Materiales" },
    { key: "materiales_inventario", label: "Materiales de inventario", group: "Materiales" },
    { key: "fotos",                 label: "Fotos (URLs)",            group: "Materiales" },
  ];

  const ALL_COLS_ON  = Object.fromEntries(EXPORT_COLS.map(c => [c.key, true]))  as Record<ExportCol, boolean>;
  const ALL_COLS_OFF = Object.fromEntries(EXPORT_COLS.map(c => [c.key, false])) as Record<ExportCol, boolean>;
  const [exportCols, setExportCols] = useState<Record<ExportCol, boolean>>(ALL_COLS_ON);

  const [rightPanel, setRightPanel] = useState<"none" | "create" | "edit">(initialPanel === "create" ? "create" : "none");

  // Keep left-panel visible when right panel is open (desktop only hides list on mobile)
  const sortRef = useRef<HTMLDivElement>(null);

  // Load initial order (when navigating directly to /ordenes/[id])
  useEffect(() => {
    if (initialSelectedId) {
      openOT(initialSelectedId, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect desktop on mount
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortOpen]);

  // Open order detail
  const openOT = useCallback(async (id: string, pushUrl = true) => {
    if (pushUrl) router.push(`/ordenes?id=${id}`, { scroll: false });
    setRightPanel("none");
    setSelected(id);
    setLoadingDetail(true);
    try {
      const orden = await fetchOrden(id);
      setDetail(orden ?? null);
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [router]);

  const openCreate = useCallback(() => {
    router.push("/ordenes?panel=crear", { scroll: false });
    setSelected(null);
    setDetail(null);
    setRightPanel("create");
  }, [router]);

  // Refresh list from DB
  const refreshList = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb
      .from("ordenes_trabajo")
      .select(LIST_SELECT)
      .eq("workspace_id", wsId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data) setOrdenes(data as unknown as OrdenListItem[]);
  }, [wsId]);

  // Poll list every 60s — no realtime channel for ordenes_trabajo
  useEffect(() => {
    const id = setInterval(refreshList, 60_000);
    return () => clearInterval(id);
  }, [refreshList]);

  const deleteOT = async (id: string) => {
    await deleteOrden(id);
    setOrdenes(prev => prev.filter(o => o.id !== id));
    if (selected === id) {
      setSelected(null);
      setDetail(null);
      router.push("/ordenes", { scroll: false });
    }
  };

  // Apply filters + search + sort
  const filtered = useMemo(() => {
    let list = ordenes.filter(o =>
      tab === "sin_asignar"    ? ACTIVE_ESTADOS.has(o.estado) && (!o.asignados_ids || o.asignados_ids.length === 0)
      : tab === "levantamientos" ? o.clasificacion === "levantamiento"
      : tab === "activas"      ? ACTIVE_ESTADOS.has(o.estado)
      : CLOSED_ESTADOS.has(o.estado)
    );

    // Filtros
    if (filtros.estados.length)      list = list.filter(o => filtros.estados.includes(o.estado));
    if (filtros.prioridades.length)  list = list.filter(o => filtros.prioridades.includes(o.prioridad));
    if (filtros.tipos.length)        list = list.filter(o => o.tipo_trabajo != null && filtros.tipos.includes(o.tipo_trabajo));
    if (filtros.asignadoIds.length)  list = list.filter(o => filtros.asignadoIds.some(id => o.asignados_ids?.includes(id)));
    if (filtros.ubicacionIds.length) list = list.filter(o => o.ubicacion_id != null && filtros.ubicacionIds.includes(o.ubicacion_id));
    if (filtros.sociedadIds.length) {
      // Match via ubicacion.sociedad_id (joined in list select)
      const ubicsBySociedad = new Set(
        ubicaciones
          .filter(u => u.sociedad_id != null && filtros.sociedadIds.includes(u.sociedad_id))
          .map(u => u.id)
      );
      list = list.filter(o => o.ubicacion_id != null && ubicsBySociedad.has(o.ubicacion_id));
    }
    if (filtros.fechaVencimiento) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      const in7 = new Date(now); in7.setDate(now.getDate() + 7);
      const in7Str = in7.toISOString().slice(0, 10);
      const in30 = new Date(now); in30.setDate(now.getDate() + 30);
      const in30Str = in30.toISOString().slice(0, 10);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      list = list.filter(o => {
        const d = o.fecha_termino?.slice(0, 10);
        if (!d) return false;
        switch (filtros.fechaVencimiento) {
          case "hoy":       return d === todayStr;
          case "manana":    return d === tomorrowStr;
          case "7dias":     return d >= todayStr && d <= in7Str;
          case "30dias":    return d >= todayStr && d <= in30Str;
          case "este_mes":  return d >= monthStart && d <= monthEnd;
          case "vencidas":  return d < todayStr && o.estado !== "completado";
          default:          return true;
        }
      });
    }
    if (filtros.sinAsignar) {
      list = list.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
    }
    if (filtros.soloAsignados) {
      list = list.filter(o => o.asignados_ids && o.asignados_ids.length > 0);
    }

    // Search — checks title, N° OT, solicitante and description body
    if (search.trim()) {
      const q = search.trim().replace(/\s+/g, " ").toLowerCase();
      list = list.filter(o => {
        if ((o.titulo ?? "").toLowerCase().includes(q)) return true;
        const meta = parseDescMeta(o.descripcion ?? null);
        return (
          (meta.nOT        ?? "").toLowerCase().includes(q) ||
          (meta.solicitante ?? "").toLowerCase().includes(q) ||
          (meta.descripcion ?? "").toLowerCase().includes(q)
        );
      });
    }

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case "fecha_termino_asc":
          if (!a.fecha_termino) return 1;
          if (!b.fecha_termino) return -1;
          return new Date(a.fecha_termino).getTime() - new Date(b.fecha_termino).getTime();
        case "prioridad_desc":
          return (PRIORIDAD_ORDER[b.prioridad] ?? 0) - (PRIORIDAD_ORDER[a.prioridad] ?? 0);
        case "prioridad_asc":
          return (PRIORIDAD_ORDER[a.prioridad] ?? 0) - (PRIORIDAD_ORDER[b.prioridad] ?? 0);
        case "ubicacion":
          return (a.ubicaciones?.edificio ?? "").localeCompare(b.ubicaciones?.edificio ?? "");
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return list;
  }, [ordenes, tab, search, sort, filtros, ubicaciones]);

  // Counts reflect the current filters (search + filtros) but not the active/closed tab split
  const filteredCounts = useMemo(() => {
    const applyFilters = (list: OrdenListItem[]) => {
      if (filtros.estados.length)      list = list.filter(o => filtros.estados.includes(o.estado));
      if (filtros.prioridades.length)  list = list.filter(o => filtros.prioridades.includes(o.prioridad));
      if (filtros.tipos.length)        list = list.filter(o => o.tipo_trabajo != null && filtros.tipos.includes(o.tipo_trabajo));
      if (filtros.asignadoIds.length)  list = list.filter(o => filtros.asignadoIds.some(id => o.asignados_ids?.includes(id)));
      if (filtros.ubicacionIds.length) list = list.filter(o => o.ubicacion_id != null && filtros.ubicacionIds.includes(o.ubicacion_id));
      if (filtros.sociedadIds.length) {
        const ubicsBySociedad = new Set(
          ubicaciones
            .filter(u => u.sociedad_id != null && filtros.sociedadIds.includes(u.sociedad_id))
            .map(u => u.id)
        );
        list = list.filter(o => o.ubicacion_id != null && ubicsBySociedad.has(o.ubicacion_id));
      }
      if (filtros.fechaVencimiento) {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        const in7 = new Date(now); in7.setDate(now.getDate() + 7);
        const in7Str = in7.toISOString().slice(0, 10);
        const in30 = new Date(now); in30.setDate(now.getDate() + 30);
        const in30Str = in30.toISOString().slice(0, 10);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        list = list.filter(o => {
          const d = o.fecha_termino?.slice(0, 10);
          if (!d) return false;
          switch (filtros.fechaVencimiento) {
            case "hoy":       return d === todayStr;
            case "manana":    return d === tomorrowStr;
            case "7dias":     return d >= todayStr && d <= in7Str;
            case "30dias":    return d >= todayStr && d <= in30Str;
            case "este_mes":  return d >= monthStart && d <= monthEnd;
            case "vencidas":  return d < todayStr && o.estado !== "completado";
            default:          return true;
          }
        });
      }
      if (filtros.sinAsignar) {
        list = list.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
      }
      if (filtros.soloAsignados) {
        list = list.filter(o => o.asignados_ids && o.asignados_ids.length > 0);
      }
      if (search.trim()) {
        const q = search.trim().replace(/\s+/g, " ").toLowerCase();
        list = list.filter(o => {
          if ((o.titulo ?? "").toLowerCase().includes(q)) return true;
          const meta = parseDescMeta(o.descripcion ?? null);
          return (
            (meta.nOT        ?? "").toLowerCase().includes(q) ||
            (meta.solicitante ?? "").toLowerCase().includes(q) ||
            (meta.descripcion ?? "").toLowerCase().includes(q)
          );
        });
      }
      return list;
    };
    return {
      activas:        applyFilters(ordenes.filter(o => ACTIVE_ESTADOS.has(o.estado))).length,
      cerradas:       applyFilters(ordenes.filter(o => CLOSED_ESTADOS.has(o.estado))).length,
      sin_asignar:    applyFilters(ordenes.filter(o => ACTIVE_ESTADOS.has(o.estado) && (!o.asignados_ids || o.asignados_ids.length === 0))).length,
      levantamientos: applyFilters(ordenes.filter(o => o.clasificacion === "levantamiento")).length,
    };
  }, [ordenes, filtros, search, ubicaciones]);
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? "";

  // ── Excel export (all OTs across tabs, respecting filters/search) ─────────
  async function handleExportExcel() {
    if (exporting) return;
    setExportConfigOpen(false);
    setExporting(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const f = exportCols;

      // Export ALL ordenes (ignore tab split), but keep filters + search applied
      const allFiltered = (() => {
        let list = [...ordenes];
        if (filtros.estados.length)      list = list.filter(o => filtros.estados.includes(o.estado));
        if (filtros.prioridades.length)  list = list.filter(o => filtros.prioridades.includes(o.prioridad));
        if (filtros.tipos.length)        list = list.filter(o => o.tipo_trabajo != null && filtros.tipos.includes(o.tipo_trabajo));
        if (filtros.asignadoIds.length)  list = list.filter(o => filtros.asignadoIds.some(id => o.asignados_ids?.includes(id)));
        if (filtros.ubicacionIds.length) list = list.filter(o => o.ubicacion_id != null && filtros.ubicacionIds.includes(o.ubicacion_id));
        if (filtros.sinAsignar)          list = list.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
        if (filtros.soloAsignados)       list = list.filter(o => o.asignados_ids && o.asignados_ids.length > 0);
        if (search.trim()) {
          const q = search.trim().replace(/\s+/g, " ").toLowerCase();
          list = list.filter(o => {
            if ((o.titulo ?? "").toLowerCase().includes(q)) return true;
            const meta = parseDescMeta(o.descripcion ?? null);
            return (
              (meta.nOT ?? "").toLowerCase().includes(q) ||
              (meta.solicitante ?? "").toLowerCase().includes(q) ||
              (meta.descripcion ?? "").toLowerCase().includes(q)
            );
          });
        }
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return list;
      })();

      if (allFiltered.length === 0) { setExporting(false); return; }

      // ── Helpers ──────────────────────────────────────────────────────────
      const fmtDate = (s: string | null | undefined) =>
        s ? new Date(s).toLocaleDateString("es-CL") : "—";
      const fmtDateTime = (s: string | null | undefined) =>
        s ? new Date(s).toLocaleString("es-CL", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";

      const ESTADO_LABEL: Record<string, string> = {
        pendiente: "Sin asignar", en_espera: "En espera",
        en_curso: "En curso", completado: "Completado",
      };
      const PRIORIDAD_LABEL: Record<string, string> = {
        urgente: "Urgente", alta: "Alta", media: "Media", baja: "Baja", ninguna: "—",
      };
      const TIPO_LABEL: Record<string, string> = {
        correctivo: "Correctivo", preventivo: "Preventivo",
        predictivo: "Predictivo", mejora: "Mejora",
      };

      // ── Style tokens ─────────────────────────────────────────────────────
      const S = {
        headerDark: {
          font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill:  { fgColor: { rgb: "0F172A" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: false },
          border: { bottom: { style: "thin", color: { rgb: "1E3A8A" } } },
        },
        headerBrand: {
          font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill:  { fgColor: { rgb: "1E3A8A" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: false },
          border: { bottom: { style: "thin", color: { rgb: "2563EB" } } },
        },
        rowEven: {
          fill: { fgColor: { rgb: "F8FAFC" } },
          font: { sz: 10, color: { rgb: "0F172A" } },
          border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
          alignment: { vertical: "center" },
        },
        rowOdd: {
          fill: { fgColor: { rgb: "FFFFFF" } },
          font: { sz: 10, color: { rgb: "0F172A" } },
          border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
          alignment: { vertical: "center" },
        },
        rowMuted: (even: boolean) => ({
          fill: { fgColor: { rgb: even ? "F8FAFC" : "FFFFFF" } },
          font: { sz: 10, color: { rgb: "94A3B8" } },
          border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
          alignment: { vertical: "center" },
        }),
        badge: (color: string, bg: string) => ({
          font:  { bold: true, sz: 10, color: { rgb: color } },
          fill:  { fgColor: { rgb: bg } },
          alignment: { horizontal: "center", vertical: "center" },
          border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
        }),
        totalRow: {
          font:  { bold: true, sz: 10, color: { rgb: "1D4ED8" } },
          fill:  { fgColor: { rgb: "DBEAFE" } },
          alignment: { horizontal: "left", vertical: "center" },
          border: { top: { style: "medium", color: { rgb: "2563EB" } }, bottom: { style: "thin", color: { rgb: "BFDBFE" } } },
        },
        kpiHeader: {
          font:  { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
          fill:  { fgColor: { rgb: "1E3A8A" } },
          alignment: { horizontal: "center", vertical: "center" },
        },
        kpiLabel: {
          font:  { bold: true, sz: 10, color: { rgb: "64748B" } },
          fill:  { fgColor: { rgb: "F1F5F9" } },
          alignment: { horizontal: "left", vertical: "center" },
          border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
        },
        kpiValue: {
          font:  { sz: 10, color: { rgb: "0F172A" } },
          fill:  { fgColor: { rgb: "FFFFFF" } },
          alignment: { horizontal: "left", vertical: "center" },
          border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
        },
        kpiValueBig: {
          font:  { bold: true, sz: 14, color: { rgb: "1E3A8A" } },
          fill:  { fgColor: { rgb: "EFF6FF" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: { bottom: { style: "thin", color: { rgb: "BFDBFE" } } },
        },
      } as const;

      function applyStyle(ws: Record<string, unknown>, addr: string, style: Record<string, unknown>) {
        if (ws[addr] && typeof ws[addr] === "object") {
          (ws[addr] as Record<string, unknown>).s = style;
        }
      }
      function styleRow(ws: Record<string, unknown>, rowIdx: number, nCols: number, style: Record<string, unknown>) {
        for (let c = 0; c < nCols; c++) {
          applyStyle(ws, XLSX.utils.encode_cell({ r: rowIdx, c }), style);
        }
      }

      // ── Column definitions ────────────────────────────────────────────────
      type ColDef = {
        header: string;
        width: number;
        getValue: (o: OrdenListItem) => string | number;
        estadoBadge?: boolean;
        prioBadge?: boolean;
        mutableIfEmpty?: (o: OrdenListItem) => boolean;
      };

      const estadoColors: Record<string, { font: string; fill: string }> = {
        pendiente:  { font: "92400E", fill: "FFFBEB" },
        en_espera:  { font: "7C3AED", fill: "F5F3FF" },
        en_curso:   { font: "1D4ED8", fill: "EFF6FF" },
        completado: { font: "065F46", fill: "ECFDF5" },
      };
      const prioColors: Record<string, { font: string; fill: string }> = {
        urgente: { font: "B91C1C", fill: "FEE2E2" },
        alta:    { font: "B45309", fill: "FEF3C7" },
        media:   { font: "1D4ED8", fill: "DBEAFE" },
        baja:    { font: "475569", fill: "F1F5F9" },
        ninguna: { font: "94A3B8", fill: "F8FAFC" },
      };

      // Column order matches the supervisor's required format
      const COL_DEFS: { key: ExportCol; def: ColDef }[] = [
        { key: "numero",       def: { header: "ID",             width: 8,  getValue: o => o.numero ?? "—" } },
        { key: "n_serie",      def: { header: "N° OT",          width: 22, getValue: o => (o as OrdenListItem & { n_serie?: string | null }).n_serie || parseDescMeta(o.descripcion ?? null).nOT || "—" } },
        { key: "hito",         def: { header: "Hito",           width: 20, getValue: o => (o as OrdenListItem & { hito?: string | null }).hito || parseDescMeta(o.descripcion ?? null).hito || "—" } },
        { key: "estado",       def: { header: "Estado",         width: 14, getValue: o => ESTADO_LABEL[o.estado] ?? o.estado, estadoBadge: true } },
        { key: "fecha_limite", def: { header: "Fecha término",  width: 14, getValue: o => fmtDate(o.fecha_termino), mutableIfEmpty: o => !o.fecha_termino } },
        { key: "ubicacion",    def: { header: "Ubicación",      width: 34, getValue: o => o.ubicaciones?.edificio ?? "—" } },
        { key: "descripcion",  def: { header: "Descripción",    width: 52, getValue: o => parseDescMeta(o.descripcion ?? null).descripcion || o.titulo || "—" } },
        { key: "solicitante",  def: { header: "Solicitante",    width: 26, getValue: o => (o as OrdenListItem & { solicitante?: string | null }).solicitante || parseDescMeta(o.descripcion ?? null).solicitante || "—" } },
        { key: "prioridad",    def: { header: "Prioridad",      width: 12, getValue: o => PRIORIDAD_LABEL[o.prioridad] ?? o.prioridad, prioBadge: true } },
        { key: "tipo_trabajo", def: { header: "Tipo",           width: 14, getValue: o => o.tipo_trabajo ? (TIPO_LABEL[o.tipo_trabajo] ?? o.tipo_trabajo) : "—" } },
        { key: "categoria",    def: { header: "Categoría",      width: 20, getValue: o => (o as OrdenListItem & { categorias_ot?: { nombre: string } | null }).categorias_ot?.nombre ?? "—" } },
        { key: "activo",       def: { header: "Activo",         width: 22, getValue: o => o.activos?.nombre ?? "—" } },
        { key: "asignados",    def: {
          header: "Asignados", width: 30,
          getValue: o => Array.isArray(o.asignados_ids) && o.asignados_ids.length > 0
            ? o.asignados_ids.map(id => usuarios.find(u => u.id === id)?.nombre ?? id).join(", ")
            : "Sin asignar",
          mutableIfEmpty: o => !o.asignados_ids?.length,
        } },
        { key: "creado",       def: { header: "Creado",         width: 13, getValue: o => fmtDate(o.created_at) } },
      ];

      const activeCols = COL_DEFS.filter(c => f[c.key]);

      // Pre-parse metadata once per order
      const metaMap = new Map(allFiltered.map(o => [o.id, parseDescMeta(o.descripcion ?? null)]));

      const getValueWithMeta = (col: typeof COL_DEFS[number], o: OrdenListItem): string | number => {
        const m = metaMap.get(o.id);
        if (col.key === "descripcion") return m?.descripcion || o.titulo || "—";
        if (col.key === "solicitante") return (o as OrdenListItem & { solicitante?: string | null }).solicitante || m?.solicitante || "—";
        if (col.key === "hito")        return (o as OrdenListItem & { hito?: string | null }).hito || m?.hito || "—";
        if (col.key === "n_serie")     return (o as OrdenListItem & { n_serie?: string | null }).n_serie || m?.nOT || "—";
        return col.def.getValue(o);
      };

      // ── Pre-fetch linked sheet data so we know row positions before building main sheet ──
      // Maps ordenId → first row index (1-based, accounting for header) in each linked sheet
      const hojaFirstRow  = new Map<string, number>();
      const matFirstRow   = new Map<string, number>();
      let hojaSheetData:  { hojaRows: (string | number)[][]; colLabels: string[] } | null = null;
      let matSheetData:   { matData: (string | number)[][]; matHeaders: string[] } | null = null;

      if (f.hoja_calculo) {
        const sb = createClient();
        const ordenIds = allFiltered.map(o => o.id);
        const { data: hojas } = await sb
          .from("hojas_inventario")
          .select("id, nombre, columnas, orden_id")
          .in("orden_id", ordenIds)
          .order("created_at");
        const hojaIds = (hojas ?? []).map((h: { id: string }) => h.id);
        const { data: filas } = hojaIds.length > 0
          ? await sb.from("hojas_inventario_filas").select("hoja_id, celdas, orden").in("hoja_id", hojaIds).order("orden")
          : { data: [] };
        const allColLabels = new Set<string>();
        (hojas ?? []).forEach((h: { columnas: { label: string }[] }) =>
          h.columnas.forEach((c: { label: string }) => allColLabels.add(c.label))
        );
        const colLabels = ["ID", "N° OT (SF)", "Hoja", ...Array.from(allColLabels)];
        const hojaRows: (string | number)[][] = [colLabels];
        for (const hoja of (hojas ?? []) as { id: string; nombre: string; columnas: { id: string; label: string }[]; orden_id: string }[]) {
          const ot = allFiltered.find(o => o.id === hoja.orden_id);
          const otNumero = ot?.numero ?? "—";
          const otNSerie = (ot as OrdenListItem & { n_serie?: string | null } | undefined)?.n_serie ?? metaMap.get(ot?.id ?? "")?.nOT ?? "—";
          const hojaFilas = ((filas ?? []) as { hoja_id: string; celdas: Record<string, string>; orden: number }[])
            .filter(row => row.hoja_id === hoja.id);
          if (!hojaFirstRow.has(hoja.orden_id)) hojaFirstRow.set(hoja.orden_id, hojaRows.length);
          if (hojaFilas.length === 0) {
            hojaRows.push([otNumero, otNSerie, hoja.nombre, ...Array.from(allColLabels).map(() => "")]);
          } else {
            for (const fila of hojaFilas) {
              const row: (string | number)[] = [otNumero, otNSerie, hoja.nombre];
              for (const label of allColLabels) {
                const col = hoja.columnas.find((c: { label: string }) => c.label === label);
                row.push(col ? (fila.celdas[col.id] ?? "") : "");
              }
              hojaRows.push(row);
            }
          }
        }
        hojaSheetData = { hojaRows, colLabels };
      }

      if (f.materiales_inventario) {
        const sb = createClient();
        const ordenIds = allFiltered.map(o => o.id);
        const { data: matRows } = await sb
          .from("materiales_usados")
          .select("orden_id, nombre, cantidad, unidad, precio_unitario")
          .in("orden_id", ordenIds)
          .order("orden_id");
        const matHeaders = ["ID", "N° OT (SF)", "Material", "Cantidad", "Unidad", "Precio unitario", "Total"];
        const matData: (string | number)[][] = [matHeaders];
        for (const mat of (matRows ?? []) as { orden_id: string; nombre: string; cantidad: number; unidad: string | null; precio_unitario: number | null }[]) {
          const ot = allFiltered.find(o => o.id === mat.orden_id);
          const otNSerie = (ot as OrdenListItem & { n_serie?: string | null } | undefined)?.n_serie ?? metaMap.get(ot?.id ?? "")?.nOT ?? "—";
          if (!matFirstRow.has(mat.orden_id)) matFirstRow.set(mat.orden_id, matData.length);
          const total = mat.precio_unitario != null ? mat.cantidad * mat.precio_unitario : "";
          matData.push([ot?.numero ?? "—", otNSerie, mat.nombre, mat.cantidad, mat.unidad ?? "—", mat.precio_unitario ?? "—", total]);
        }
        matSheetData = { matData, matHeaders };
      }

      // Hyperlink style for ID cells
      const S_link = (even: boolean) => ({
        font: { bold: true, sz: 10, color: { rgb: "1D4ED8" }, underline: true },
        fill: { fgColor: { rgb: even ? "EFF6FF" : "DBEAFE" } },
        border: { bottom: { style: "thin", color: { rgb: "BFDBFE" } } },
        alignment: { vertical: "center" },
      });

      // ── SHEET 1: Órdenes ─────────────────────────────────────────────────
      const headers = activeCols.map(c => c.def.header);
      const dataRows = allFiltered.map(o => activeCols.map(c => getValueWithMeta(c, o)));

      const wsOrd = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      wsOrd["!cols"]   = activeCols.map(c => ({ wch: c.def.width }));
      wsOrd["!rows"]   = [{ hpt: 22 }, ...dataRows.map(() => ({ hpt: 18 }))];
      wsOrd["!freeze"] = { xSplit: 0, ySplit: 1 };

      styleRow(wsOrd, 0, activeCols.length, S.headerDark);

      const idColIdx = activeCols.findIndex(c => c.key === "numero");

      dataRows.forEach((_, i) => {
        const rIdx = i + 1;
        const even = i % 2 === 0;
        styleRow(wsOrd, rIdx, activeCols.length, even ? S.rowEven : S.rowOdd);

        activeCols.forEach((c, colIdx) => {
          const addr = XLSX.utils.encode_cell({ r: rIdx, c: colIdx });
          if (c.def.estadoBadge) {
            const ec = estadoColors[allFiltered[i].estado] ?? { font: "475569", fill: "F8FAFC" };
            applyStyle(wsOrd, addr, S.badge(ec.font, ec.fill));
          } else if (c.def.prioBadge) {
            const pc = prioColors[allFiltered[i].prioridad] ?? prioColors.ninguna;
            applyStyle(wsOrd, addr, S.badge(pc.font, pc.fill));
          } else if (c.def.mutableIfEmpty?.(allFiltered[i])) {
            applyStyle(wsOrd, addr, S.rowMuted(even));
          }
        });

        // Add hyperlinks on the ID cell to linked sheets
        if (idColIdx >= 0) {
          const ot = allFiltered[i];
          const idAddr = XLSX.utils.encode_cell({ r: rIdx, c: idColIdx });
          const idVal = ot.numero ?? "—";
          const hojaRow = hojaFirstRow.get(ot.id);
          const matRow  = matFirstRow.get(ot.id);

          // Prefer linking to Hoja de cálculo if available, else Materiales
          const linkTarget = hojaRow != null
            ? `#'Hoja de cálculo'!A${hojaRow + 1}`
            : matRow != null
            ? `#'Materiales'!A${matRow + 1}`
            : null;

          if (linkTarget) {
            const tooltip = [
              hojaRow != null ? "→ Hoja de cálculo" : null,
              matRow  != null ? "→ Materiales" : null,
            ].filter(Boolean).join("  |  ");
            wsOrd[idAddr] = { v: idVal, t: "s", l: { Target: linkTarget, Tooltip: tooltip } };
            applyStyle(wsOrd, idAddr, S_link(even));
          }
        }
      });

      // Total row
      const totalRowIdx = dataRows.length + 1;
      const totAddr = XLSX.utils.encode_cell({ r: totalRowIdx, c: 0 });
      wsOrd[totAddr] = { v: `Total: ${allFiltered.length} órdenes`, t: "s" };
      applyStyle(wsOrd, totAddr, S.totalRow);
      const sheetRange = XLSX.utils.decode_range(wsOrd["!ref"] ?? "A1");
      sheetRange.e.r = totalRowIdx;
      wsOrd["!ref"] = XLSX.utils.encode_range(sheetRange);
      for (let c = 1; c < activeCols.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
        wsOrd[addr] = { v: "", t: "s" };
        applyStyle(wsOrd, addr, S.totalRow);
      }

      // ── Workbook ─────────────────────────────────────────────────────────
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsOrd, "Órdenes de trabajo");

      // ── SHEET 2: KPIs / Resumen (optional) ───────────────────────────────
      if (f.resumen) {
        const total      = allFiltered.length;
        const completado = allFiltered.filter(o => o.estado === "completado").length;
        const enCurso    = allFiltered.filter(o => o.estado === "en_curso").length;
        const pendiente  = allFiltered.filter(o => o.estado === "pendiente").length;
        const enEspera   = allFiltered.filter(o => o.estado === "en_espera").length;
        const urgentes   = allFiltered.filter(o => o.prioridad === "urgente").length;
        const vencidas   = allFiltered.filter(o =>
          o.estado !== "completado" && o.fecha_termino && new Date(o.fecha_termino) < new Date()
        ).length;
        const sinAsignar = allFiltered.filter(o => !o.asignados_ids?.length).length;

        const byTipo: Record<string, number> = {};
        allFiltered.forEach(o => { if (o.tipo_trabajo) byTipo[o.tipo_trabajo] = (byTipo[o.tipo_trabajo] ?? 0) + 1; });
        const byUbic: Record<string, number> = {};
        allFiltered.forEach(o => {
          const label = o.ubicaciones?.edificio ?? "Sin ubicación";
          byUbic[label] = (byUbic[label] ?? 0) + 1;
        });

        const kpiData: (string | number)[][] = [
          ["RESUMEN DEL REPORTE", ""],
          ["", ""],
          ["ESTADOS", ""],
          ["Total de órdenes",         total],
          ["Completadas",              completado],
          ["En curso",                 enCurso],
          ["Sin asignar (pendiente)",   pendiente],
          ["En espera",                enEspera],
          ["", ""],
          ["ALERTAS", ""],
          ["Urgentes",                 urgentes],
          ["Vencidas (sin completar)", vencidas],
          ["Sin asignar",              sinAsignar],
          ["", ""],
          ["POR TIPO DE TRABAJO", ""],
          ...Object.entries(byTipo).map(([k, v]) => [TIPO_LABEL[k] ?? k, v]),
          ["", ""],
          ["POR UBICACIÓN (Top 10)", ""],
          ...Object.entries(byUbic)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 10)
            .map(([k, v]) => [k, v]),
          ["", ""],
          ["Exportado el", fmtDateTime(new Date().toISOString())],
        ];

        const wsKpi = XLSX.utils.aoa_to_sheet(kpiData);
        wsKpi["!cols"]   = [{ wch: 34 }, { wch: 18 }];
        wsKpi["!rows"]   = kpiData.map(() => ({ hpt: 18 }));
        wsKpi["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

        applyStyle(wsKpi, "A1", S.kpiHeader);
        applyStyle(wsKpi, "B1", S.kpiHeader);

        const sectionKeys = new Set(["ESTADOS", "ALERTAS", "POR TIPO DE TRABAJO", "POR UBICACIÓN (Top 10)"]);
        kpiData.forEach((row, i) => {
          if (i === 0) return;
          const k = row[0];
          if (typeof k !== "string" || k === "") return;
          if (sectionKeys.has(k)) {
            applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 0 }), S.headerBrand);
            applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 1 }), S.headerBrand);
          } else if (typeof row[1] === "number" && i >= 3 && i <= 8) {
            applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 0 }), S.kpiLabel);
            applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 1 }), S.kpiValueBig);
          } else {
            applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 0 }), S.kpiLabel);
            applyStyle(wsKpi, XLSX.utils.encode_cell({ r: i, c: 1 }), S.kpiValue);
          }
        });

        XLSX.utils.book_append_sheet(wb, wsKpi, "Resumen");
      }

      // ── SHEET: Hoja de cálculo ───────────────────────────────────────────
      if (hojaSheetData) {
        const { hojaRows, colLabels } = hojaSheetData;
        const wsHoja = XLSX.utils.aoa_to_sheet(hojaRows);
        wsHoja["!cols"]   = colLabels.map((_, i) => ({ wch: i < 3 ? 16 : 20 }));
        wsHoja["!rows"]   = hojaRows.map(() => ({ hpt: 18 }));
        wsHoja["!freeze"] = { xSplit: 0, ySplit: 1 };
        styleRow(wsHoja, 0, colLabels.length, S.headerDark);
        // Style rows + back-link on ID cell → Órdenes de trabajo
        for (let r = 1; r < hojaRows.length; r++) {
          const even = r % 2 === 0;
          styleRow(wsHoja, r, colLabels.length, even ? S.rowEven : S.rowOdd);
          const idAddr = XLSX.utils.encode_cell({ r, c: 0 });
          const idVal  = hojaRows[r][0];
          wsHoja[idAddr] = { v: idVal, t: "s", l: { Target: `#'Órdenes de trabajo'!A${r + 1}`, Tooltip: "← Volver a Órdenes" } };
          applyStyle(wsHoja, idAddr, S_link(even));
        }
        XLSX.utils.book_append_sheet(wb, wsHoja, "Hoja de cálculo");
      }

      // ── SHEET: Materiales de inventario ──────────────────────────────────
      if (matSheetData) {
        const { matData, matHeaders } = matSheetData;
        const wsMat = XLSX.utils.aoa_to_sheet(matData);
        wsMat["!cols"]   = [8, 22, 28, 12, 12, 16, 14].map(wch => ({ wch }));
        wsMat["!rows"]   = matData.map(() => ({ hpt: 18 }));
        wsMat["!freeze"] = { xSplit: 0, ySplit: 1 };
        styleRow(wsMat, 0, matHeaders.length, S.headerDark);
        // Style rows + back-link on ID cell → Órdenes de trabajo
        for (let r = 1; r < matData.length; r++) {
          const even = r % 2 === 0;
          styleRow(wsMat, r, matHeaders.length, even ? S.rowEven : S.rowOdd);
          const idAddr = XLSX.utils.encode_cell({ r, c: 0 });
          const idVal  = matData[r][0];
          wsMat[idAddr] = { v: idVal, t: "s", l: { Target: `#'Órdenes de trabajo'!A${r + 1}`, Tooltip: "← Volver a Órdenes" } };
          applyStyle(wsMat, idAddr, S_link(even));
        }
        if (matData.length > 1) {
          const totalRow = ["", "", "TOTAL", "", "", "", matData.slice(1).reduce((sum, r) => sum + (typeof r[6] === "number" ? r[6] : 0), 0)];
          const totalIdx = matData.length;
          XLSX.utils.sheet_add_aoa(wsMat, [totalRow], { origin: totalIdx });
          styleRow(wsMat, totalIdx, matHeaders.length, S.totalRow);
        }
        XLSX.utils.book_append_sheet(wb, wsMat, "Materiales");
      }

      // ── SHEET: Fotos ─────────────────────────────────────────────────────
      if (f.fotos) {
        const sb = createClient();
        const ordenIds = allFiltered.map(o => o.id);

        const { data: grupoItems } = await sb
          .from("foto_grupo_items")
          .select("url, grupo_id, foto_grupos!inner(orden_id, tipo)")
          .in("foto_grupos.orden_id", ordenIds)
          .order("created_at");

        const fotosHeaders = ["ID", "N° OT (SF)", "Tipo", "URL Foto"];
        const fotosData: (string | number)[][] = [fotosHeaders];

        for (const item of (grupoItems ?? []) as { url: string; grupo_id: string; foto_grupos: { orden_id: string; tipo: string } }[]) {
          const ot = allFiltered.find(o => o.id === item.foto_grupos.orden_id);
          const otNSerie = (ot as OrdenListItem & { n_serie?: string | null } | undefined)?.n_serie ?? metaMap.get(ot?.id ?? "")?.nOT ?? "—";
          fotosData.push([ot?.numero ?? "—", otNSerie, item.foto_grupos.tipo, item.url]);
        }

        // Also include legacy fotos_urls if any
        for (const ot of allFiltered) {
          const legacy = (ot as OrdenListItem & { fotos_urls?: string[] | null }).fotos_urls;
          if (!legacy?.length) continue;
          const otNSerie = (ot as OrdenListItem & { n_serie?: string | null }).n_serie ?? metaMap.get(ot.id)?.nOT ?? "—";
          for (const url of legacy) {
            fotosData.push([ot.numero ?? "—", otNSerie, "legacy", url]);
          }
        }

        const wsFootos = XLSX.utils.aoa_to_sheet(fotosData);
        wsFootos["!cols"] = [8, 22, 12, 80].map(wch => ({ wch }));
        wsFootos["!rows"] = fotosData.map(() => ({ hpt: 18 }));
        wsFootos["!freeze"] = { xSplit: 0, ySplit: 1 };
        styleRow(wsFootos, 0, fotosHeaders.length, S.headerDark);

        // Make URL cells clickable hyperlinks
        for (let r = 1; r < fotosData.length; r++) {
          styleRow(wsFootos, r, fotosHeaders.length, r % 2 === 0 ? S.rowEven : S.rowOdd);
          const urlVal = fotosData[r][3];
          if (typeof urlVal === "string" && urlVal.startsWith("http")) {
            const addr = XLSX.utils.encode_cell({ r, c: 3 });
            wsFootos[addr] = { v: urlVal, t: "s", l: { Target: urlVal }, s: { font: { color: { rgb: "1D4ED8" }, underline: true, sz: 10 } } };
          }
        }
        XLSX.utils.book_append_sheet(wb, wsFootos, "Fotos");
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `pangui_ordenes_${dateStr}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", overflow:"hidden", background:"var(--c-bg, #F8FAFC)" }}>

      {/* ── Navigation header ── */}
      <div style={{ flexShrink:0, borderBottom:"1px solid var(--border)", background:"var(--surface-1)" }}>

        {/* Top row */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 20px", height:56, gap:12,
        }}>
          <h1 style={{ fontSize:20, fontWeight:700, color:"var(--fg-1)", letterSpacing:"-0.3px", lineHeight:1.25, flexShrink:0 }}>
            Órdenes de Trabajo
          </h1>

          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"flex-end" }}>
            {/* Search */}
            <div style={{ position:"relative", maxWidth:280, flex:1 }}>
              <Search size={14} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--fg-4)", pointerEvents:"none" }} />
              <input
                type="search"
                placeholder="Buscar Órdenes de Trabajo"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  paddingLeft:34, paddingRight:search ? 28 : 10,
                  height:36, width:"100%",
                  border:"1px solid var(--border)", borderRadius:8,
                  fontSize:13, color:"var(--fg-1)", background:"var(--surface-0)",
                  outline:"none", fontFamily:"inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.10)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", color:"var(--fg-4)", display:"flex" }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Nueva OT button */}
            <button
              type="button"
              onClick={openCreate}
              style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"0 16px", height:38,
                background:"linear-gradient(135deg, #1E3A8A, #2563EB)", color:"var(--surface-1)",
                border:"none", borderRadius:8,
                fontSize:13, fontWeight:600,
                cursor:"pointer", fontFamily:"inherit",
                transition:"opacity 0.1s", whiteSpace:"nowrap", flexShrink:0,
                boxShadow:"0 2px 6px rgba(37,99,235,0.25)",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <Plus size={16} strokeWidth={2} />
              Nueva Orden de Trabajo
            </button>
          </div>
        </div>

        {/* Sub-nav: inline filter buttons + sort */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 20px", height:40, gap:8,
        }}>
          <FilterBar
            filtros={filtros}
            onChange={setFiltros}
            usuarios={usuarios}
            ubicaciones={ubicaciones}
            sociedades={sociedades}
          />


          {/* Right side: export + sort */}
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>

          {/* Export Excel */}
          <button
            type="button"
            onClick={() => { if (ordenes.length > 0 && !exporting) setExportConfigOpen(true); }}
            disabled={exporting || ordenes.length === 0}
            title={ordenes.length === 0 ? "No hay órdenes para exportar" : `Exportar todas las órdenes a Excel (${ordenes.length})`}
            style={{
              display:"flex", alignItems:"center", gap:5,
              height:28, padding:"0 10px",
              border:"1px solid var(--border)", borderRadius:6,
              background: exporting ? "var(--surface-0)" : "var(--surface-1)",
              color: ordenes.length === 0 ? "var(--border-strong)" : "var(--fg-2)",
              fontSize:12, fontWeight:500, cursor: ordenes.length === 0 ? "not-allowed" : "pointer",
              fontFamily:"inherit", whiteSpace:"nowrap",
              transition:"all 0.12s",
            }}
            onMouseEnter={e => { if (ordenes.length > 0 && !exporting) { e.currentTarget.style.borderColor = "var(--success)"; e.currentTarget.style.color = "var(--success)"; e.currentTarget.style.background = "var(--success-bg)"; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = ordenes.length === 0 ? "var(--border-strong)" : "var(--fg-2)"; e.currentTarget.style.background = "var(--surface-1)"; }}
          >
            {exporting
              ? <Loader2 size={12} className="animate-spin" style={{ color:"var(--success)" }} />
              : <Download size={12} />
            }
            {exporting ? "Exportando…" : "Excel"}
          </button>

          {/* Sort dropdown */}
          <div ref={sortRef} style={{ position:"relative" }}>
            <button
              type="button"
              onClick={() => setSortOpen(v => !v)}
              style={{
                display:"flex", alignItems:"center", gap:4,
                height:28, padding:"0 10px",
                border:"1px solid var(--border)", borderRadius:6,
                background:"var(--surface-1)", color:"var(--fg-2)",
                fontSize:12, fontWeight:500, cursor:"pointer",
                fontFamily:"inherit", whiteSpace:"nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              <ArrowUpDown size={11} style={{ color:"var(--fg-4)" }} />
              <span>Ordenar:</span>
              <span style={{ fontWeight:600, color:"var(--fg-1)" }}>{currentSortLabel.split(":")[0]}</span>
              <ChevronDown size={11} style={{ color:"var(--fg-4)", transform: sortOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
            </button>
            {sortOpen && (
              <div style={{
                position:"absolute", right:0, top:"calc(100% + 4px)", zIndex:50,
                background:"var(--surface-1)", border:"1px solid var(--border)",
                borderRadius:8, boxShadow:"0 8px 24px rgba(15,23,42,0.12)",
                minWidth:220, overflow:"hidden",
              }}>
                {SORT_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { setSort(o.value); setSortOpen(false); }}
                    style={{
                      display:"block", width:"100%", textAlign:"left",
                      padding:"9px 14px", background: sort === o.value ? "var(--brand-tint)" : "transparent",
                      border:"none", fontSize:13,
                      color: sort === o.value ? "var(--brand-fg)" : "var(--fg-1)",
                      fontWeight: sort === o.value ? 600 : 400,
                      cursor:"pointer", fontFamily:"inherit",
                    }}
                    onMouseEnter={e => { if (sort !== o.value) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { if (sort !== o.value) e.currentTarget.style.background = "transparent"; }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          </div>{/* end right side */}
        </div>
      </div>

      {/* ── Main split pane ── */}
      <div style={{ display:"flex", flex:1, minHeight:0, overflow:"hidden" }}>

        {/* LEFT: list column */}
        <div style={{
          display: (!isDesktop && (selected || rightPanel === "create" || rightPanel === "edit")) ? "none" : "flex",
          flexDirection:"column",
          width: isDesktop ? 400 : "100%",
          minWidth: isDesktop ? 400 : undefined,
          maxWidth: isDesktop ? 400 : undefined,
          borderRight: isDesktop ? "1px solid var(--border)" : "none",
          background:"var(--surface-1)",
          flexShrink:0,
          position:"relative",
        }}>

          {/* Tabs — 2×2 grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            {[
              { key:"activas",        label:"Pendientes",     count:filteredCounts.activas },
              { key:"cerradas",       label:"Completas",      count:filteredCounts.cerradas },
              { key:"sin_asignar",    label:"Sin asignar",    count:filteredCounts.sin_asignar },
              { key:"levantamientos", label:"Levantamientos", count:filteredCounts.levantamientos },
            ].map((t, i) => {
              const isActive = tab === t.key;
              const isLeft = i % 2 === 0;
              const isTop = i < 2;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key as "activas" | "cerradas" | "sin_asignar" | "levantamientos")}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 14px",
                    background: isActive ? "var(--surface-hover)" : "var(--surface-1)",
                    border:"none",
                    borderBottom: isTop ? "1px solid var(--border)" : "none",
                    borderRight: isLeft ? "1px solid var(--border)" : "none",
                    cursor:"pointer", fontFamily:"inherit",
                    transition:"background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-1)"; }}
                >
                  <span style={{ fontSize:12, fontWeight: isActive ? 600 : 500, color: isActive ? "var(--brand-fg)" : "var(--fg-2)" }}>
                    {t.label}
                  </span>
                  <span style={{
                    fontSize:11, fontWeight:700, padding:"1px 7px", borderRadius:4,
                    background: isActive ? "var(--brand-tint)" : "var(--surface-hover)",
                    color: isActive ? "var(--brand-fg)" : "var(--fg-4)",
                  }}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* List */}
          <div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
            {filtered.length === 0 ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:280, gap:12, color:"var(--fg-4)" }}>
                <svg width="38" height="46" viewBox="0 0 38 46" fill="none">
                  <rect x="2" y="2" width="34" height="42" rx="2" fill="#A67C52"/>
                  <rect x="6" y="7" width="26" height="32" rx="1" fill="var(--surface-1)"/>
                  <path d="M23 4a4 4 0 0 0-8 0h-3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3z" fill="#EFD358"/>
                  <circle cx="19" cy="4" r="1" fill="#B29930"/>
                  <path d="M17 30a1 1 0 0 1-.707-.293l-4-4a1 1 0 1 1 1.414-1.414L17 27.586l7.293-7.293a1 1 0 1 1 1.414 1.414l-8 8A1 1 0 0 1 17 30z" fill="#72C472"/>
                </svg>
                <p style={{ fontSize:13, color:"var(--fg-2)", fontWeight:500 }}>
                  {search ? "Sin resultados para tu búsqueda" : tab === "activas" ? "No tienes ninguna Orden de Trabajo" : tab === "cerradas" ? "No hay órdenes cerradas" : tab === "levantamientos" ? "No hay levantamientos" : "No hay órdenes sin asignar"}
                </p>
                {!search && tab === "activas" && (
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); openCreate(); }}
                    style={{ fontSize:13, color:"var(--brand-fg)", fontWeight:500, textDecoration:"underline" }}
                  >
                    Crea la primera Orden de Trabajo
                  </a>
                )}
              </div>
            ) : tab === "levantamientos" ? (
              (() => {
                const levActivos  = filtered.filter(o => ACTIVE_ESTADOS.has(o.estado));
                const levCerrados = filtered.filter(o => CLOSED_ESTADOS.has(o.estado));
                return (
                  <>
                    {/* Active accordion */}
                    <button
                      onClick={() => setLevAccordion(prev => ({ ...prev, activos: !prev.activos }))}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 16px", background: "var(--surface-0)", border: "none", borderBottom: "1px solid var(--border)",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        En curso · {levActivos.length}
                      </span>
                      <ChevronDown size={14} color="var(--fg-4)" style={{ transform: levAccordion.activos ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    {levAccordion.activos && levActivos.map((o, idx) => (
                      <OTRow
                        key={o.id}
                        orden={o}
                        rowNumber={idx + 1}
                        usuarios={usuarios}
                        isSelected={selected === o.id}
                        onClick={() => openOT(o.id, true)}
                        myId={myId}
                        onAssigned={(id, newIds) => setOrdenes(prev =>
                          prev.map(x => x.id === id ? { ...x, asignados_ids: newIds.length > 0 ? newIds : null } : x)
                        )}
                      />
                    ))}

                    {/* Closed accordion */}
                    <button
                      onClick={() => setLevAccordion(prev => ({ ...prev, cerrados: !prev.cerrados }))}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 16px", background: "var(--surface-0)", border: "none",
                        borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Completados · {levCerrados.length}
                      </span>
                      <ChevronDown size={14} color="var(--fg-4)" style={{ transform: levAccordion.cerrados ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                    {levAccordion.cerrados && levCerrados.map((o, idx) => (
                      <OTRow
                        key={o.id}
                        orden={o}
                        rowNumber={idx + 1}
                        usuarios={usuarios}
                        isSelected={selected === o.id}
                        onClick={() => openOT(o.id, true)}
                        myId={myId}
                        onAssigned={(id, newIds) => setOrdenes(prev =>
                          prev.map(x => x.id === id ? { ...x, asignados_ids: newIds.length > 0 ? newIds : null } : x)
                        )}
                      />
                    ))}
                  </>
                );
              })()
            ) : (
              filtered.map((o, idx) => (
                <OTRow
                  key={o.id}
                  orden={o}
                  rowNumber={idx + 1}
                  usuarios={usuarios}
                  isSelected={selected === o.id}
                  onClick={() => openOT(o.id, true)}
                  myId={myId}
                  onAssigned={(id, newIds) => setOrdenes(prev =>
                    prev.map(x => x.id === id ? { ...x, asignados_ids: newIds.length > 0 ? newIds : null } : x)
                  )}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT: create panel or detail */}
        {isDesktop && (
          <div style={{ flex:1, minWidth:0, overflow:"hidden", background:"var(--c-bg, #F8FAFC)" }}>
            {rightPanel === "create" ? (
              <OTCrearPanel
                usuarios={usuarios}
                ubicaciones={ubicaciones}
                lugares={lugares}
                sociedades={sociedades}
                activos={activos}
                categorias={categorias}
                myId={myId}
                wsId={wsId}
                onClose={() => { setRightPanel("none"); router.push("/ordenes", { scroll: false }); }}
                onCreated={async (orden) => {
                  setRightPanel("none");
                  await refreshList();
                  openOT(orden.id, true);
                }}
              />
            ) : rightPanel === "edit" && detail ? (
              <OTEditPanel
                orden={detail}
                usuarios={usuarios}
                ubicaciones={ubicaciones}
                lugares={lugares}
                sociedades={sociedades}
                activos={activos}
                categorias={categorias}
                myId={myId}
                wsId={wsId}
                onClose={() => setRightPanel("none")}
                onSaved={(updated) => {
                  setDetail(prev => prev ? { ...prev, ...updated } : prev);
                  setOrdenes(prev => prev.map(o =>
                    o.id === detail.id ? { ...o, ...updated } : o
                  ));
                  setRightPanel("none");
                }}
              />
            ) : selected ? (
              loadingDetail ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", gap:8, color:"var(--fg-4)", fontSize:13 }}>
                  <Loader2 size={16} className="animate-spin" />
                  Cargando…
                </div>
              ) : detail ? (
                <OTDetail
                  orden={detail}
                  usuarios={usuarios}
                  myId={myId}
                  myRol={myRol}
                  wsId={wsId}
                  onEdit={() => setRightPanel("edit")}
                  onDelete={() => deleteOT(detail.id)}
                  onClose={() => { setSelected(null); setDetail(null); router.push("/ordenes", { scroll: false }); }}
                  onOrdenUpdated={(patch) => {
                    setDetail(prev => prev ? { ...prev, ...patch } : prev);
                    setOrdenes(prev => prev.map(o =>
                      o.id === detail.id ? { ...o, ...patch } : o
                    ));
                  }}
                />
              ) : null
            ) : (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, color:"var(--fg-4)" }}>
                <div style={{ width:64, height:64, borderRadius:12, background:"var(--surface-hover)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <FileText size={28} style={{ color:"var(--border-strong)" }} />
                </div>
                <div style={{ textAlign:"center" }}>
                  <p style={{ fontSize:14, fontWeight:600, color:"var(--fg-2)" }}>Selecciona una orden</p>
                  <p style={{ fontSize:12, color:"var(--fg-4)", marginTop:4 }}>El detalle aparecerá aquí</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Export config modal ── */}
      {exportConfigOpen && (
        <div
          style={{ position:"fixed", inset:0, zIndex:400, background:"rgba(15,23,42,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setExportConfigOpen(false)}
        >
          <div
            style={{ background:"var(--surface-1)", borderRadius:14, width:420, boxShadow:"0 20px 60px rgba(15,23,42,0.20)", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding:"18px 20px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:"var(--fg-1)" }}>Exportar Excel</div>
                <div style={{ fontSize:12, color:"var(--fg-4)", marginTop:2 }}>
                  {ordenes.length} órdenes en total · selecciona las columnas a incluir
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportConfigOpen(false)}
                style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"none", borderRadius:6, cursor:"pointer", color:"var(--fg-4)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Fields grouped */}
            <div style={{ padding:"8px 20px 4px", maxHeight:380, overflowY:"auto" }}>
              {Array.from(new Set(EXPORT_COLS.map(c => c.group))).map(group => (
                <div key={group} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--fg-4)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4, paddingLeft:10 }}>
                    {group}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1 }}>
                    {EXPORT_COLS.filter(c => c.group === group).map(col => (
                      <label
                        key={col.key}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:7, cursor:"pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={exportCols[col.key]}
                          onChange={e => setExportCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                          style={{ width:14, height:14, accentColor:"var(--brand)", cursor:"pointer", flexShrink:0 }}
                        />
                        <span style={{ fontSize:12.5, color: exportCols[col.key] ? "var(--fg-1)" : "var(--fg-4)" }}>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Select all / none */}
            <div style={{ padding:"8px 20px 10px", display:"flex", gap:8, borderTop:"1px solid #F1F5F9" }}>
              <button type="button" onClick={() => setExportCols(ALL_COLS_ON)}
                style={{ fontSize:12, color:"var(--brand-fg)", background:"transparent", border:"none", cursor:"pointer", padding:"2px 0", fontFamily:"inherit" }}>
                Seleccionar todo
              </button>
              <span style={{ color:"var(--border)" }}>·</span>
              <button type="button" onClick={() => setExportCols(ALL_COLS_OFF)}
                style={{ fontSize:12, color:"var(--fg-4)", background:"transparent", border:"none", cursor:"pointer", padding:"2px 0", fontFamily:"inherit" }}>
                Limpiar
              </button>
              <span style={{ marginLeft:"auto", fontSize:12, color:"var(--fg-4)" }}>
                {Object.values(exportCols).filter(Boolean).length} seleccionados
              </span>
            </div>

            {/* Footer */}
            <div style={{ padding:"10px 20px 16px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button
                type="button"
                onClick={() => setExportConfigOpen(false)}
                style={{ height:36, padding:"0 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface-1)", fontSize:13, color:"var(--fg-2)", cursor:"pointer", fontFamily:"inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
              >Cancelar</button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={!Object.values(exportCols).some(Boolean)}
                style={{
                  height:36, padding:"0 18px", borderRadius:8, border:"none",
                  background: Object.values(exportCols).some(Boolean) ? "var(--brand)" : "var(--border-strong)",
                  fontSize:13, fontWeight:600, color:"var(--surface-1)",
                  cursor: Object.values(exportCols).some(Boolean) ? "pointer" : "default",
                  fontFamily:"inherit", display:"flex", alignItems:"center", gap:6,
                }}
              >
                {exporting
                  ? <><Loader2 size={13} className="animate-spin" />Exportando…</>
                  : <><Download size={13} />Exportar Excel</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
