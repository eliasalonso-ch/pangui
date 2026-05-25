"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X, ChevronDown, Loader2, FileText, ArrowUpDown, Download, AlertTriangle, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { fetchOrden, deleteOrden, LIST_SELECT, parseDescMeta } from "@/lib/ordenes-api";
import { buildOrdenesWorkbook, type ExportCols as SharedExportCols, type OrdenInput, type HojaInput, type FilaInput, type FotoItemInput, type MaterialUsadoInput } from "@/lib/excel-export-shared";
import { ExportScheduler } from "./ExportScheduler";
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

type WaitingReasonKey = "materiales" | "acceso" | "reprogramar" | "otro";

type WaitingAlert = {
  id: string;
  title: string;
  numero: number | null;
  reason: WaitingReasonKey;
  reasonLabel: string;
  comment: string | null;
  pausedAt: string | null;
};

function classifyWaitingReason(comment: string | null | undefined): { key: WaitingReasonKey; label: string } {
  const c = (comment ?? "").toLowerCase();
  if (c.includes("material")) return { key: "materiales", label: "Faltan materiales" };
  // "coordinad" catches coordinado/coordinada/coordinados/coordinadas — humans
  // write freely; "Coordinado para las 17:00hrs" means rescheduled even though
  // the mobile auto-prefix is "Reprogramar:".
  if (c.includes("reprogram") || c.includes("reagend") || c.includes("coordinad") || c.includes("coordino") || c.includes("coordinó")) return { key: "reprogramar", label: "Reprogramar" };
  if (c.includes("acceso") || c.includes("ingresar") || c.includes("instalacion") || c.includes("instalación")) return { key: "acceso", label: "Sin acceso" };
  return { key: "otro", label: "Otro motivo" };
}

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

  // Two top-level tabs only; the previous sub-tabs (Sin asignar, Reprogramadas,
  // Levantamientos) are now scope filters inside the merged Mostrar/Ordenar
  // dropdown so the supervisor can drill in without losing the rest of the list.
  type TabKey = "pendientes" | "completas";
  type ScopeKey = "todas" | "sin_asignar" | "reprogramadas" | "levantamientos";

  const [tab, setTab]           = useState<TabKey>(() => {
    const f = searchParams?.get("filtro");
    if (f === "completadas_hoy")  return "completas";
    return "pendientes";
  });
  const [scope, setScope]       = useState<ScopeKey>(() => {
    const f = searchParams?.get("filtro");
    if (f === "sin_asignar")     return "sin_asignar";
    if (f === "reprogramadas")   return "reprogramadas";
    if (f === "levantamientos")  return "levantamientos";
    return "todas";
  });
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<SortOption>("created_at_desc");

  // Pre-apply filter from URL param (e.g. ?filtro=urgentes from inicio dashboard)
  const [filtros, setFiltros]   = useState<FiltrosState>(() => {
    const f = searchParams?.get("filtro");
    if (f === "urgentes")         return { ...EMPTY_FILTROS, prioridades: ["urgente"] };
    if (f === "alta_prioridad")   return { ...EMPTY_FILTROS, prioridades: ["urgente", "alta"] };
    if (f === "en_curso")         return { ...EMPTY_FILTROS, estados: ["en_curso"] };
    if (f === "abiertas")         return { ...EMPTY_FILTROS, estados: ["pendiente", "en_espera"] };
    if (f === "bloqueadas")       return { ...EMPTY_FILTROS, estados: ["en_espera"] };
    if (f === "reprogramadas")    return { ...EMPTY_FILTROS, estados: ["en_espera"] };
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
  const [waitingAlerts, setWaitingAlerts] = useState<WaitingAlert[]>([]);
  const [waitingAlertIndex, setWaitingAlertIndex] = useState(0);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const waitingRef = useRef<HTMLDivElement>(null);

  type ExportCol =
    | "numero" | "n_serie" | "hito" | "estado" | "prioridad" | "tipo_trabajo"
    | "descripcion" | "solicitante"
    | "categoria" | "ubicacion" | "activo" | "asignados" | "creado" | "fecha_limite" | "resumen"
    | "hoja_calculo" | "materiales_inventario";

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
    { key: "hoja_calculo",          label: "Hoja de cálculo + Fotos",  group: "Materiales" },
    { key: "materiales_inventario", label: "Materiales de inventario", group: "Materiales" },
  ];

  const ALL_COLS_ON  = Object.fromEntries(EXPORT_COLS.map(c => [c.key, true]))  as Record<ExportCol, boolean>;
  const ALL_COLS_OFF = Object.fromEntries(EXPORT_COLS.map(c => [c.key, false])) as Record<ExportCol, boolean>;
  const [exportCols, setExportCols] = useState<Record<ExportCol, boolean>>(ALL_COLS_ON);

  const [rightPanel, setRightPanel] = useState<"none" | "create" | "edit">(initialPanel === "create" ? "create" : "none");

  // Keep left-panel visible when right panel is open (desktop only hides list on mobile)
  const sortRef = useRef<HTMLDivElement>(null);

  const waitingOrderIds = useMemo(
    () => ordenes.filter(o => o.estado === "en_espera").map(o => o.id).sort().join(","),
    [ordenes],
  );

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

  useEffect(() => {
    if (!waitingOpen) return;
    const handler = (e: MouseEvent) => {
      if (waitingRef.current && !waitingRef.current.contains(e.target as Node)) setWaitingOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [waitingOpen]);

  useEffect(() => {
    const waiting = ordenes.filter(o => o.estado === "en_espera");
    if (waiting.length === 0) {
      setWaitingAlerts([]);
      setWaitingAlertIndex(0);
      return;
    }

    let cancelled = false;
    const ids = waiting.map(o => o.id);
    const byId = new Map(waiting.map(o => [o.id, o]));

    async function loadWaitingReasons() {
      const sb = createClient();
      const { data } = await sb
        .from("actividad_ot")
        .select("orden_id, comentario, created_at")
        .eq("tipo", "pausado")
        .in("orden_id", ids)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      const latest = new Map<string, { comentario: string | null; created_at: string | null }>();
      for (const row of (data ?? []) as { orden_id: string; comentario: string | null; created_at: string | null }[]) {
        if (!latest.has(row.orden_id)) latest.set(row.orden_id, { comentario: row.comentario, created_at: row.created_at });
      }

      setWaitingAlerts(waiting.map((o) => {
        const activity = latest.get(o.id);
        const reason = classifyWaitingReason(activity?.comentario);
        return {
          id: o.id,
          title: o.titulo ?? "Orden sin título",
          numero: o.numero ?? null,
          reason: reason.key,
          reasonLabel: reason.label,
          comment: activity?.comentario ?? null,
          pausedAt: activity?.created_at ?? null,
        };
      }));
      setWaitingAlertIndex((idx) => Math.min(idx, Math.max(waiting.length - 1, 0)));
    }

    loadWaitingReasons();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOrderIds]);

  useEffect(() => {
    if (waitingOpen || waitingAlerts.length <= 1) return;
    const id = setInterval(() => {
      setWaitingAlertIndex((idx) => (idx + 1) % waitingAlerts.length);
    }, 4500);
    return () => clearInterval(id);
  }, [waitingAlerts.length, waitingOpen]);

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

  // Cache the set of OT ids whose latest pausado reason is "reprogramar",
  // so the "Solo reprogramadas" toggle is O(1) per OT.
  const reprogramadaIds = useMemo(
    () => new Set(waitingAlerts.filter(a => a.reason === "reprogramar").map(a => a.id)),
    [waitingAlerts],
  );

  // Apply filters + search + sort
  const filtered = useMemo(() => {
    // Tab decides active vs. completed; scope narrows further.
    let list = ordenes.filter(o =>
      tab === "pendientes" ? ACTIVE_ESTADOS.has(o.estado) : CLOSED_ESTADOS.has(o.estado)
    );

    if (scope === "sin_asignar") {
      list = list.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
    } else if (scope === "reprogramadas") {
      list = list.filter(o => reprogramadaIds.has(o.id));
    } else if (scope === "levantamientos") {
      list = list.filter(o => o.clasificacion === "levantamiento");
    }

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

    // Sort. The reprogramadas scope forces ascending fecha_inicio so the soonest
    // coordinated date floats to the top — the supervisor's primary need here.
    if (scope === "reprogramadas") {
      list.sort((a, b) => {
        const af = a.fecha_inicio ?? "";
        const bf = b.fecha_inicio ?? "";
        if (!af && !bf) return 0;
        if (!af) return 1;
        if (!bf) return -1;
        return af.localeCompare(bf);
      });
    } else {
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
    }
    return list;
  }, [ordenes, tab, scope, search, sort, filtros, ubicaciones, reprogramadaIds]);

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
    // Per tab × per scope. Drives the dropdown labels, the red-dot indicators,
    // and the tab pill counts. All respect search + filtros so the count
    // shown matches what the user would actually see if they clicked in.
    const active = ordenes.filter(o => ACTIVE_ESTADOS.has(o.estado));
    const closed = ordenes.filter(o => CLOSED_ESTADOS.has(o.estado));
    return {
      pendientes: {
        todas:         applyFilters(active).length,
        sin_asignar:   applyFilters(active.filter(o => !o.asignados_ids || o.asignados_ids.length === 0)).length,
        reprogramadas: applyFilters(active.filter(o => reprogramadaIds.has(o.id))).length,
        levantamientos: applyFilters(active.filter(o => o.clasificacion === "levantamiento")).length,
      },
      completas: {
        todas:          applyFilters(closed).length,
        levantamientos: applyFilters(closed.filter(o => o.clasificacion === "levantamiento")).length,
      },
    };
  }, [ordenes, filtros, search, ubicaciones, reprogramadaIds]);
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? "";
  const currentWaitingAlert = waitingAlerts.length > 0
    ? waitingAlerts[waitingAlertIndex % waitingAlerts.length]
    : null;

  // ── Excel export (all OTs across tabs, respecting filters/search) ─────────
  //
  // Filtering + Supabase queries happen here (browser-side, uses the user's
  // session). The actual workbook construction is delegated to the shared
  // builder in lib/excel-export-shared.ts so the same code runs in the
  // scheduled-email Edge Function (Deno) and produces identical files.
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

      // ── Fetch per-OT data (hojas, filas, fotos, materiales) ──────────────
      const ordenIds = allFiltered.map(o => o.id);
      let hojas: HojaInput[] = [];
      let filas: FilaInput[] = [];
      let fotos: FotoItemInput[] = [];
      let materialesUsados: MaterialUsadoInput[] = [];

      if (f.hoja_calculo && ordenIds.length > 0) {
        const sb = createClient();
        const { data: hojasData } = await sb
          .from("hojas_inventario")
          .select("id, nombre, columnas, orden_id")
          .in("orden_id", ordenIds)
          .order("created_at");
        hojas = (hojasData ?? []) as HojaInput[];

        const hojaIds = hojas.map(h => h.id);
        if (hojaIds.length > 0) {
          const { data: filasData } = await sb
            .from("hojas_inventario_filas")
            .select("hoja_id, celdas, orden")
            .in("hoja_id", hojaIds)
            .order("orden");
          filas = (filasData ?? []) as FilaInput[];
        }

        const { data: grupoItems } = await sb
          .from("foto_grupo_items")
          .select("url, foto_grupos!inner(orden_id, tipo)")
          .in("foto_grupos.orden_id", ordenIds)
          .order("created_at");
        for (const item of (grupoItems ?? []) as unknown as { url: string; foto_grupos: { orden_id: string; tipo: string } | { orden_id: string; tipo: string }[] }[]) {
          const fg = Array.isArray(item.foto_grupos) ? item.foto_grupos[0] : item.foto_grupos;
          if (!fg?.orden_id || !item.url) continue;
          fotos.push({ orden_id: fg.orden_id, url: item.url, tipo: fg.tipo ?? "—" });
        }
      }

      if (f.materiales_inventario && ordenIds.length > 0) {
        const sb = createClient();
        const { data: matRows } = await sb
          .from("materiales_usados")
          .select("orden_id, nombre, cantidad, unidad, precio_unitario")
          .in("orden_id", ordenIds)
          .order("orden_id");
        materialesUsados = (matRows ?? []) as MaterialUsadoInput[];
      }

      // Map the in-memory OrdenListItem to the shared OrdenInput shape.
      // Anything the builder doesn't need (joins for the bandeja UI) is dropped.
      const ordenesForBuild: OrdenInput[] = allFiltered.map(o => ({
        id: o.id,
        numero: o.numero ?? null,
        titulo: o.titulo ?? null,
        descripcion: o.descripcion ?? null,
        estado: o.estado,
        prioridad: o.prioridad,
        tipo_trabajo: o.tipo_trabajo ?? null,
        fecha_termino: o.fecha_termino ?? null,
        created_at: o.created_at,
        asignados_ids: o.asignados_ids ?? null,
        n_serie: (o as OrdenListItem & { n_serie?: string | null }).n_serie ?? null,
        hito:    (o as OrdenListItem & { hito?: string | null }).hito ?? null,
        solicitante: (o as OrdenListItem & { solicitante?: string | null }).solicitante ?? null,
        ubicaciones: o.ubicaciones ? { edificio: o.ubicaciones.edificio ?? null } : null,
        activos:     o.activos ? { nombre: o.activos.nombre ?? null } : null,
        categorias_ot: (o as OrdenListItem & { categorias_ot?: { nombre: string | null } | null }).categorias_ot ?? null,
        fotos_urls:  (o as OrdenListItem & { fotos_urls?: string[] | null }).fotos_urls ?? null,
      }));

      const bytes = buildOrdenesWorkbook({
        ordenes: ordenesForBuild,
        hojas,
        filas,
        fotos,
        materialesUsados,
        usuarios: usuarios.map(u => ({ id: u.id, nombre: u.nombre })),
        cols: f as SharedExportCols,
        // The dynamic import returns a synthetic { default, ...members } shape
        // in some TS configs. The shared builder only reaches into utils/write,
        // both of which are direct exports.
        XLSX: XLSX as unknown as Parameters<typeof buildOrdenesWorkbook>[0]["XLSX"],
      });

      // Trigger browser download.
      const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pangui_ordenes_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", overflow:"hidden", background:"var(--c-bg, #F8FAFC)" }}>

      {/* ── Navigation header ── */}
      <div style={{ flexShrink:0, borderBottom:"1px solid var(--border)", background:"var(--surface-1)" }}>
        {currentWaitingAlert && (
          <div ref={waitingRef} style={{ position:"relative", padding:"8px 20px 0" }}>
            <button
              type="button"
              onClick={() => setWaitingOpen(v => !v)}
              title={`${waitingAlerts.length} OT${waitingAlerts.length > 1 ? "s" : ""} en espera`}
              style={{
                display:"flex", alignItems:"center", gap:10,
                width:"100%", minWidth:0, height:36,
                padding:"0 12px",
                border:"1px solid var(--border)", borderRadius:8,
                background:"var(--surface-0)", color:"var(--fg-2)",
                fontSize:13, fontWeight:500,
                cursor:"pointer", fontFamily:"inherit",
                overflow:"hidden",
              }}
            >
              <AlertTriangle size={15} strokeWidth={2} style={{ flexShrink:0, color:"var(--fg-3)" }} />
              <span style={{ flexShrink:0, color:"var(--fg-2)" }}>En espera</span>
              <span style={{ flexShrink:0, width:1, height:16, background:"var(--border)" }} />
              <span style={{ flexShrink:0, color:"var(--fg-3)" }}>{currentWaitingAlert.reasonLabel}</span>
              <span style={{ minWidth:0, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--fg-1)", textAlign:"left" }}>
                {currentWaitingAlert.numero ? `#${currentWaitingAlert.numero} · ` : ""}{currentWaitingAlert.title}
              </span>
              <span style={{ flexShrink:0, fontSize:12, color:"var(--fg-3)" }}>{waitingAlerts.length}</span>
              <ChevronDown size={14} style={{ flexShrink:0, color:"var(--fg-4)", transform: waitingOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
            </button>

            {waitingOpen && (
              <div style={{
                position:"absolute", right:20, top:"calc(100% + 6px)", zIndex:70,
                width:420, maxWidth:"calc(100vw - 40px)",
                background:"var(--surface-1)", border:"1px solid var(--border)",
                borderRadius:10, boxShadow:"0 14px 34px rgba(15,23,42,0.16)",
                overflow:"hidden",
              }}>
                <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--fg-1)" }}>OTs en espera</span>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--fg-3)" }}>{waitingAlerts.length}</span>
                </div>
                {reprogramadaIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("pendientes");
                      setScope("reprogramadas");
                      const params = new URLSearchParams(searchParams?.toString() ?? "");
                      params.set("filtro", "reprogramadas");
                      router.replace(`/ordenes${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
                      setWaitingOpen(false);
                    }}
                    style={{
                      width:"100%", display:"flex", alignItems:"center", gap:8,
                      padding:"10px 12px", borderBottom:"1px solid var(--border)",
                      background: scope === "reprogramadas" ? "var(--st-wait-bg)" : "var(--surface-1)",
                      border:"none", borderTop:"none", cursor:"pointer",
                      fontFamily:"inherit", textAlign:"left",
                    }}
                  >
                    <Calendar size={14} style={{ color: scope === "reprogramadas" ? "var(--st-wait-fg)" : "var(--fg-3)", flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:12, fontWeight:600, color: scope === "reprogramadas" ? "var(--st-wait-fg)" : "var(--fg-2)" }}>
                      Solo reprogramadas
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color: scope === "reprogramadas" ? "var(--st-wait-fg)" : "var(--fg-3)" }}>
                      {reprogramadaIds.size}
                    </span>
                  </button>
                )}
                <div style={{ maxHeight:320, overflowY:"auto", padding:6 }}>
                  {waitingAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => {
                        setWaitingOpen(false);
                        openOT(alert.id);
                      }}
                      style={{
                        width:"100%", textAlign:"left", border:"none", background:"transparent",
                        borderRadius:8, padding:"10px 10px", cursor:"pointer",
                        fontFamily:"inherit", display:"flex", gap:10,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <AlertTriangle size={15} style={{ marginTop:2, color:"var(--fg-4)", flexShrink:0 }} />
                      <span style={{ minWidth:0, flex:1 }}>
                        <span style={{ display:"block", fontSize:13, fontWeight:650, color:"var(--fg-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {alert.numero ? `#${alert.numero} · ` : ""}{alert.title}
                        </span>
                        <span style={{ display:"block", fontSize:12, fontWeight:500, color:"var(--fg-3)", marginTop:2 }}>
                          {alert.reasonLabel}
                        </span>
                        {alert.comment && (
                          <span style={{ display:"block", fontSize:12, color:"var(--fg-3)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {alert.comment}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

            {false && currentWaitingAlert && (
              <div style={{ display:"none" }}>
                <button
                  type="button"
                  onClick={() => setWaitingOpen(v => !v)}
                  title={`${waitingAlerts.length} OT${waitingAlerts.length > 1 ? "s" : ""} en espera`}
                  style={{
                    display:"flex", alignItems:"center", gap:8,
                    height:38, maxWidth:300,
                    padding:"0 12px",
                    border:"1px solid #F59E0B55", borderRadius:8,
                    background:"#FFFBEB", color:"#92400E",
                    fontSize:13, fontWeight:600,
                    cursor:"pointer", fontFamily:"inherit",
                    whiteSpace:"nowrap",
                  }}
                >
                  <AlertTriangle size={16} strokeWidth={2.2} style={{ flexShrink:0 }} />
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis" }}>
                    {currentWaitingAlert?.reasonLabel}: {currentWaitingAlert?.title}
                  </span>
                  <ChevronDown size={14} style={{ flexShrink:0, transform: waitingOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
                </button>

                {waitingOpen && (
                  <div style={{
                    position:"absolute", right:0, top:"calc(100% + 6px)", zIndex:70,
                    width:360, maxWidth:"calc(100vw - 32px)",
                    background:"var(--surface-1)", border:"1px solid var(--border)",
                    borderRadius:10, boxShadow:"0 14px 34px rgba(15,23,42,0.16)",
                    overflow:"hidden",
                  }}>
                    <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"var(--fg-1)" }}>OTs en espera</span>
                      <span style={{ fontSize:11, fontWeight:700, color:"#92400E", background:"#FFFBEB", border:"1px solid #F59E0B44", borderRadius:999, padding:"2px 7px" }}>
                        {waitingAlerts.length}
                      </span>
                    </div>
                    <div style={{ maxHeight:320, overflowY:"auto", padding:6 }}>
                      {waitingAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => {
                            setWaitingOpen(false);
                            openOT(alert.id);
                          }}
                          style={{
                            width:"100%", textAlign:"left", border:"none", background:"transparent",
                            borderRadius:8, padding:"10px 10px", cursor:"pointer",
                            fontFamily:"inherit", display:"flex", gap:10,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <AlertTriangle size={16} style={{ marginTop:2, color:"#D97706", flexShrink:0 }} />
                          <span style={{ minWidth:0, flex:1 }}>
                            <span style={{ display:"block", fontSize:13, fontWeight:700, color:"var(--fg-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {alert.numero ? `#${alert.numero} · ` : ""}{alert.title}
                            </span>
                            <span style={{ display:"block", fontSize:12, fontWeight:600, color:"#92400E", marginTop:2 }}>
                              {alert.reasonLabel}
                            </span>
                            {alert.comment && (
                              <span style={{ display:"block", fontSize:12, color:"var(--fg-3)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {alert.comment}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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

          {/* Two-tab strip. Sub-scopes (Sin asignar, Reprogramadas,
              Levantamientos) live inside the merged Mostrar/Ordenar dropdown
              in the header so the tab bar stays focused on the big split. */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            {[
              { key:"pendientes" as const, label:"Pendientes", count:filteredCounts.pendientes.todas },
              { key:"completas"  as const, label:"Completas",  count:filteredCounts.completas.todas },
            ].map((t, i) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    // Reset scope when switching tabs because some scopes don't
                    // apply on both sides (e.g. "Sin asignar" is meaningless on
                    // Completas, "Reprogramadas" requires en_espera).
                    setScope("todas");
                  }}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"12px 16px",
                    background: isActive ? "var(--surface-hover)" : "var(--surface-1)",
                    border:"none",
                    borderRight: i === 0 ? "1px solid var(--border)" : "none",
                    borderBottom: isActive ? "2px solid var(--brand)" : "2px solid transparent",
                    cursor:"pointer", fontFamily:"inherit",
                    transition:"background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-1)"; }}
                >
                  <span style={{ fontSize:13, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--brand-fg)" : "var(--fg-2)" }}>
                    {t.label}
                  </span>
                  <span style={{
                    fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:4,
                    background: isActive ? "var(--brand-tint)" : "var(--surface-hover)",
                    color: isActive ? "var(--brand-fg)" : "var(--fg-4)",
                  }}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Mostrar + Ordenar dropdown row. Sits directly under the tab strip
              so its options re-scope to the active tab (Pendientes vs Completas).
              The trigger surfaces the current sort label; the menu inside has
              two sections: "Mostrar" (scope) and "Ordenar por" (sort). A red
              dot on the trigger and beside each scope means OTs are waiting. */}
          {(() => {
            const scopeOptions: { value: ScopeKey; label: string; count: number }[] =
              tab === "pendientes"
                ? [
                    { value: "todas",          label: "Todas",                       count: filteredCounts.pendientes.todas },
                    { value: "sin_asignar",    label: "Sin asignar",                 count: filteredCounts.pendientes.sin_asignar },
                    { value: "reprogramadas",  label: "Reprogramadas",               count: filteredCounts.pendientes.reprogramadas },
                    { value: "levantamientos", label: "Levantamientos pendientes",   count: filteredCounts.pendientes.levantamientos },
                  ]
                : [
                    { value: "todas",          label: "Todas",                       count: filteredCounts.completas.todas },
                    { value: "levantamientos", label: "Levantamientos completados",  count: filteredCounts.completas.levantamientos },
                  ];
            // Red dot means "needs attention". Completed work doesn't need
            // attention, so we only ever surface dots on the Pendientes tab.
            const triggerHasAttention = tab === "pendientes" && scopeOptions.some(s => s.value !== "todas" && s.count > 0);
            return (
              <div ref={sortRef} style={{ position:"relative", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
                <button
                  type="button"
                  onClick={() => setSortOpen(v => !v)}
                  style={{
                    display:"flex", alignItems:"center", gap:6,
                    width:"100%", padding:"10px 16px",
                    background:"var(--surface-1)", border:"none",
                    fontSize:13, color:"var(--fg-2)",
                    cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                >
                  <span style={{ color:"var(--fg-3)" }}>Ordenar por:</span>
                  <span style={{ fontWeight:600, color:"var(--brand-fg)" }}>{currentSortLabel}</span>
                  <ChevronDown size={14} style={{ color:"var(--brand-fg)", transform: sortOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
                  {triggerHasAttention && (
                    <span aria-label="Hay órdenes que requieren atención"
                          style={{
                            width:8, height:8, borderRadius:"50%",
                            background:"var(--danger)", marginLeft:4,
                          }} />
                  )}
                  <span style={{ marginLeft:"auto" }} />
                </button>
                {sortOpen && (
                  <div style={{
                    position:"absolute", left:8, right:8, top:"calc(100% + 4px)", zIndex:50,
                    background:"var(--surface-1)", border:"1px solid var(--border)",
                    borderRadius:8, boxShadow:"0 8px 24px rgba(15,23,42,0.12)",
                    overflow:"hidden",
                  }}>
                    {/* Mostrar — scope filter */}
                    <div style={{ padding:"8px 14px 4px", fontSize:10, fontWeight:700, color:"var(--fg-4)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Mostrar
                    </div>
                    {scopeOptions.map(o => {
                      const isActive = scope === o.value;
                      const hasAttention = tab === "pendientes" && o.value !== "todas" && o.count > 0;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => { setScope(o.value); setSortOpen(false); }}
                          style={{
                            display:"flex", alignItems:"center", gap:8,
                            width:"100%", textAlign:"left",
                            padding:"9px 14px", background: isActive ? "var(--brand-tint)" : "transparent",
                            border:"none", fontSize:13,
                            color: isActive ? "var(--brand-fg)" : "var(--fg-1)",
                            fontWeight: isActive ? 600 : 400,
                            cursor:"pointer", fontFamily:"inherit",
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{ flex:1 }}>{o.label}</span>
                          {hasAttention && (
                            <span style={{
                              width:8, height:8, borderRadius:"50%",
                              background:"var(--danger)", flexShrink:0,
                            }} />
                          )}
                          <span style={{
                            fontSize:11, fontWeight:600, minWidth:18, textAlign:"right",
                            color: isActive ? "var(--brand-fg)" : "var(--fg-4)",
                          }}>
                            {o.count}
                          </span>
                        </button>
                      );
                    })}

                    {/* Ordenar por */}
                    <div style={{ borderTop:"1px solid var(--border)" }} />
                    <div style={{ padding:"8px 14px 4px", fontSize:10, fontWeight:700, color:"var(--fg-4)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Ordenar por
                    </div>
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
            );
          })()}

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
                  {search
                    ? "Sin resultados para tu búsqueda"
                    : scope === "sin_asignar"   ? "No hay órdenes sin asignar"
                    : scope === "reprogramadas" ? "No hay órdenes reprogramadas"
                    : scope === "levantamientos" ? "No hay levantamientos"
                    : tab === "completas"       ? "No hay órdenes completadas"
                    : "No tienes ninguna Orden de Trabajo"}
                </p>
                {!search && tab === "pendientes" && scope === "todas" && (
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); openCreate(); }}
                    style={{ fontSize:13, color:"var(--brand-fg)", fontWeight:500, textDecoration:"underline" }}
                  >
                    Crea la primera Orden de Trabajo
                  </a>
                )}
              </div>
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
                  coordinadaPara={scope === "reprogramadas" ? (o.fecha_inicio ?? null) : null}
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
                  onOpenOrden={(id) => openOT(id, true)}
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
            style={{
              background: "var(--surface-1)",
              borderRadius: 14,
              width: 520,
              maxHeight: "calc(100vh - 48px)",   // never overflow the viewport
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(15,23,42,0.20)",
              overflow: "hidden",
            }}
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

            {/* Scrollable body: columns + select-all + scheduler */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ padding:"8px 20px 4px" }}>
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

            {/* Scheduled email reports */}
            <ExportScheduler
              defaultColumns={exportCols}
              canManage={myRol === "admin" || myRol === "owner"}
            />
            </div>
            {/* /scrollable body */}

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
