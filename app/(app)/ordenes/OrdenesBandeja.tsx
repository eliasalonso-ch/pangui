"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X, ChevronDown, Loader2, FileText, ArrowUpDown, Download, AlertTriangle, Calendar, List, CalendarDays, Columns3, Check } from "lucide-react";
import { createClient, logRealtimeChannel } from "@/lib/supabase";
import { fetchOrden, fetchOrdenesPage, fetchAllOrdenesForExport, fetchOrdenListItem, searchOrdenes, ORDENES_SEARCH_LIMIT, deleteOrden, ORDENES_PAGE_SIZE, parseDescMeta, fetchMarcadasIds, toggleMarcada } from "@/lib/ordenes-api";
import { buildOrdenesWorkbook, type ExportCols as SharedExportCols, type OrdenInput, type HojaInput, type FilaInput, type FotoItemInput, type MaterialUsadoInput } from "@/lib/excel-export-shared";
import { ExportScheduler } from "./ExportScheduler";
import OTRow from "./OTRow";
import CalendarView from "./CalendarView";
import KanbanView from "./KanbanView";
import OTDetail from "./OTDetail";
import OTCrearPanel from "./OTCrearPanel";
import OTEditPanel from "./OTEditPanel";
import OTFiltrosPanel from "./OTFiltrosPanel";
import { FilterBar } from "./OTFiltrosPanel";
import { addDaysKey, chileDateKey, dateKey, monthEndKey, monthStartKey } from "./date-utils";
import type {
  OrdenListItem, OrdenTrabajo,
  Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Estado, FiltrosState, SortOption, TipoTrabajo,
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

type PendingScopeKey = "sin_asignar" | "sin_progreso" | "vencidas" | "reprogramadas" | "materiales" | "levantamientos" | "presupuestos" | "otras";

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

// How many rows to reveal per infinite-scroll step.
const VISIBLE_CHUNK = 30;

// "Sin progreso": nobody has touched the OT yet — it's still in its initial
// `pendiente` state AND the timer was never started. Any state change
// (en_espera / en_curso / completado) or any timer activity counts as progress.
// Gating on `estado === "pendiente"` is the primary, always-present signal;
// the timer fields catch a pendiente OT that was started then reset.
function sinProgreso(o: OrdenListItem): boolean {
  if (o.estado !== "pendiente") return false;
  if (o.en_ejecucion) return false;
  if (o.iniciado_at) return false;
  if ((o.tiempo_total_segundos ?? 0) > 0) return false;
  return true;
}

// "Vencida": has a due date in the past and isn't completed.
function estaVencida(o: OrdenListItem): boolean {
  if (o.estado === "completado" || !o.fecha_termino) return false;
  const dueKey = dateKey(o.fecha_termino);
  return !!dueKey && dueKey < chileDateKey();
}

function esLevantamiento(o: OrdenListItem): boolean {
  return o.clasificacion === "levantamiento" || o.tipo_trabajo === "levantamiento";
}

function esPresupuesto(o: OrdenListItem): boolean {
  return o.tipo_trabajo === "presupuesto";
}

function pendingScopeFor(
  o: OrdenListItem,
  reprogramadaIds: Set<string>,
  faltanMaterialesIds: Set<string>,
): PendingScopeKey {
  if (esLevantamiento(o)) return "levantamientos";
  if (esPresupuesto(o)) return "presupuestos";
  if (estaVencida(o)) return "vencidas";
  if (!o.asignados_ids || o.asignados_ids.length === 0) return "sin_asignar";
  if (sinProgreso(o)) return "sin_progreso";
  if (faltanMaterialesIds.has(o.id)) return "materiales";
  if (reprogramadaIds.has(o.id)) return "reprogramadas";
  return "otras";
}

// Resizable list/detail split (desktop list view).
const LIST_WIDTH_KEY = "ordenes:listWidth";
const DEFAULT_LIST_WIDTH = 400;
const MIN_LIST_WIDTH = 320;
// Smallest width the detail panel is allowed to keep, so dragging can't crush it.
const MIN_DETAIL_WIDTH = 480;

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
  const [allOrdenesForCounts, setAllOrdenesForCounts] = useState<OrdenListItem[] | null>(
    () => initialOrdenes.length < ORDENES_PAGE_SIZE ? initialOrdenes : null,
  );
  const [hasMoreOrdenes, setHasMoreOrdenes] = useState(initialOrdenes.length >= ORDENES_PAGE_SIZE);
  const [loadingMoreOrdenes, setLoadingMoreOrdenes] = useState(false);
  // Client-side infinite scroll: we hold the full filtered list in memory but
  // only render `visibleCount` rows, growing as the user scrolls. This keeps
  // the DOM light even when a tab has hundreds of OTs.
  // Lazy initializer keeps the module-level constant out of the synchronous
  // render path, which avoids a transient TDZ ReferenceError during a partial
  // Fast Refresh / HMR rebuild in dev.
  const [visibleCount, setVisibleCount] = useState(() => VISIBLE_CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const [detail, setDetail]     = useState<OrdenTrabajo | null>(null);
  const selectedRef = useRef<string | null>(initialSelectedId ?? null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Per-user "marcar como leída/vista": ids the current user has marked. Loaded
  // once for the workspace; toggles update optimistically.
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [ocultarMarcadas, setOcultarMarcadas] = useState(false);
  useEffect(() => {
    fetchMarcadasIds().then(setMarcadas).catch(() => { /* non-fatal: feature just stays empty */ });
  }, []);

  const handleToggleMarcada = useCallback((id: string, next: boolean) => {
    // Optimistic: flip locally, revert on error.
    setMarcadas(prev => {
      const s = new Set(prev);
      if (next) s.add(id); else s.delete(id);
      return s;
    });
    toggleMarcada(id, next).catch(() => {
      setMarcadas(prev => {
        const s = new Set(prev);
        if (next) s.delete(id); else s.add(id);
        return s;
      });
    });
  }, []);

  // Two top-level tabs only; the previous sub-tabs (Sin asignar, Reprogramadas,
  // Levantamientos) are now scope filters inside the merged Mostrar/Ordenar
  // dropdown so the supervisor can drill in without losing the rest of the list.
  type ViewKey = "lista" | "calendario" | "kanban";
  const [view, setView] = useState<ViewKey>(
    () => {
      const v = searchParams?.get("vista");
      if (v === "calendario") return "calendario";
      if (v === "kanban")     return "kanban";
      return "lista";
    },
  );

  type TabKey = "pendientes" | "completas";
  type ScopeKey = "todas" | PendingScopeKey;

  const [tab, setTab]           = useState<TabKey>(() => {
    const f = searchParams?.get("filtro");
    if (f === "completadas_hoy")  return "completas";
    return "pendientes";
  });
  const [scope, setScope]       = useState<ScopeKey>(() => {
    const f = searchParams?.get("filtro");
    if (f === "sin_asignar")     return "sin_asignar";
    if (f === "sin_progreso")    return "sin_progreso";
    if (f === "vencidas")        return "vencidas";
    if (f === "reprogramadas")   return "reprogramadas";
    if (f === "materiales")      return "materiales";
    if (f === "levantamientos")  return "levantamientos";
    if (f === "presupuestos")    return "presupuestos";
    if (f === "otras")           return "otras";
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
    if (f === "reprogramadas")    return EMPTY_FILTROS;
    if (f === "materiales")       return EMPTY_FILTROS;
    if (f === "sin_asignar")      return EMPTY_FILTROS;
    if (f === "asignado")         return { ...EMPTY_FILTROS, soloAsignados: true };
    if (f === "levantamientos")   return EMPTY_FILTROS;
    if (f === "presupuestos")     return EMPTY_FILTROS;
    if (f === "vencidas")         return EMPTY_FILTROS;
    if (f === "vence_hoy")        return { ...EMPTY_FILTROS, fechaVencimiento: "hoy" as const };
    if (f === "completadas_hoy")  return { ...EMPTY_FILTROS, estados: ["completado"] };
    return EMPTY_FILTROS;
  });
  const [isDesktop, setIsDesktop] = useState(false);
  // Resizable split between the list and the detail panel (desktop list view).
  // Persisted so the user's chosen width survives reloads. Clamped on read.
  const [listWidth, setListWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_LIST_WIDTH;
    const saved = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_LIST_WIDTH ? saved : DEFAULT_LIST_WIDTH;
  });
  const [resizing, setResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [sortOpen, setSortOpen]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportConfigOpen, setExportConfigOpen] = useState(false);
  // True total of parent OTs in the workspace (not just the loaded pages), so
  // the export modal's "X de Y" reflects what will actually export.
  const [totalOrdenesCount, setTotalOrdenesCount] = useState<number | null>(null);
  useEffect(() => {
    if (!exportConfigOpen) return;
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const { count } = await sb
        .from("ordenes_trabajo")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .is("parent_id", null)
        .is("deleted_at", null);
      if (!cancelled) setTotalOrdenesCount(count ?? null);
    })();
    return () => { cancelled = true; };
  }, [exportConfigOpen, wsId]);
  // waitingAlerts is still loaded so we can derive `reprogramadaIds` for the
  // filter chips, even though the visible "En espera" banner/pill was removed.
  const [waitingAlerts, setWaitingAlerts] = useState<WaitingAlert[]>([]);

  type ExportCol =
    | "numero" | "n_serie" | "hito" | "titulo" | "estado" | "prioridad" | "tipo_trabajo"
    | "descripcion" | "solicitante"
    | "categoria" | "ubicacion" | "activo" | "asignados" | "creado" | "fecha_limite" | "fecha_completacion" | "marcada" | "resumen"
    | "hoja_calculo" | "materiales_inventario";

  const EXPORT_COLS: { key: ExportCol; label: string; group: string }[] = [
    { key: "numero",       label: "ID (N° interno)",     group: "Información general" },
    { key: "n_serie",      label: "N° OT (SF folio)",    group: "Información general" },
    { key: "hito",         label: "ITO",                 group: "Información general" },
    { key: "titulo",       label: "Título",              group: "Información general" },
    { key: "estado",       label: "Estado",              group: "Información general" },
    { key: "ubicacion",    label: "Ubicación",           group: "Información general" },
    { key: "descripcion",  label: "Descripción",         group: "Información general" },
    { key: "solicitante",  label: "Solicitante",         group: "Información general" },
    { key: "prioridad",    label: "Prioridad",           group: "Información general" },
    { key: "tipo_trabajo", label: "Tipo",                group: "Información general" },
    { key: "categoria",    label: "Categoría",           group: "Información general" },
    { key: "activo",       label: "Activo / Equipo",     group: "Información general" },
    { key: "asignados",    label: "Asignados",           group: "Información general" },
    { key: "fecha_limite",       label: "Fecha vencimiento",   group: "Fechas" },
    { key: "fecha_completacion", label: "Fecha completación",  group: "Fechas" },
    { key: "creado",             label: "Creado el",           group: "Fechas" },
    { key: "marcada",            label: "Marcada (leída)",     group: "Otros" },
    { key: "resumen",               label: "Hoja de resumen KPIs",    group: "Otros" },
    { key: "hoja_calculo",          label: "Hoja de cálculo + Fotos",  group: "Materiales" },
    { key: "materiales_inventario", label: "Materiales de inventario", group: "Materiales" },
  ];

  const ALL_COLS_ON  = Object.fromEntries(EXPORT_COLS.map(c => [c.key, true]))  as Record<ExportCol, boolean>;
  const ALL_COLS_OFF = Object.fromEntries(EXPORT_COLS.map(c => [c.key, false])) as Record<ExportCol, boolean>;
  const [exportCols, setExportCols] = useState<Record<ExportCol, boolean>>(ALL_COLS_ON);

  // In-modal filters so the user can narrow the export without first touching
  // the bandeja's filter panel. Empty arrays = no filter.
  const [exportFilterEstados, setExportFilterEstados] = useState<Estado[]>([]);
  const [exportFilterTipos,   setExportFilterTipos]   = useState<TipoTrabajo[]>([]);

  const EXPORT_FILTER_ESTADOS: { value: Estado; label: string; color: string }[] = [
    { value: "pendiente",  label: "Asignada",   color: "#3B82F6" },
    { value: "en_espera",  label: "En espera",  color: "#F59E0B" },
    { value: "en_curso",   label: "En curso",   color: "#8B5CF6" },
    { value: "completado", label: "Completada", color: "#10B981" },
  ];

  const EXPORT_FILTER_TIPOS: { value: TipoTrabajo; label: string }[] = [
    { value: "reactiva",     label: "Reactiva" },
    { value: "preventiva",   label: "Preventiva" },
    { value: "emergencia",   label: "Emergencia" },
    { value: "presupuesto",  label: "Presupuesto" },
    { value: "levantamiento",label: "Levantamiento" },
  ];

  const [rightPanel, setRightPanel] = useState<"none" | "create" | "edit">(initialPanel === "create" ? "create" : "none");

  // Keep left-panel visible when right panel is open (desktop only hides list on mobile)
  const sortRef = useRef<HTMLDivElement>(null);
  const countOrdenes = allOrdenesForCounts ?? ordenes;

  const waitingOrderIds = useMemo(
    () => countOrdenes.filter(o => o.estado === "en_espera").map(o => o.id).sort().join(","),
    [countOrdenes],
  );

  // Load initial order from ?id= (SSR-provided via the page component).
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
    const waiting = countOrdenes.filter(o => o.estado === "en_espera");
    if (waiting.length === 0) {
      setWaitingAlerts([]);
      return;
    }

    let cancelled = false;
    const ids = waiting.map(o => o.id);

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
    }

    loadWaitingReasons();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOrderIds]);

  // Open order detail
  const openOT = useCallback(async (id: string, pushUrl = true) => {
    if (pushUrl) {
      // Preserve the calendar-view param so dismissing the modal doesn't
      // bounce the supervisor back to the list view.
      const params = new URLSearchParams();
      params.set("id", id);
      if (view === "calendario") params.set("vista", "calendario");
      else if (view === "kanban") params.set("vista", "kanban");
      router.push(`/ordenes?${params.toString()}`, { scroll: false });
    }
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
  }, [router, view]);

  const openCreate = useCallback(() => {
    const baseQs = view === "calendario" ? "vista=calendario&" : view === "kanban" ? "vista=kanban&" : "";
    router.push(`/ordenes?${baseQs}panel=crear`, { scroll: false });
    setSelected(null);
    setDetail(null);
    setRightPanel("create");
  }, [router, view]);

  // Stable per-list callbacks so memoized OTRows don't re-render on every parent
  // update. These take the OT id and avoid per-row inline closures.
  const handleRowClick = useCallback((id: string) => openOT(id, true), [openOT]);

  const handleRowAssigned = useCallback((id: string, newIds: string[]) => {
    setOrdenes(prev =>
      prev.map(x => x.id === id ? { ...x, asignados_ids: newIds.length > 0 ? newIds : null } : x)
    );
  }, []);

  // Sync the panel with the ?id= URL param so direct/pasted links open the
  // OT detail, and so closing the panel (which strips ?id=) clears it.
  useEffect(() => {
    const urlId = searchParams?.get("id") ?? null;
    if (urlId && urlId !== selected) {
      openOT(urlId, false);
    } else if (!urlId && selected) {
      setSelected(null);
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Refresh list from DB. The visible list stays paginated, but counts use a
  // complete workspace snapshot so they do not change as the user scrolls.
  const refreshList = useCallback(async () => {
    const [data, allForCounts] = await Promise.all([
      fetchOrdenesPage(wsId),
      fetchAllOrdenesForExport(wsId),
    ]);
    setOrdenes(data);
    setAllOrdenesForCounts(allForCounts);
    setHasMoreOrdenes(data.length >= ORDENES_PAGE_SIZE);
  }, [wsId]);

  useEffect(() => {
    let cancelled = false;
    fetchAllOrdenesForExport(wsId)
      .then(data => { if (!cancelled) setAllOrdenesForCounts(data); })
      .catch(() => { /* counts fall back to the loaded page until the next refresh */ });
    return () => { cancelled = true; };
  }, [wsId]);

  const loadMoreOrdenes = useCallback(async () => {
    if (loadingMoreOrdenes || !hasMoreOrdenes) return;
    // While a text search is active the list is server-search results (a
    // complete set), not the paginated loaded list — don't paginate then.
    if (search.trim()) return;
    const lastCreatedAt = ordenes[ordenes.length - 1]?.created_at ?? null;
    if (!lastCreatedAt) return;

    setLoadingMoreOrdenes(true);
    try {
      const nextPage = await fetchOrdenesPage(wsId, lastCreatedAt);
      setOrdenes(prev => {
        const seen = new Set(prev.map(o => o.id));
        const merged = [...prev, ...nextPage.filter(o => !seen.has(o.id))];
        return merged;
      });
      setHasMoreOrdenes(nextPage.length >= ORDENES_PAGE_SIZE);
    } finally {
      setLoadingMoreOrdenes(false);
    }
  }, [hasMoreOrdenes, loadingMoreOrdenes, ordenes, wsId, search]);

  // Poll list every 60s — no realtime channel for ordenes_trabajo.
  // Swallow transient network errors (e.g. the user's connection drops): the
  // next poll recovers. Without this, a failed fetch becomes an unhandled
  // promise rejection that surfaces as a crash.
  useEffect(() => {
    const id = setInterval(() => {
      refreshList().catch(() => { /* transient — next poll retries */ });
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshList]);

  useEffect(() => {
    if (!wsId) return;
    const sb = createClient();
    const channelName = `ordenes-trabajo-${wsId}`;
    const channelDetails = {
      channelName,
      screen: "OrdenesBandeja",
      table: "ordenes_trabajo",
      filter: `workspace_id=eq.${wsId}`,
    };
    logRealtimeChannel("create", channelDetails, sb);
    const channel = sb
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_trabajo", filter: `workspace_id=eq.${wsId}` },
        (payload) => {
          const selectedId = selectedRef.current;
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id?: string };
            if (!oldRow.id) return;
            setOrdenes(prev => prev.filter(o => o.id !== oldRow.id));
            if (selectedId === oldRow.id) setDetail(null);
            return;
          }

          const next = payload.new as Partial<OrdenTrabajo> & Partial<OrdenListItem> & { id?: string; deleted_at?: string | null };
          if (!next.id) return;

          // Soft-delete arrives as an UPDATE (deleted_at set). Treat it like a
          // removal so trashed OTs drop out of the active list.
          if (next.deleted_at) {
            setOrdenes(prev => prev.filter(o => o.id !== next.id));
            if (selectedId === next.id) setDetail(null);
            return;
          }

          if (payload.eventType === "INSERT") {
            refreshList().catch(() => { /* transient — next event/poll retries */ });
            return;
          }

          // On UPDATE, DON'T blind-merge payload.new: realtime only sends the
          // OT's own columns, so `{ ...o, ...next }` would wipe the joined
          // relations (categorias_ot / ubicaciones / activos) and, if the
          // update flipped a filtered field (estado, clasificacion, asignados),
          // leave a mis-shaped row that drops out of the filtered view. Refetch
          // the full list-row instead so the row stays correct and its filter
          // membership is accurate. If it's not in the list (restore from trash),
          // the same refetch reveals it via a full refresh.
          if (!next.id) return;
          const idToRefresh = next.id;
          setOrdenes(prev => {
            if (!prev.some(o => o.id === idToRefresh)) {
              refreshList().catch(() => { /* transient — next event/poll retries */ });
              return prev;
            }
            return prev;
          });
          fetchOrdenListItem(idToRefresh)
            .then(row => {
              if (!row) return; // became deleted/filtered-out server-side
              setOrdenes(prev => prev.map(o => o.id === idToRefresh ? row : o));
            })
            .catch(() => { /* transient — next event/poll retries */ });
          if (selectedId === next.id) {
            setDetail(prev => prev ? { ...prev, ...next } : prev);
          }
        },
      )
      .subscribe((status) => {
        logRealtimeChannel("status", { ...channelDetails, status }, sb);
      });

    return () => {
      logRealtimeChannel("remove:start", channelDetails, sb);
      void sb.removeChannel(channel).then(() => {
        logRealtimeChannel("remove:done", channelDetails, sb);
      });
    };
  }, [refreshList, wsId]);

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

  // OTs paused because materials are missing — same derivation as reprogramadas,
  // mirrors the mobile PauseSheet "Faltan materiales" reason.
  const faltanMaterialesIds = useMemo(
    () => new Set(waitingAlerts.filter(a => a.reason === "materiales").map(a => a.id)),
    [waitingAlerts],
  );

  // Server-side text search: the infinite-scroll list only holds loaded pages,
  // so an in-memory search can't find OTs the user hasn't scrolled to. When
  // there's a query we fetch matches from the server (debounced) and use those
  // as the base for the filter pipeline instead of the loaded list. Empty query
  // → back to the loaded list. `searchResults === null` means "not searching".
  const [searchResults, setSearchResults] = useState<OrdenListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchOrdenes(wsId, q);
        if (!cancelled) setSearchResults(rows);
      } catch {
        if (!cancelled) setSearchResults([]); // query failed → show no results, not stale
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, wsId]);

  const searchHitCap = searchResults !== null && searchResults.length >= ORDENES_SEARCH_LIMIT;

  // Apply filters + search + sort
  const filtered = useMemo(() => {
    // When searching, the base is the server results (all matches, loaded or
    // not); otherwise the loaded infinite-scroll list. The tab/scope/filtros
    // pipeline below still applies on top, so search respects the current view.
    const baseSource = searchResults ?? ordenes;
    // Tab decides active vs. completed; scope narrows further. Kanban shows
    // all states side-by-side, so the tab gate is bypassed in that view.
    let list = view === "kanban"
      ? baseSource.slice()
      : baseSource.filter(o =>
          tab === "pendientes" ? ACTIVE_ESTADOS.has(o.estado) : CLOSED_ESTADOS.has(o.estado)
        );

    if (scope !== "todas") {
      list = list.filter(o => pendingScopeFor(o, reprogramadaIds, faltanMaterialesIds) === scope);
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
      const todayStr = chileDateKey();
      const tomorrowStr = addDaysKey(todayStr, 1);
      const in7Str = addDaysKey(todayStr, 7);
      const in30Str = addDaysKey(todayStr, 30);
      const monthStart = monthStartKey(todayStr);
      const monthEnd = monthEndKey(todayStr);
      list = list.filter(o => {
        const d = dateKey(o.fecha_termino);
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

    // Hide the current user's marked ("leídas") OTs when the toggle is on.
    if (ocultarMarcadas) list = list.filter(o => !marcadas.has(o.id));

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
  }, [ordenes, searchResults, view, tab, scope, search, sort, filtros, ubicaciones, reprogramadaIds, faltanMaterialesIds, ocultarMarcadas, marcadas]);

  // The rows actually rendered — a window into `filtered` that grows on scroll.
  const visibleOrdenes = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  // Whenever the filtered set changes identity (tab/scope/search/filtros/sort),
  // reset the window back to the first chunk so we don't keep a stale large
  // count and so the list scrolls back to a sensible size.
  useEffect(() => {
    setVisibleCount(VISIBLE_CHUNK);
  }, [tab, scope, search, sort, filtros]);

  // True when there's more to show — either more rows already in memory, or
  // another server page to fetch. Drives both the observer and the fallback.
  const canShowMore = visibleCount < filtered.length || hasMoreOrdenes;

  // Infinite scroll: when the sentinel enters the viewport, reveal the next
  // chunk of in-memory rows; if we've exhausted what's loaded but the server
  // has more, fetch the next page.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canShowMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return;
        if (visibleCount < filtered.length) {
          setVisibleCount(c => Math.min(c + VISIBLE_CHUNK, filtered.length));
        } else if (hasMoreOrdenes && !loadingMoreOrdenes) {
          loadMoreOrdenes();
        }
      },
      { root: listScrollRef.current, rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canShowMore, visibleCount, filtered.length, hasMoreOrdenes, loadingMoreOrdenes, loadMoreOrdenes]);

  // Drag-to-resize the list/detail split. While `resizing`, follow the mouse and
  // clamp so neither pane collapses; persist the final width on release.
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = e.clientX - rect.left;
      const max = Math.max(MIN_LIST_WIDTH, rect.width - MIN_DETAIL_WIDTH);
      setListWidth(Math.round(Math.min(Math.max(raw, MIN_LIST_WIDTH), max)));
    };
    const onUp = () => setResizing(false);
    // Avoid text selection / iframe capture while dragging.
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [resizing]);

  // Persist the chosen width (debounced implicitly by only writing on change).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
    }
  }, [listWidth]);

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
        const todayStr = chileDateKey();
        const tomorrowStr = addDaysKey(todayStr, 1);
        const in7Str = addDaysKey(todayStr, 7);
        const in30Str = addDaysKey(todayStr, 30);
        const monthStart = monthStartKey(todayStr);
        const monthEnd = monthEndKey(todayStr);
        list = list.filter(o => {
          const d = dateKey(o.fecha_termino);
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
    const countSource = searchResults ?? countOrdenes;
    const active = countSource.filter(o => ACTIVE_ESTADOS.has(o.estado));
    const closed = countSource.filter(o => CLOSED_ESTADOS.has(o.estado));
    const activeByScope = {
      sin_asignar: [] as OrdenListItem[],
      sin_progreso: [] as OrdenListItem[],
      vencidas: [] as OrdenListItem[],
      reprogramadas: [] as OrdenListItem[],
      materiales: [] as OrdenListItem[],
      levantamientos: [] as OrdenListItem[],
      presupuestos: [] as OrdenListItem[],
      otras: [] as OrdenListItem[],
    } satisfies Record<PendingScopeKey, OrdenListItem[]>;

    for (const o of active) {
      activeByScope[pendingScopeFor(o, reprogramadaIds, faltanMaterialesIds)].push(o);
    }

    return {
      pendientes: {
        todas:         applyFilters(active).length,
        sin_asignar:    applyFilters(activeByScope.sin_asignar).length,
        sin_progreso:   applyFilters(activeByScope.sin_progreso).length,
        vencidas:       applyFilters(activeByScope.vencidas).length,
        reprogramadas:  applyFilters(activeByScope.reprogramadas).length,
        materiales:     applyFilters(activeByScope.materiales).length,
        levantamientos: applyFilters(activeByScope.levantamientos).length,
        presupuestos:   applyFilters(activeByScope.presupuestos).length,
        otras:          applyFilters(activeByScope.otras).length,
      },
      completas: {
        todas:          applyFilters(closed).length,
        levantamientos: applyFilters(closed.filter(esLevantamiento)).length,
        presupuestos:   applyFilters(closed.filter(esPresupuesto)).length,
      },
    };
  }, [countOrdenes, searchResults, filtros, search, ubicaciones, reprogramadaIds, faltanMaterialesIds]);
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? "";

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

      // Export ALL ordenes (ignore tab split), but keep filters + search applied.
      // Fetch the COMPLETE server set — not the in-memory paginated `ordenes`,
      // which only holds the pages the user scrolled into and would silently
      // drop unloaded orders (e.g. older completadas past the first 300).
      // In-modal export filters (estado / tipo) layer on top of the bandeja's
      // global filtros so the user can narrow further at export time.
      const allOrdenes = await fetchAllOrdenesForExport(wsId);
      const allFiltered = (() => {
        let list = [...allOrdenes];
        if (exportFilterEstados.length)  list = list.filter(o => exportFilterEstados.includes(o.estado));
        if (exportFilterTipos.length)    list = list.filter(o => o.tipo_trabajo != null && exportFilterTipos.includes(o.tipo_trabajo));
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
        updated_at: (o as OrdenListItem & { updated_at?: string | null }).updated_at ?? null,
        marcada: marcadas.has(o.id),
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

  // Desktop list view shows the list + detail side by side with a draggable
  // divider; other views (calendar/kanban) or mobile don't get the resizer.
  const isResizableSplit = isDesktop && view !== "calendario" && view !== "kanban";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", overflow:"hidden", background:"var(--c-bg, #F8FAFC)" }}>

      {/* ── Navigation header ── */}
      <div style={{ flexShrink:0, borderBottom:"1px solid var(--border)", background:"var(--surface-1)" }}>

        {/* Top row */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 20px", height:56, gap:12,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
            <h1 style={{ fontSize:20, fontWeight:700, color:"var(--fg-1)", letterSpacing:"-0.3px", lineHeight:1.25, margin:0 }}>
              Órdenes de Trabajo
            </h1>
            {/* Vista toggle. Same URL, ?vista= param for shareable links. */}
            <div style={{ display:"flex", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", height:32 }}>
              {([
                { key: "lista" as const,      label: "Lista",      icon: List },
                { key: "calendario" as const, label: "Calendario", icon: CalendarDays },
                { key: "kanban" as const,     label: "Kanban",     icon: Columns3 },
              ]).map((v, i, arr) => {
                const isActive = view === v.key;
                const Icon = v.icon;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => {
                      setView(v.key);
                      const params = new URLSearchParams(searchParams?.toString() ?? "");
                      if (v.key === "lista") params.delete("vista");
                      else params.set("vista", v.key);
                      router.replace(`/ordenes${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
                    }}
                    style={{
                      display:"flex", alignItems:"center", gap:6,
                      padding:"0 12px", height:"100%",
                      background: isActive ? "var(--brand)" : "var(--surface-1)",
                      color: isActive ? "white" : "var(--fg-2)",
                      border:"none", borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                      fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
                    }}
                  >
                    <Icon size={13} />
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"flex-end" }}>
            {/* Search */}
            <div style={{ position:"relative", maxWidth:280, flex:1 }}>
              <Search size={14} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--fg-4)", pointerEvents:"none" }} />
              <input
                type="text"
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
              {(searching || searchHitCap) && (
                <div style={{ position:"absolute", left:0, top:"calc(100% + 4px)", fontSize:11, color:"var(--fg-4)", whiteSpace:"nowrap" }}>
                  {searching ? "Buscando…" : `Más de ${ORDENES_SEARCH_LIMIT} resultados · refina la búsqueda`}
                </div>
              )}
            </div>


            {/* Nueva OT button */}
            <button
              type="button"
              onClick={openCreate}
              style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"0 16px", height:38,
                background:"var(--brand)", color:"var(--fg-on-brand)",
                border:"none", borderRadius:8,
                fontSize:13, fontWeight:600,
                cursor:"pointer", fontFamily:"inherit",
                transition:"opacity 0.1s", whiteSpace:"nowrap", flexShrink:0,
                boxShadow:"0 2px 6px rgba(0,122,255,0.25)",
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

          {/* Ocultar leídas/marcadas (per-user) */}
          <button
            type="button"
            onClick={() => setOcultarMarcadas(v => !v)}
            title={ocultarMarcadas ? "Mostrar las OTs que marcaste" : "Ocultar las OTs que marcaste"}
            aria-pressed={ocultarMarcadas}
            style={{
              display:"flex", alignItems:"center", gap:5,
              height:28, padding:"0 10px",
              border:"1px solid " + (ocultarMarcadas ? "var(--brand)" : "var(--border)"),
              borderRadius:6,
              background: ocultarMarcadas ? "var(--brand-tint)" : "var(--surface-1)",
              color: ocultarMarcadas ? "var(--brand-fg)" : "var(--fg-2)",
              fontSize:12, fontWeight:500, cursor:"pointer",
              fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.12s",
            }}
          >
            <Check size={12} />
            Ocultar leídas
          </button>

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
      <div ref={splitContainerRef} style={{ display:"flex", flexGrow:1, flexShrink:1, flexBasis:0, minHeight:0, minWidth:0, overflow:"hidden" }}>

        {/* LEFT: list column OR calendar. In desktop list view the width is
            user-resizable (fixed px, draggable handle on the right). Calendar/
            kanban take the full remaining width; mobile stays full-width. */}
        <div style={{
          display: (!isDesktop && (selected || rightPanel === "create" || rightPanel === "edit")) ? "none" : "flex",
          flexDirection:"column",
          width: isResizableSplit ? listWidth : ((view === "calendario" || view === "kanban") ? undefined : (isDesktop ? undefined : "100%")),
          minWidth: 0,
          flexGrow:   isResizableSplit ? 0 : 1,
          flexShrink: isResizableSplit ? 0 : 1,
          flexBasis:  isResizableSplit ? "auto" : 0,
          borderRight: isDesktop ? "1px solid var(--border)" : "none",
          background:"var(--surface-1)",
          position:"relative",
        }}>
          {view === "calendario" ? (
            <CalendarView
              ordenes={filtered}
              reprogramadaIds={reprogramadaIds}
              selectedId={selected}
              myId={myId}
              usuarios={usuarios}
              onOpenOT={(id) => openOT(id, true)}
              onPatchOrden={(id, patch) => setOrdenes(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))}
            />
          ) : view === "kanban" ? (
            <KanbanView
              ordenes={filtered}
              reprogramadaIds={reprogramadaIds}
              selectedId={selected}
              myId={myId}
              usuarios={usuarios}
              onOpenOT={(id) => openOT(id, true)}
              onPatchOrden={(id, patch) => setOrdenes(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))}
            />
          ) : (<>


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
                    { value: "sin_progreso",   label: "Sin progreso",                count: filteredCounts.pendientes.sin_progreso },
                    { value: "vencidas",       label: "Vencidas",                    count: filteredCounts.pendientes.vencidas },
                    { value: "reprogramadas",  label: "Reprogramadas",               count: filteredCounts.pendientes.reprogramadas },
                    { value: "materiales",     label: "Faltan materiales",           count: filteredCounts.pendientes.materiales },
                    { value: "levantamientos", label: "Levantamientos pendientes",   count: filteredCounts.pendientes.levantamientos },
                    { value: "presupuestos",   label: "Presupuestos pendientes",     count: filteredCounts.pendientes.presupuestos },
                    { value: "otras",          label: "Otras pendientes",            count: filteredCounts.pendientes.otras },
                  ]
                : [
                    { value: "todas",          label: "Todas",                       count: filteredCounts.completas.todas },
                    { value: "levantamientos", label: "Levantamientos completados",  count: filteredCounts.completas.levantamientos },
                    { value: "presupuestos",   label: "Presupuestos completados",    count: filteredCounts.completas.presupuestos },
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
          <div ref={listScrollRef} style={{ flex:1, minHeight:0, overflowY:"auto" }}>
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
                    : scope === "sin_progreso"  ? "No hay órdenes sin progreso"
                    : scope === "vencidas"      ? "No hay órdenes vencidas"
                    : scope === "reprogramadas" ? "No hay órdenes reprogramadas"
                    : scope === "materiales"    ? "No hay órdenes en espera por materiales"
                    : scope === "levantamientos" ? "No hay levantamientos"
                    : scope === "presupuestos"   ? "No hay presupuestos"
                    : scope === "otras"          ? "No hay otras órdenes pendientes"
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
              <>
                {visibleOrdenes.map((o, idx) => (
                  <OTRow
                    key={o.id}
                    orden={o}
                    rowNumber={idx + 1}
                    usuarios={usuarios}
                    isSelected={selected === o.id}
                    onClick={handleRowClick}
                    myId={myId}
                    onAssigned={handleRowAssigned}
                    coordinadaPara={scope === "reprogramadas" ? (o.fecha_inicio ?? null) : null}
                    isMarcada={marcadas.has(o.id)}
                    onToggleMarcada={handleToggleMarcada}
                  />
                ))}
                {canShowMore && (
                  // Sentinel — the IntersectionObserver watches this to auto-load
                  // the next chunk. The button is a fallback (and shows progress).
                  <div ref={sentinelRef} style={{ padding: "14px 16px 18px", display: "flex", justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (visibleCount < filtered.length) {
                          setVisibleCount(c => Math.min(c + VISIBLE_CHUNK, filtered.length));
                        } else {
                          loadMoreOrdenes();
                        }
                      }}
                      disabled={loadingMoreOrdenes}
                      style={{
                        height: 34, padding: "0 14px", border: "1px solid var(--border)",
                        borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)",
                        fontSize: 12, fontWeight: 700, cursor: loadingMoreOrdenes ? "default" : "pointer",
                        fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7,
                      }}
                    >
                      {loadingMoreOrdenes && <Loader2 size={13} className="animate-spin" />}
                      Cargar mas
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          </>)}
        </div>

        {/* Drag handle — sits on the divider between list and detail. Grab and
            drag horizontally to resize. Double-click resets to the default. */}
        {isResizableSplit && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Ajustar ancho de la lista"
            onMouseDown={() => setResizing(true)}
            onDoubleClick={() => setListWidth(DEFAULT_LIST_WIDTH)}
            style={{
              width: 7, flexShrink: 0, cursor: "col-resize",
              marginLeft: -4, marginRight: -3, zIndex: 5,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent",
            }}
          >
            {/* Thin visual grip; thickens/colors on hover or while dragging. */}
            <div
              style={{
                width: resizing ? 3 : 1, height: "100%",
                background: resizing ? "var(--brand)" : "transparent",
                transition: "background 0.12s, width 0.12s",
              }}
              onMouseEnter={e => { if (!resizing) { e.currentTarget.style.background = "var(--border-strong)"; e.currentTarget.style.width = "3px"; } }}
              onMouseLeave={e => { if (!resizing) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.width = "1px"; } }}
            />
          </div>
        )}

        {/* RIGHT: create panel or detail. Hidden in canvas views because the
            detail opens in a modal there. */}
        {isDesktop && view !== "calendario" && view !== "kanban" && (
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
                  isMarcada={marcadas.has(detail.id)}
                  onToggleMarcada={handleToggleMarcada}
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

      {/* ── OT detail modal (calendar & kanban views) ──
          In these views the right pane is hidden so the canvas can use
          full width. When the user clicks an event/card, the detail opens
          here as a centered modal. Clicking the backdrop or pressing the
          OTDetail close button dismisses it. */}
      {(view === "calendario" || view === "kanban") && (selected || rightPanel === "create" || (rightPanel === "edit" && detail)) && (
        <div
          style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(15,23,42,0.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
          onClick={() => { setSelected(null); setDetail(null); setRightPanel("none"); router.push(`/ordenes?vista=${view}`, { scroll: false }); }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:"var(--surface-1)", borderRadius:14,
              width:"min(960px, 100%)", height:"calc(100vh - 48px)", maxHeight:"calc(100vh - 48px)",
              display:"flex", flexDirection:"column",
              boxShadow:"0 20px 60px rgba(15,23,42,0.25)",
              overflow:"hidden",
            }}
          >
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
                onClose={() => { setRightPanel("none"); router.push(`/ordenes?vista=${view}`, { scroll: false }); }}
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
            ) : loadingDetail ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"80px 20px", gap:8, color:"var(--fg-4)", fontSize:13 }}>
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
                onClose={() => { setSelected(null); setDetail(null); setRightPanel("none"); router.push(`/ordenes?vista=${view}`, { scroll: false }); }}
                showCloseButton
                onOpenOrden={(id) => openOT(id, true)}
                isMarcada={marcadas.has(detail.id)}
                onToggleMarcada={handleToggleMarcada}
                onOrdenUpdated={(patch) => {
                  setDetail(prev => prev ? { ...prev, ...patch } : prev);
                  setOrdenes(prev => prev.map(o =>
                    o.id === detail.id ? { ...o, ...patch } : o
                  ));
                }}
              />
            ) : null}
          </div>
        </div>
      )}

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
                  {(exportFilterEstados.length > 0 || exportFilterTipos.length > 0)
                    ? `Coinciden con los filtros de ${totalOrdenesCount ?? ordenes.length} órdenes`
                    : `${totalOrdenesCount ?? ordenes.length} órdenes en total · selecciona las columnas a incluir`}
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

            {/* Scrollable body: filters + columns + select-all + scheduler */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>

            {/* In-modal filters — narrow the export without touching the
                bandeja's global filter panel. Applies on top of any filtros
                already set in the bandeja. */}
            <div style={{ padding:"12px 20px 4px", borderBottom:"1px solid var(--border)" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Filtrar por estado</span>
                  {exportFilterEstados.length > 0 && (
                    <button type="button" onClick={() => setExportFilterEstados([])}
                      style={{ fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                      Limpiar
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {EXPORT_FILTER_ESTADOS.map(e => {
                    const active = exportFilterEstados.includes(e.value);
                    return (
                      <button
                        key={e.value}
                        type="button"
                        onClick={() => setExportFilterEstados(prev =>
                          prev.includes(e.value) ? prev.filter(x => x !== e.value) : [...prev, e.value]
                        )}
                        style={{
                          height: 26, padding: "0 10px",
                          border: active ? `1.5px solid ${e.color}` : "1px solid var(--border)",
                          borderRadius: 4,
                          background: active ? e.color + "20" : "var(--surface-1)",
                          color: active ? e.color : "var(--fg-2)",
                          fontSize: 12, fontWeight: active ? 600 : 400,
                          cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 3,
                        }}
                      >
                        {active && <Check size={9} />}{e.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Filtrar por tipo de trabajo</span>
                  {exportFilterTipos.length > 0 && (
                    <button type="button" onClick={() => setExportFilterTipos([])}
                      style={{ fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                      Limpiar
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {EXPORT_FILTER_TIPOS.map(t => {
                    const active = exportFilterTipos.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setExportFilterTipos(prev =>
                          prev.includes(t.value) ? prev.filter(x => x !== t.value) : [...prev, t.value]
                        )}
                        style={{
                          height: 26, padding: "0 10px",
                          border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                          borderRadius: 4,
                          background: active ? "var(--brand-tint)" : "var(--surface-1)",
                          color: active ? "var(--brand)" : "var(--fg-2)",
                          fontSize: 12, fontWeight: active ? 600 : 400,
                          cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 3,
                        }}
                      >
                        {active && <Check size={9} />}{t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

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
