"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X, ChevronDown, Loader2, FileText, ArrowUp, ArrowUpDown, Download, AlertTriangle, Calendar, Check, Copy, DatabaseArrowDown, Eye, EyeOff } from "lucide-react";
import { createClient, logRealtimeChannel } from "@/lib/supabase";
import { esAdmin } from "@/lib/roles";
import { fetchOrdenesPage, fetchAllOrdenesForExport, fetchAllOrdenesBulk, fetchOrdenesCalendarExtras, fetchOrdenListItem, searchOrdenes, ORDENES_SEARCH_LIMIT, deleteOrden, ORDENES_PAGE_SIZE, parseDescMeta, fetchMarcadasIds, toggleMarcada, matchesSearch, ELECTRILAM_WORKSPACE_ID } from "@/lib/ordenes-api";
import { ordenQueryOptions } from "@/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { needsBulkSnapshot, BULK_MIN_INTERVAL_MS } from "./bulk-refresh";
import { needsFullWorkspaceSet } from "./list-source";
import { collectItos } from "./ito-filter";
import { applyFiltros } from "./filter-predicate";
import { initialFilterKeys, activeFilterKeys, filterKeysStorageKey, type FilterKey } from "./filter-registry";
import { mergeCalendarExtras } from "@/lib/orden-merge";
import { buildOrdenesWorkbook, type ExportCols as SharedExportCols, type OrdenInput, type HojaInput, type FilaInput, type FotoItemInput, type MaterialUsadoInput } from "@/lib/excel-export-shared";
import { ExportScheduler } from "./ExportScheduler";
import MeconectaCheck from "./MeconectaCheck";
import OTRow from "./OTRow";
import CalendarView from "./CalendarView";
import KanbanView from "./KanbanView";
import OTDetail from "./OTDetail";
import OTCrearPanel from "./OTCrearPanel";
import OTEditPanel from "./OTEditPanel";
import { FilterBar } from "./OTFiltrosPanel";
import {
  pendingScopeFor, esLevantamiento, esPresupuesto, estaVencida, sinProgreso,
  type PendingScopeKey,
} from "./pending-scope";
import { copyHojaToOrden } from "@/lib/hojas-api";
import { clearPendingHojaCopy, getPendingHojaCopy, type PendingHojaCopy } from "@/lib/hoja-copy-store";

import type {
  OrdenListItem, OrdenBulkItem, OrdenCalendarExtra, OrdenTrabajo,
  Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Estado, FiltrosState, SortOption, TipoTrabajo,
} from "@/types/ordenes";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_ESTADOS  = new Set<Estado>(["pendiente","en_espera","en_curso"]);
const CLOSED_ESTADOS  = new Set<Estado>(["completado"]);
const PRIORIDAD_ORDER: Record<string, number> = { urgente:4, alta:3, media:2, baja:1, ninguna:0 };

// `soloCompletas` marks options that only make sense once an OT is closed:
// "Completadas recientemente" would order the Pendientes tab by a column that is
// null for every row there.
const SORT_OPTIONS: { value: SortOption; label: string; soloCompletas?: true }[] = [
  { value: "prioridad_desc",     label: "Prioridad: Más alto primero" },
  { value: "created_at_desc",    label: "Más recientes primero" },
  { value: "completado_en_desc", label: "Completadas recientemente", soloCompletas: true },
  { value: "fecha_termino_asc",  label: "Fecha límite" },
  { value: "prioridad_asc",      label: "Prioridad: Más bajo primero" },
  { value: "ubicacion",          label: "Ubicación" },
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
  itos: [],
  fechaVencimiento: null,
  sinAsignar: false,
  soloAsignados: false,
  deUsuariosDadosDeBaja: false,
};


// How many rows to reveal per infinite-scroll step.
const VISIBLE_CHUNK = 30;

// A partir de cuánto scroll una OT nueva deja de insertarse sola. Arriba del
// todo no hay nada que empujar y la fila entra sin molestar; más abajo,
// insertarla correría el contenido que el usuario está leyendo.
const NUEVA_OT_UMBRAL_PX = 400;

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
  todayKey:        string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrdenesBandeja({
  initialOrdenes, usuarios, ubicaciones, lugares, sociedades, activos, categorias,
  myId, myRol, wsId, initialSelectedId, initialPanel,
  todayKey,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [ordenes, setOrdenes]   = useState<OrdenListItem[]>(initialOrdenes);
  // Mirror of `ordenes` for callbacks that must read the current list without
  // taking it as a dependency — notably the 60s poll, whose identity must stay
  // stable or its setInterval would be torn down and restarted on every list
  // update and effectively never fire.
  const ordenesRef = useRef<OrdenListItem[]>(initialOrdenes);
  useEffect(() => { ordenesRef.current = ordenes; }, [ordenes]);
  // El primer SUBSCRIBED del canal realtime no es una reconexión: la lista
  // recién llegó por SSR. Solo los siguientes implican un hueco que rellenar.
  const primeraSuscripcionRef = useRef(true);
  const [allOrdenesForCounts, setAllOrdenesForCounts] = useState<OrdenBulkItem[] | null>(
    () => initialOrdenes.length < ORDENES_PAGE_SIZE ? initialOrdenes : null,
  );
  // Calendar-only columns (recurrencia_config, activos), fetched the first time
  // the user opens the calendar. Null = not loaded for the current row set.
  const [calendarExtras, setCalendarExtras] = useState<Map<string, OrdenCalendarExtra> | null>(null);
  const [loadingCalendarExtras, setLoadingCalendarExtras] = useState(false);
  const [hasMoreOrdenes, setHasMoreOrdenes] = useState(initialOrdenes.length >= ORDENES_PAGE_SIZE);
  const [loadingMoreOrdenes, setLoadingMoreOrdenes] = useState(false);
  // State updates are asynchronous, so the observer and the fallback button
  // can otherwise start the same page request before React re-renders.
  const loadingMoreOrdenesRef = useRef(false);
  const loadMoreRetryAfterRef = useRef(0);
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
  // The key + fetcher + staleness rule for ["orden", id] now live in one place
  // (`ordenQueryOptions` in lib/queries.ts) so the hover prefetch and the click
  // open cannot drift apart — if they disagreed on key or staleTime the
  // prefetch would silently stop warming the open it exists to serve.
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

  // Two top-level tabs only; specialized pending buckets live inside the merged
  // Mostrar/Ordenar dropdown. "Sin asignar" is intentionally not a bucket there:
  // it is a universal filter in the top filter bar, so unassigned overdue/sin
  // progreso OTs still appear when that filter is active.
  type ViewKey = "lista" | "calendario" | "kanban";
  const view: ViewKey = pathname.endsWith("/calendario")
    ? "calendario"
    : pathname.endsWith("/kanban")
      ? "kanban"
      : "lista";
  const viewPath = `/ordenes/${view}`;

  type TabKey = "pendientes" | "completas";
  type ScopeKey = "todas" | PendingScopeKey;

  const [tab, setTab]           = useState<TabKey>(() => {
    const f = searchParams?.get("filtro");
    if (f === "completadas_hoy")  return "completas";
    return "pendientes";
  });
  const [scope, setScope]       = useState<ScopeKey>(() => {
    const f = searchParams?.get("filtro");
    // Nota: ?filtro=en_curso NO mapea a este scope. Ese deep link ya existe
    // (lo usa la tarjeta de /inicio) y aplica un filtro de estado sobre "Todas";
    // reapuntarlo al bucket filtraría dos veces y cambiaría lo que ya usa
    // la gente. El bucket "En curso" se alcanza desde el desplegable.
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
  // Arrancar en Completas (p. ej. ?filtro=completadas_hoy) también ordena por
  // fecha de cierre, igual que al cambiar de pestaña a mano.
  const [sort, setSort]         = useState<SortOption>(() => {
    const f = searchParams?.get("filtro");
    return f === "completadas_hoy" ? "completado_en_desc" : "created_at_desc";
  });

  // Pre-apply filter from URL param (e.g. ?filtro=urgentes from inicio dashboard)
  const [filtros, setFiltros]   = useState<FiltrosState>(() => {
    const f = searchParams?.get("filtro");
    if (f === "urgentes")         return { ...EMPTY_FILTROS, prioridades: ["urgente"] };
    if (f === "alta_prioridad")   return { ...EMPTY_FILTROS, prioridades: ["urgente", "alta"] };
    if (f === "en_curso")         return { ...EMPTY_FILTROS, estados: ["en_curso"] };
    if (f === "bloqueadas")       return { ...EMPTY_FILTROS, estados: ["en_espera"] };
    if (f === "reprogramadas")    return EMPTY_FILTROS;
    if (f === "materiales")       return EMPTY_FILTROS;
    if (f === "sin_asignar")      return { ...EMPTY_FILTROS, sinAsignar: true };
    if (f === "asignado")         return { ...EMPTY_FILTROS, soloAsignados: true };
    if (f === "levantamientos")   return EMPTY_FILTROS;
    if (f === "presupuestos")     return EMPTY_FILTROS;
    if (f === "vencidas")         return EMPTY_FILTROS;
    if (f === "vence_hoy")        return { ...EMPTY_FILTROS, fechaVencimiento: "hoy" as const };
    if (f === "completadas_hoy")  return { ...EMPTY_FILTROS, estados: ["completado"] };
    return EMPTY_FILTROS;
  });

  /**
   * Filtros visibles en la barra. Electrilam los ve todos (ya opera asi);
   * una cuenta nueva arranca con 4 y agrega el resto desde "+ Añadir filtro".
   * Es preferencia de UI, no dato: vive en localStorage por workspace, no en la
   * base. Los filtros que ya vienen con valor (deep link ?filtro=…) se muestran
   * si o si, para que la lista nunca salga recortada sin un chip que lo explique.
   */
  const [visibleFilterKeys, setVisibleFilterKeys] = useState<FilterKey[]>(() =>
    initialFilterKeys({ workspaceId: wsId, preseeded: activeFilterKeys(filtros) }),
  );
  // Se lee en un efecto y no en el inicializador para no desalinear el HTML del
  // servidor con el del cliente: localStorage no existe durante el SSR.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let saved: FilterKey[] | null = null;
    try {
      const raw = window.localStorage.getItem(filterKeysStorageKey(wsId));
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) saved = parsed as FilterKey[];
    } catch { /* preferencia corrupta → default */ }
    setVisibleFilterKeys(initialFilterKeys({
      workspaceId: wsId, saved, preseeded: activeFilterKeys(filtros),
    }));
    // Solo al montar / cambiar de workspace: despues manda la interaccion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const changeVisibleFilterKeys = useCallback((keys: FilterKey[]) => {
    setVisibleFilterKeys(keys);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(filterKeysStorageKey(wsId), JSON.stringify(keys));
    } catch { /* cuota llena / modo privado: la barra sigue funcionando */ }
  }, [wsId]);
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
  /**
   * Warms the detail cache for an OT without rendering it. Called from OTRow on
   * hover/focus, so the fetch overlaps the time the user spends moving the
   * mouse and deciding to click. Failures are swallowed: this is speculative
   * work, and a rejected prefetch must not surface an error or poison the
   * cache — openOT retries on a real click.
   */
  const prefetchOT = useCallback((id: string) => {
    // Respect whatever is already cached: prefetchQuery is a no-op while the
    // entry is fresh, so hovering the same row repeatedly costs nothing.
    const cached = queryClient.getQueryData<OrdenTrabajo | null>(["orden", id]);
    void queryClient.prefetchQuery(ordenQueryOptions(id, cached?.estado));
  }, [queryClient]);

  const openOT = useCallback(async (id: string, pushUrl = true) => {
    if (pushUrl) {
      const params = new URLSearchParams();
      params.set("id", id);
      router.push(`${viewPath}?${params.toString()}`, { scroll: false });
    }
    setRightPanel("none");
    setSelected(id);

    // Already-resolved record from a hover prefetch or an earlier open.
    const cached = queryClient.getQueryData<OrdenTrabajo | null>(["orden", id]);
    // The list row: enough to paint the panel before the full record lands.
    const row = ordenes.find(o => o.id === id) ?? countOrdenes.find(o => o.id === id);

    // Set below when the panel is already rendering this OT, so the spinner is
    // skipped — it would swap OTDetail out and flash the panel for no reason.
    let alreadyShowing = false;

    if (cached) {
      // Cache hit: paint the real record once. No partial seed, so OTDetail's
      // per-OT effects run a single time instead of twice.
      setDetail(cached);
      setLoadingDetail(false);
    } else if (row) {
      // Instant paint from the list row (titulo, estado, prioridad, ubicacion,
      // descripcion) while the full record loads. `_pending` marks it partial.
      setDetail({ ...(row as unknown as OrdenTrabajo), _pending: true });
      setLoadingDetail(false);
    } else {
      setDetail(prev => {
        if (prev?.id === id) {
          alreadyShowing = true;
          return prev;
        }
        return null;
      });
      setLoadingDetail(!alreadyShowing);
    }

    try {
      // fetchQuery de-duplicates against an in-flight prefetch and serves the
      // cache when still fresh, so hover-then-click is a single request. The
      // staleness window depends on the OT's state: completed OTs are
      // historical, open ones keep moving.
      const orden = await queryClient.fetchQuery(
        ordenQueryOptions(id, (cached ?? row)?.estado),
      );
      setDetail(prev => (prev && orden && prev === orden ? prev : (orden ?? null)));
    } catch {
      // Keep an instant-painted row on screen rather than blanking the panel.
      setDetail(prev => (prev?._pending ? prev : null));
    } finally {
      setLoadingDetail(false);
    }
  }, [router, viewPath, ordenes, countOrdenes, queryClient]);

  const openCreate = useCallback(() => {
    setSelected(null);
    setDetail(null);
    setRightPanel("create");
    const params = new URLSearchParams();
    params.set("panel", "crear");
    router.push(`${viewPath}?${params.toString()}`, { scroll: false });
  }, [router, viewPath]);

  // Stable per-list callbacks so memoized OTRows don't re-render on every parent
  // update. These take the OT id and avoid per-row inline closures.
  // ── "Copiar hoja a otra OT" mode ──────────────────────────────────────────
  // Entered from a sheet (?copiarHoja=1). The bandeja keeps all of its normal
  // filtering; the only change is that clicking an OT confirms the copy instead
  // of opening the detail panel.
  const [pendingCopy, setPendingCopy] = useState<PendingHojaCopy | null>(null);
  const [copyingSheet, setCopyingSheet] = useState(false);
  const copyInFlightRef = useRef(false);

  useEffect(() => {
    if (searchParams?.get("copiarHoja") !== "1") return;
    const pending = getPendingHojaCopy();
    if (pending) setPendingCopy(pending);
    else router.replace("/ordenes", { scroll: false });
  }, [searchParams, router]);

  const cancelCopy = useCallback(() => {
    clearPendingHojaCopy();
    setPendingCopy(null);
    router.replace("/ordenes", { scroll: false });
  }, [router]);

  const confirmCopyTo = useCallback(async (target: OrdenListItem) => {
    if (!pendingCopy || copyInFlightRef.current) return;
    const label = `${target.numero != null ? `OT-${target.numero} · ` : ""}${target.titulo ?? "Orden sin título"}`;
    const { hoja } = pendingCopy;
    if (!confirm(
      `¿Copiar “${hoja.nombre}” con sus ${hoja.columnas.length} columna${hoja.columnas.length !== 1 ? "s" : ""} y todas sus filas a ${label}?`
    )) return;

    copyInFlightRef.current = true;
    setCopyingSheet(true);
    try {
      await copyHojaToOrden(hoja, target.id, wsId, myId);
      clearPendingHojaCopy();
      setPendingCopy(null);
      // Land on the destination OT so the user can verify the copy.
      openOT(target.id, true);
    } catch (err) {
      alert(err instanceof Error ? `No se pudo copiar la hoja: ${err.message}` : "No se pudo copiar la hoja.");
    } finally {
      copyInFlightRef.current = false;
      setCopyingSheet(false);
    }
  }, [pendingCopy, wsId, myId, openOT]);

  const handleRowClick = useCallback((id: string) => {
    if (pendingCopy) {
      const target = ordenes.find(o => o.id === id);
      if (target) { void confirmCopyTo(target); return; }
    }
    openOT(id, true);
  }, [openOT, pendingCopy, ordenes, confirmCopyTo]);

  const handleRowAssigned = useCallback((id: string, newIds: string[]) => {
    setOrdenes(prev =>
      prev.map(x => x.id === id ? { ...x, asignados_ids: newIds.length > 0 ? newIds : null } : x)
    );
  }, []);

  // Sync the panel with the ?id= URL param so direct/pasted links open the
  // OT detail, and so closing the panel (which strips ?id=) clears it.
  useEffect(() => {
    const urlId = searchParams?.get("id") ?? null;
    const urlPanel = searchParams?.get("panel") ?? null;
    setRightPanel(current => {
      if (urlPanel === "crear") return "create";
      return current === "create" ? "none" : current;
    });
    if (urlId && urlId !== selected) {
      openOT(urlId, false);
    } else if (urlId && urlId === selected) {
      // Already open. Do nothing — re-running openOT here is what made the
      // panel reset to Detalles a beat after the user switched sections: this
      // effect fires when Next.js finishes its RSC navigation, which lands
      // after the click that changed the tab.
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
  const refreshListPromiseRef = useRef<Promise<void> | null>(null);
  // The manual cooldown (`lastBulkFetchRef`) and the in-flight coalescing ref
  // are gone: TanStack's `staleTime` enforces the same rate limit, and it
  // already de-duplicates concurrent callers of the same query key. Two
  // overlapping snapshot walks are impossible by construction now, rather than
  // by a hand-maintained promise ref.

  /**
   * Refreshes the VISIBLE page only. This is what the 60s poll runs.
   *
   * Deliberately does not touch `allOrdenesForCounts`: that snapshot is every OT
   * in the workspace, and refetching it once a minute per open tab was the bulk
   * of this project's Supabase egress. Counts drift only when membership
   * changes, and those paths call `refreshList` below.
   */
  const refreshVisible = useCallback(async () => {
    const data = await fetchOrdenesPage(wsId);
    // Merge instead of replace. `fetchOrdenesPage` returns only the FIRST page
    // (20 newest rows), so assigning it wholesale threw away every extra page
    // the user had pulled in with the infinite scroll: the list collapsed back
    // to 20 rows mid-read and the scroll container jumped to the top, once a
    // minute. Now the poll only refreshes the window it actually fetched.
    //
    // Only page 1 was ever loaded? Then the fetch IS the whole list, and it
    // also re-answers "is there more?". Once later pages exist that question
    // belongs to the last page the infinite scroll fetched — which this poll
    // never asked for — so the flag is left alone.
    const soloPrimeraPagina = ordenesRef.current.length <= data.length;
    if (soloPrimeraPagina) setHasMoreOrdenes(data.length >= ORDENES_PAGE_SIZE);

    setOrdenes(prev => {
      if (prev.length <= data.length) return data;
      // Rows are ordered created_at DESC, so the page we just fetched covers
      // everything down to its last row's created_at. Within that window the
      // server is authoritative (it reflects creations and deletions); older
      // rows come from pages the poll didn't ask for and must be preserved.
      const cutoff = data[data.length - 1]?.created_at ?? null;
      const fresh = new Set(data.map(o => o.id));
      const older = prev.filter(o => !fresh.has(o.id) && (cutoff === null || o.created_at < cutoff));
      return [...data, ...older];
    });
  }, [wsId]);

  /**
   * Refreshes the visible page AND the workspace-wide snapshot.
   *
   * For events that change which OTs exist: create, realtime INSERT, or a
   * realtime UPDATE for a row outside the loaded page. The snapshot half is
   * rate-limited so a burst of realtime events can't re-download the workspace
   * repeatedly.
   */
  const refreshList = useCallback(async () => {
    if (refreshListPromiseRef.current) return refreshListPromiseRef.current;

    const refresh = (async () => {
      // Reuse the visible first page as the snapshot's first page.
      // Previously both calls issued the same 300-row request concurrently.
      const data = await fetchOrdenesPage(wsId);
      setOrdenes(data);
      setHasMoreOrdenes(data.length >= ORDENES_PAGE_SIZE);

      if (!needsBulkSnapshot(data.length, ORDENES_PAGE_SIZE)) {
        // Short first page — it IS the whole workspace, so there is nothing to
        // fetch. Seed the cache directly so the query does not then go and
        // re-download what we already have.
        queryClient.setQueryData(["ordenes-snapshot", wsId], data);
        setAllOrdenesForCounts(data);
        setCalendarExtras(null);
        return;
      }

      // Membership changed, so the snapshot is stale. Invalidating lets
      // TanStack decide whether to refetch: within `staleTime` it serves the
      // cached snapshot and issues no request, which is the rate limit the
      // manual cooldown used to enforce — except now every caller shares one
      // cache instead of each keeping its own timestamp.
      await queryClient.invalidateQueries({ queryKey: ["ordenes-snapshot", wsId] });
      // Cached calendar extras may be missing a new OT. Only cleared here —
      // never on the poll, or the workspace-wide fetch would return through
      // the calendar's back door.
      setCalendarExtras(null);
    })();

    refreshListPromiseRef.current = refresh;
    try {
      await refresh;
    } finally {
      if (refreshListPromiseRef.current === refresh) refreshListPromiseRef.current = null;
    }
  }, [wsId]);

  /**
   * Workspace-wide snapshot, via TanStack Query.
   *
   * Replaces a mount effect plus a hand-rolled 120s cooldown and an in-flight
   * promise ref. `staleTime` gives the same rate limit, and TanStack already
   * de-duplicates concurrent callers, so `coalesce` is no longer needed for
   * this path.
   *
   * `enabled`: the SSR first page is in `initialOrdenes`. If it came back short
   * there is no page 2 — that page IS the whole workspace, and fetching the
   * snapshot would re-download rows we already hold.
   *
   * Deliberately NOT converted: the rendered list, realtime row patching and
   * infinite scroll. Those mutate rows in place (18 call sites) and would need
   * setQueryData plumbing for no benefit — they already work.
   */
  const snapshotEnabled = needsBulkSnapshot(initialOrdenes.length, ORDENES_PAGE_SIZE);
  const { data: bulkSnapshot } = useQuery({
    queryKey: ["ordenes-snapshot", wsId],
    enabled: snapshotEnabled,
    // Same rate limit the manual cooldown enforced. Refetching the whole
    // workspace on a timer is what drove Supabase egress to 3.35 GB/month.
    staleTime: BULK_MIN_INTERVAL_MS,
    gcTime: BULK_MIN_INTERVAL_MS * 5,
    refetchOnWindowFocus: false,
    queryFn: () => fetchAllOrdenesBulk(wsId),
  });

  // Mirror the query into the existing state so the ~15 downstream readers
  // (counts, filtered list, itoOptions, waiting alerts) keep working unchanged.
  // Realtime and optimistic updates still write to `allOrdenesForCounts`
  // directly, so this only ever pushes a freshly fetched snapshot in.
  useEffect(() => {
    if (bulkSnapshot) setAllOrdenesForCounts(bulkSnapshot);
  }, [bulkSnapshot]);

  const loadMoreOrdenes = useCallback(async () => {
    if (loadingMoreOrdenesRef.current || !hasMoreOrdenes) return;
    if (Date.now() < loadMoreRetryAfterRef.current) return;
    // While a text search is active the list is server-search results (a
    // complete set), not the paginated loaded list — don't paginate then.
    if (search.trim()) return;
    const lastCreatedAt = ordenes[ordenes.length - 1]?.created_at ?? null;
    if (!lastCreatedAt) return;

    loadingMoreOrdenesRef.current = true;
    setLoadingMoreOrdenes(true);
    try {
      const nextPage = await fetchOrdenesPage(wsId, lastCreatedAt);
      setOrdenes(prev => {
        const seen = new Set(prev.map(o => o.id));
        const merged = [...prev, ...nextPage.filter(o => !seen.has(o.id))];
        return merged;
      });
      setHasMoreOrdenes(nextPage.length >= ORDENES_PAGE_SIZE);
      loadMoreRetryAfterRef.current = 0;
    } catch {
      // A temporary browser/Supabase fetch failure must not become an
      // unhandled rejection. Keep the current rows and `hasMoreOrdenes` so a
      // later observer pass or button press can retry the same page.
      // Briefly cool down because the sentinel remains visible and its effect
      // is recreated when the loading state changes.
      loadMoreRetryAfterRef.current = Date.now() + 3_000;
    } finally {
      loadingMoreOrdenesRef.current = false;
      setLoadingMoreOrdenes(false);
    }
  }, [hasMoreOrdenes, ordenes, wsId, search]);

  // El poll de 60s se eliminó. La lista se mantiene fresca por el canal
  // realtime de abajo, que ya cubre INSERT/UPDATE/DELETE sobre
  // ordenes_trabajo y parcha SOLO la fila afectada — el comentario que decía
  // "no realtime channel for ordenes_trabajo" quedó obsoleto cuando se agregó
  // ese canal, y el timer sobrevivió por inercia.
  //
  // El poll no solo era redundante: era el que rompía la lectura. Refrescaba
  // la lista entera cada minuto, reordenando filas bajo el cursor del usuario
  // mientras revisaba una OT (y, con Electrilam en 743 OTs contra páginas de
  // 20, era además la consulta de lista más repetida del proyecto).
  //
  // Lo único que el poll sí aportaba era recuperación: realtime NO reenvía los
  // eventos perdidos mientras el socket estuvo caído, y el poll se saltaba las
  // pestañas ocultas, así que el primer tick al volver era lo que reparaba la
  // lista. Eso ahora se hace por evento, no por temporizador: al volver a la
  // pestaña (visibilitychange) y al re-suscribirse el canal, que son los dos
  // momentos exactos en que la lista puede haber quedado desfasada.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Swallow transient network errors: la próxima vuelta a la pestaña
      // reintenta. Sin esto un fetch fallido queda como unhandled rejection.
      refreshVisible().catch(() => { /* transitorio — se reintenta al volver */ });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshVisible]);

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
            queryClient.removeQueries({ queryKey: ["orden", oldRow.id] });
            if (selectedId === oldRow.id) setDetail(null);
            return;
          }

          const next = payload.new as Partial<OrdenTrabajo> & Partial<OrdenListItem> & { id?: string; deleted_at?: string | null };
          if (!next.id) return;

          // Soft-delete arrives as an UPDATE (deleted_at set). Treat it like a
          // removal so trashed OTs drop out of the active list.
          if (next.deleted_at) {
            setOrdenes(prev => prev.filter(o => o.id !== next.id));
            queryClient.removeQueries({ queryKey: ["orden", next.id] });
            if (selectedId === next.id) setDetail(null);
            return;
          }

          // Someone changed this OT — the cached detail is now wrong. Drop it
          // so the next open refetches, instead of serving a stale record for
          // up to the staleTime window. This is what makes the long staleTime
          // on completed OTs safe: an edit invalidates immediately rather than
          // waiting for the window to expire.
          queryClient.invalidateQueries({ queryKey: ["orden", next.id] });

          if (payload.eventType === "INSERT") {
            // Una OT nueva entra por arriba (el orden es created_at DESC), así
            // que insertarla al vuelo empuja hacia abajo todo lo que el usuario
            // está leyendo. Si ya bajó en la lista se ignora: la verá al volver
            // arriba, al cambiar de pestaña o al reentrar (visibilitychange).
            // No se anuncia nada — normalmente la OT la está cargando él mismo
            // o un compañero, así que un aviso sería ruido, y mover la lista
            // bajo el cursor es peor que mostrarla un momento más tarde.
            // Arriba del todo no hay nada que empujar, así que entra sola.
            if ((listScrollRef.current?.scrollTop ?? 0) > NUEVA_OT_UMBRAL_PX) return;
            refreshList().catch(() => { /* transitorio — reintenta al reconectar */ });
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
        // Realtime no reenvía lo que pasó mientras el socket estuvo caído, así
        // que una re-suscripción implica un hueco: todo cambio ocurrido entre
        // la caída y este momento no llegó nunca. Re-sincronizar aquí es lo que
        // reemplaza al viejo poll de 60s como red de seguridad — con la
        // diferencia de que solo corre cuando de verdad hubo una desconexión,
        // no una vez por minuto pase lo que pase.
        //
        // `primeraSuscripcion` evita refrescar en el SUBSCRIBED inicial: la
        // lista acaba de llegar por SSR y volver a pedirla sería un fetch
        // redundante en cada carga de página.
        if (status !== "SUBSCRIBED") return;
        if (primeraSuscripcionRef.current) {
          primeraSuscripcionRef.current = false;
          return;
        }
        refreshVisible().catch(() => { /* transitorio — reintenta al reconectar */ });
      });

    return () => {
      logRealtimeChannel("remove:start", channelDetails, sb);
      void sb.removeChannel(channel).then(() => {
        logRealtimeChannel("remove:done", channelDetails, sb);
      });
    };
  }, [refreshList, refreshVisible, wsId, queryClient]);

  const deleteOT = async (id: string) => {
    await deleteOrden(id);
    setOrdenes(prev => prev.filter(o => o.id !== id));
    if (selected === id) {
      setSelected(null);
      setDetail(null);
      router.push("/ordenes", { scroll: false });
    }
  };

  // Ids de usuarios dados de baja: su trabajo asignado quedo sin duenio real
  // cuando dejaron el equipo, y es lo que busca el filtro homonimo.
  const dadosDeBajaIds = useMemo(
    () => new Set(usuarios.filter(u => u.deleted_at).map(u => u.id)),
    [usuarios],
  );

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

  // ITOs disponibles para el dropdown. Se derivan de `countOrdenes` (el set
  // completo del workspace) y no de `ordenes`: si saliera de la lista paginada,
  // el dropdown solo ofreceria los ITOs de la primera pagina y filtrar por uno
  // "ausente" seria imposible aunque existiera mas abajo.
  const itoOptions = useMemo(() => collectItos(countOrdenes), [countOrdenes]);

  // Server-side text search: the infinite-scroll list only holds loaded pages,
  // so an in-memory search can't find OTs the user hasn't scrolled to. When
  // there's a query we fetch matches from the server (debounced) and use those
  // as the base for the filter pipeline instead of the loaded list. Empty query
  // → back to the loaded list. `searchResults === null` means "not searching".
  //
  // The 300ms debounce stays hand-rolled (TanStack keys off a value, it does not
  // debounce), but everything after it is the query cache's job: re-typing a
  // term already searched this session is served from cache with no request,
  // and in-flight results for an abandoned term can no longer land after a
  // newer one because the key changes with the term.
  /* Largo minimo antes de mandar la busqueda al servidor. Vive aca arriba
     porque lo usan el debounce y el indicador de carga: si divergen, la lista
     queda cargando para siempre o no avisa que esta buscando. */
  const largoMinimo = (q: string) => (q.startsWith("#") ? 2 : 3);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const q = search.trim();
    // Terminos demasiado cortos no se mandan al servidor. "#" solo, o una sola
    // letra, hacen un round-trip completo (RPC + re-select) para devolver ruido
    // o la tabla entera. En el HAR se veia salir una busqueda con p_query="#"
    // mientras el usuario todavia estaba escribiendo "#840".
    // Excepcion: "#<numero>" es una busqueda exacta y util desde el primer
    // digito, asi que ahi basta con 2 caracteres.
    const minimo = largoMinimo(q);
    if (q.length > 0 && q.length < minimo) {
      setDebouncedSearch("");
      return;
    }
    const t = setTimeout(() => setDebouncedSearch(q), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: searchData, isFetching: isSearchFetching } = useQuery({
    queryKey: ["ordenes-search", wsId, debouncedSearch],
    enabled: debouncedSearch.length > 0,
    queryFn: () => searchOrdenes(wsId, debouncedSearch),
    // Search results are a snapshot of a query the user is actively refining;
    // 60s is long enough to make backspacing free, short enough that a result
    // list does not go stale while they read it.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // A failed search must show "no results", never a stale list from a
    // different term (the previous implementation set [] on error).
    placeholderData: undefined,
  });

  // `null` means "not searching" for the filter pipeline below. While a new
  // term is in flight we keep showing nothing rather than the prior term's
  // rows, matching the old behaviour.
  const searchResults: OrdenListItem[] | null =
    debouncedSearch.length === 0 ? null : (searchData ?? []);

  const searchHitCap = searchResults !== null && searchResults.length >= ORDENES_SEARCH_LIMIT;

  /* Hay dos ventanas en las que todavia no se sabe si hay resultados: los 300ms
     del debounce (la consulta ni siquiera salio) y el viaje al servidor. En
     ambas `filtered` queda vacio, y sin esta bandera la lista dice "Sin
     resultados" cuando la respuesta correcta es "todavia estoy buscando". */
  const searchPendiente = (() => {
    const q = search.trim();
    if (q.length === 0) return false;
    // Un termino bajo el minimo nunca llega a `debouncedSearch`: no esta
    // pendiente, simplemente no se busca. Sin esto la lista quedaria cargando
    // para siempre al escribir "#" o una sola letra.
    if (q.length < largoMinimo(q)) return false;
    return debouncedSearch !== q || isSearchFetching;
  })();

  const hasActiveFilters = needsFullWorkspaceSet({ scope, ocultarMarcadas, filtros });

  // Apply filters + search + sort
  const filtered = useMemo(() => {
    // Calendar and Kanban are independent views. List-only search, filters,
    // scopes and read-state toggles must not leak into them when navigating.
    if (view !== "lista") return ordenes.slice();

    // Prioridad de fuentes:
    //   1. búsqueda  -> resultados del servidor (todas las coincidencias)
    //   2. filtros   -> `allOrdenesForCounts`, el set completo que ya se trae
    //                   para los contadores de las pestañas
    //   3. sin nada  -> la lista paginada del scroll infinito
    //
    // Sin el caso 2, filtrar solo miraba las páginas ya cargadas: en un
    // workspace con más de 300 OTs, filtrar por un usuario cuyas órdenes están
    // en la página 2 devolvía una lista vacía mientras el contador de la
    // pestaña — que sí usa el set completo — mostraba "2". El dato ya estaba
    // en memoria; solo la lista no lo miraba.
    const baseSource = searchResults ?? (hasActiveFilters ? countOrdenes : ordenes);
    // Tab decides active vs. completed; scope narrows further. Kanban shows
    // all states side-by-side, so the tab gate is bypassed in that view.
    let list = baseSource.filter(o =>
      tab === "pendientes" ? ACTIVE_ESTADOS.has(o.estado) : CLOSED_ESTADOS.has(o.estado)
    );

    if (scope !== "todas") {
      list = list.filter(o => pendingScopeFor(o, reprogramadaIds, faltanMaterialesIds, todayKey) === scope);
    }

    // Filtros + búsqueda — cadena compartida con los contadores de pestaña.
    list = applyFiltros(list, filtros, {
      ubicaciones, dadosDeBajaIds, todayKey, search, matchesSearch,
    });

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
          case "completado_en_desc": {
            // Sin fecha de cierre van al final: son OTs anteriores al backfill
            // o que nunca se completaron.
            const ac = a.completado_en, bc = b.completado_en;
            if (!ac && !bc) return 0;
            if (!ac) return 1;
            if (!bc) return -1;
            return new Date(bc).getTime() - new Date(ac).getTime();
          }
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
  }, [ordenes, countOrdenes, hasActiveFilters, searchResults, view, tab, scope, search, sort, filtros, ubicaciones, dadosDeBajaIds, reprogramadaIds, faltanMaterialesIds, ocultarMarcadas, marcadas, todayKey]);

  // The calendar needs recurrencia_config + activos, which the lean bulk select
  // omits. Fetch them the first time the calendar opens, not on every list load.
  useEffect(() => {
    if (view !== "calendario") return;
    if (calendarExtras) return;
    let cancelled = false;
    setLoadingCalendarExtras(true);
    fetchOrdenesCalendarExtras(wsId)
      .then(m => { if (!cancelled) setCalendarExtras(m); })
      .catch(() => { /* calendar degrades to no recurrence previews */ })
      .finally(() => { if (!cancelled) setLoadingCalendarExtras(false); });
    return () => { cancelled = true; };
  }, [view, wsId, calendarExtras]);

  // Same array reference until the extras actually land, so the list and kanban
  // paths never re-render for a calendar-only fetch.
  const ordenesConExtras = useMemo(
    () => (view === "calendario" ? mergeCalendarExtras(filtered, calendarExtras) : filtered),
    [view, filtered, calendarExtras],
  );

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
  //
  // `hasMoreOrdenes` solo aplica a la lista paginada por scroll infinito. Con
  // una busqueda activa la fuente es searchOrdenes (que trae TODAS las
  // coincidencias de una), y con filtros activos es countOrdenes (el set
  // completo del workspace): en ambos casos no existe una "pagina siguiente"
  // que pedir, asi que arrastrar hasMoreOrdenes dejaba el boton "Cargar mas"
  // visible incluso con un unico resultado.
  const fuenteCompleta = searchResults !== null || hasActiveFilters;
  const canShowMore = visibleCount < filtered.length || (hasMoreOrdenes && !fuenteCompleta);

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
        } else if (hasMoreOrdenes && !fuenteCompleta && !loadingMoreOrdenes) {
          loadMoreOrdenes();
        }
      },
      { root: listScrollRef.current, rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canShowMore, visibleCount, filtered.length, hasMoreOrdenes, fuenteCompleta, loadingMoreOrdenes, loadMoreOrdenes]);

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
    // Typed as the lean bulk row: `countSource` is either the workspace-wide
    // snapshot (OrdenBulkItem) or server search results (OrdenListItem), and
    // every field read below exists on both.
    const applyFilters = (list: OrdenBulkItem[]) =>
      applyFiltros(list, filtros, {
        ubicaciones, dadosDeBajaIds, todayKey, search, matchesSearch,
      });
    // Per tab × per scope. Drives the dropdown labels, the red-dot indicators,
    // and the tab pill counts. All respect search + filtros so the count
    // shown matches what the user would actually see if they clicked in.
    const countSource = searchResults ?? countOrdenes;
    const active = countSource.filter(o => ACTIVE_ESTADOS.has(o.estado));
    const closed = countSource.filter(o => CLOSED_ESTADOS.has(o.estado));
    const activeByScope = {
      en_curso: [] as OrdenBulkItem[],
      sin_asignar: [] as OrdenBulkItem[],
      sin_progreso: [] as OrdenBulkItem[],
      vencidas: [] as OrdenBulkItem[],
      reprogramadas: [] as OrdenBulkItem[],
      materiales: [] as OrdenBulkItem[],
      levantamientos: [] as OrdenBulkItem[],
      presupuestos: [] as OrdenBulkItem[],
      otras: [] as OrdenBulkItem[],
    } satisfies Record<PendingScopeKey, OrdenBulkItem[]>;

    for (const o of active) {
      activeByScope[pendingScopeFor(o, reprogramadaIds, faltanMaterialesIds, todayKey)].push(o);
    }

    return {
      pendientes: {
        todas:         applyFilters(active).length,
        en_curso:       applyFilters(activeByScope.en_curso).length,
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
  }, [countOrdenes, searchResults, filtros, search, ubicaciones, dadosDeBajaIds, reprogramadaIds, faltanMaterialesIds, todayKey]);
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? "";
  const scopeLabel: Record<ScopeKey, string> = {
    todas: "Todas",
    en_curso: "En curso",
    sin_asignar: "Sin asignar",
    sin_progreso: "Sin progreso",
    vencidas: "Vencidas",
    reprogramadas: "Reprogramadas",
    materiales: "Faltan materiales",
    levantamientos: "Levantamientos",
    presupuestos: "Presupuestos",
    otras: "Otras",
  };
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (filtros.sinAsignar) labels.push("Sin asignar");
    if (filtros.deUsuariosDadosDeBaja) labels.push("De usuarios dados de baja");
    if (filtros.soloAsignados) labels.push("Asignadas");
    const named = <T,>(values: T[], lookup: (v: T) => string | undefined, plural: string) => {
      const names = values.map(lookup).filter((n): n is string => Boolean(n));
      return names.length === 1 ? names[0] : `${names.length || values.length} ${plural}`;
    };

    if (filtros.asignadoIds.length) {
      labels.push(named(filtros.asignadoIds, id => usuarios.find(user => user.id === id)?.nombre, "usuarios"));
    }
    if (filtros.ubicacionIds.length) {
      labels.push(named(filtros.ubicacionIds, id => ubicaciones.find(location => location.id === id)?.edificio, "ubicaciones"));
    }
    if (filtros.sociedadIds.length) {
      labels.push(named(filtros.sociedadIds, id => sociedades.find(company => company.id === id)?.nombre, "asociaciones"));
    }
    if (filtros.itos.length) {
      labels.push(named(filtros.itos, v => v, "ITOs"));
    }
    if (filtros.prioridades.length) labels.push(filtros.prioridades.length === 1 ? `Prioridad ${filtros.prioridades[0]}` : `${filtros.prioridades.length} prioridades`);
    if (filtros.estados.length) labels.push(filtros.estados.length === 1 ? filtros.estados[0].replaceAll("_", " ") : `${filtros.estados.length} estados`);
    if (filtros.tipos.length) labels.push(filtros.tipos.length === 1 ? filtros.tipos[0] : `${filtros.tipos.length} tipos de trabajo`);
    if (filtros.fechaVencimiento) {
      const dueLabels: Record<string, string> = { hoy: "Vence hoy", manana: "Vence mañana", "7dias": "Próximos 7 días", "30dias": "Próximos 30 días", este_mes: "Este mes", vencidas: "Vencidas" };
      labels.push(dueLabels[filtros.fechaVencimiento] ?? "Fecha de vencimiento");
    }
    return labels;
  }, [filtros, usuarios, ubicaciones, sociedades]);
  const currentViewLabel = [
    scope !== "todas" ? scopeLabel[scope] : null,
    ...activeFilterLabels,
    search.trim() ? `“${search.trim()}”` : null,
  ].filter((label): label is string => Boolean(label)).join(" · ") || "Todas";
  const pendingTabCount = scope === "todas"
    ? filteredCounts.pendientes.todas
    : filteredCounts.pendientes[scope];
  const completedTabCount = scope === "todas"
    ? filteredCounts.completas.todas
    : scope === "levantamientos"
      ? filteredCounts.completas.levantamientos
      : scope === "presupuestos"
        ? filteredCounts.completas.presupuestos
        : 0;

  // El export vivia en la topbar global (a la izquierda de la campana). Se
  // movio junto al buscador de esta pagina: la topbar es compartida por toda la
  // app, asi que un boton que solo funciona en /ordenes ahi parecia una funcion
  // global rota -- exporta ORDENES, y no hay equivalente para activos, usuarios
  // ni el resto. Junto al buscador queda claro sobre que actua.
  //
  // Sigue siendo solo admin/owner: el libro serializa las OTs del workspace
  // entero con sus hojas, fotos y materiales, que no es una capacidad de member.
  const puedeExportar = esAdmin(myRol);

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
        // Filtros propios del modal de exportacion (acotan sin tocar la bandeja).
        if (exportFilterEstados.length)  list = list.filter(o => exportFilterEstados.includes(o.estado));
        if (exportFilterTipos.length)    list = list.filter(o => o.tipo_trabajo != null && exportFilterTipos.includes(o.tipo_trabajo));
        // …y encima los de la bandeja, con la MISMA cadena que la lista y los
        // contadores. Antes esta era una tercera copia a mano y ya se habia
        // quedado sin los filtros de sociedad y de ITO.
        list = applyFiltros(list, filtros, {
          ubicaciones, dadosDeBajaIds, todayKey, search, matchesSearch,
        });
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
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, overflow:"hidden", background:"var(--c-bg, var(--surface-canvas))" }}>

      {/* ── Navigation header ── */}
      {/* Toolbar is chrome, so it sits at the canvas tone alongside the sidebar
          and top bar rather than reading as a white surface. */}
      {view === "lista" && <div style={{ flexShrink:0, borderBottom:"1px solid var(--border)", background:"var(--surface-canvas)" }}>

        {/* Top row */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"9px 20px", minHeight:56, gap:12, flexWrap:"wrap",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:"1 1 520px", minWidth:0, justifyContent:"flex-end", flexWrap:"wrap" }}>
            {/* Search */}
            <div style={{ position:"relative", maxWidth:280, minWidth:220, flex:"1 1 220px" }}>
              <Search size={14} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--fg-4)", pointerEvents:"none" }} />
              <input
                type="text"
                placeholder="Buscar Órdenes de Trabajo"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  paddingLeft:34, paddingRight:search ? 28 : 10,
                  height:38, width:"100%",
                  border:"1px solid var(--border)", borderRadius:8,
                  fontSize: 14, fontWeight: 400, color:"var(--fg-1)", background:"var(--surface-1)",
                  outline:"none", fontFamily:"inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", color:"var(--fg-4)", display:"flex" }}
                >
                  <X size={12} />
                </button>
              )}
              {searchHitCap && (
                <div style={{ position:"absolute", left:0, top:"calc(100% + 4px)", fontSize: 14, color:"var(--fg-4)", whiteSpace:"nowrap" }}>
                  {`Más de ${ORDENES_SEARCH_LIMIT} resultados · refina la búsqueda`}
                </div>
              )}
            </div>

            {/* Exportar Excel. Junto al buscador porque actua sobre lo que el
                buscador y los filtros dejan a la vista, no sobre toda la app. */}
            {puedeExportar && (
              <button
                type="button"
                onClick={() => { if (ordenes.length > 0 && !exporting) setExportConfigOpen(true); }}
                disabled={exporting || ordenes.length === 0}
                title={ordenes.length === 0
                  ? "No hay órdenes para exportar"
                  : `Exportar órdenes a Excel (${ordenes.length})`}
                style={{
                  flexShrink: 0, height: 38, padding: "0 12px",
                  display: "inline-flex", alignItems: "center", gap: 7,
                  border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--surface-1)",
                  color: ordenes.length === 0 || exporting ? "var(--fg-4)" : "var(--fg-2)",
                  fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                  cursor: exporting || ordenes.length === 0 ? "default" : "pointer",
                }}
              >
                {exporting
                  ? <Loader2 size={16} className="animate-spin" />
                  : <DatabaseArrowDown size={16} />}
                Exportar
              </button>
            )}


            {/* Revisar MeConecta — Electrilam-exclusive (same single-tenant gate
                as ITOs on mobile) and restricted to owners/admins: it reconciles
                the whole workspace against the portal, so it is not a
                member-level action. The API enforces the same rule. */}
            {wsId === ELECTRILAM_WORKSPACE_ID && esAdmin(myRol) && (
              <MeconectaCheck onOpenOrden={openOT} />
            )}

            {/* Nueva OT button */}
            <button
              type="button"
              onClick={openCreate}
              style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"0 16px", height:38,
                background:"var(--brand)", color:"var(--fg-on-brand)",
                border:"none", borderRadius:8,
                // Matches the search input's type: 14px / 500.
                fontSize: 14, fontWeight: 400,
                cursor:"pointer", fontFamily:"inherit",
                whiteSpace:"nowrap", flexShrink:0,
              }}
              // Flat colour shift on hover — no shadow, no opacity fade.
              onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
            >
              <Plus size={16} strokeWidth={2} />
              Nueva Orden de Trabajo
            </button>
          </div>
        </div>

        {/* Copy-sheet mode banner — the list keeps all its normal filtering;
            clicking any OT copies the sheet there instead of opening it. */}
        {pendingCopy && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 20px", background: "var(--st-wait-bg)",
            borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-strong)",
          }}>
            <Copy size={14} style={{ color: "var(--st-wait-fg)", flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: "var(--st-wait-fg)", flex: 1 }}>
              {copyingSheet
                ? <>Copiando <strong>{pendingCopy.hoja.nombre}</strong>…</>
                : <>Selecciona la OT donde copiar <strong>{pendingCopy.hoja.nombre}</strong>. Puedes filtrar y buscar normalmente.</>}
            </span>
            <button
              type="button"
              onClick={cancelCopy}
              disabled={copyingSheet}
              style={{
                padding: "5px 12px", border: "1px solid var(--border-strong)", borderRadius: 6,
                background: "var(--surface-1)", color: "var(--fg-2)", cursor: copyingSheet ? "default" : "pointer",
                fontSize: 14, fontWeight: 400, fontFamily: "inherit", flexShrink: 0, opacity: copyingSheet ? 0.6 : 1,
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Sub-nav: inline filter buttons */}
        <div style={{
          display:"flex", alignItems:"center",
          padding:"6px 20px", minHeight:40,
        }}>
          {/* Ocultar leídas — plain icon toggle at the start of the filter row.
              Eye = leídas visible, EyeOff = leídas ocultas. */}
          <button
            type="button"
            onClick={() => setOcultarMarcadas(v => !v)}
            title={ocultarMarcadas ? "Mostrar las OTs que marcaste" : "Ocultar las OTs que marcaste"}
            aria-label={ocultarMarcadas ? "Mostrar las OTs leídas" : "Ocultar las OTs leídas"}
            aria-pressed={ocultarMarcadas}
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              // Misma altura y radio que los chips de FilterBar para que la
              // fila quede pareja.
              width:34, height:32, marginRight:8, flexShrink:0,
              border: ocultarMarcadas ? "1.5px solid var(--brand)" : "1px solid var(--border)",
              borderRadius:7,
              background: ocultarMarcadas ? "var(--brand-tint)" : "var(--surface-1)",
              // Ícono siempre en azul de marca, igual que los chips de filtro.
              color: "var(--brand)",
              cursor:"pointer", fontFamily:"inherit",
            }}
          >
            {ocultarMarcadas ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>

          <FilterBar
            filtros={filtros}
            onChange={setFiltros}
            usuarios={usuarios}
            ubicaciones={ubicaciones}
            sociedades={sociedades}
            itos={itoOptions}
            visibleKeys={visibleFilterKeys}
            onVisibleKeysChange={changeVisibleFilterKeys}
          />
        </div>
      </div>}

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
          // Canvas, not --surface-1: this is a full-height panel, so painting it
          // pure white made it merge with the toolbar and detail pane into one
          // flat sheet. The OT rows inside stay white and read as cards on it.
          background:"var(--surface-canvas)",
          position:"relative",
        }}>
          {view === "calendario" ? (
            <CalendarView
              ordenes={ordenesConExtras}
              loadingExtras={loadingCalendarExtras}
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


          {/* Two-tab strip. Sub-scopes (Reprogramadas,
              Levantamientos) live inside the merged Mostrar/Ordenar dropdown
              in the header so the tab bar stays focused on the big split. */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            {[
              { key:"pendientes" as const, label:"Pendientes", count:pendingTabCount },
              { key:"completas"  as const, label:"Completas",  count:completedTabCount },
            ].map((t, i) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    // Reset scope when switching tabs because some scopes don't
                    // apply on both sides (e.g. "Reprogramadas" requires en_espera).
                    setScope("todas");
                    // Cada pestaña tiene su noción de "reciente": en Completas es
                    // la fecha de cierre, no la de creación. Solo se reajusta si
                    // el orden actual es el que la otra pestaña usa por defecto,
                    // para no pisar una elección explícita del usuario.
                    if (t.key === "completas" && sort === "created_at_desc") {
                      setSort("completado_en_desc");
                    } else if (t.key === "pendientes" && sort === "completado_en_desc") {
                      setSort("created_at_desc");
                    }
                  }}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"12px 16px",
                    // Tabs are chrome: inactive sits on the canvas so the strip
                    // doesn't read as a white block above the list.
                    background: isActive ? "var(--surface-1)" : "var(--surface-canvas)",
                    border:"none",
                    borderRight: i === 0 ? "1px solid var(--border)" : "none",
                    borderBottom: isActive ? "2px solid var(--brand)" : "2px solid transparent",
                    cursor:"pointer", fontFamily:"inherit",
                    transition:"background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "var(--surface-canvas)"; }}
                >
                  <span style={{ fontSize: 14, fontWeight: 400, color: isActive ? "var(--brand-fg)" : "var(--fg-2)" }}>
                    {t.label}
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: 400, padding:"2px 8px", borderRadius:4,
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
                    { value: "en_curso",       label: "En curso",                    count: filteredCounts.pendientes.en_curso },
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
                    // Mismo padding horizontal (20px) que la barra de filtros de
                    // arriba, para que "Mostrando:" arranque en la misma
                    // vertical que el primer chip.
                    width:"100%", padding:"10px 20px",
                    background:"var(--surface-canvas)", border:"none",
                    fontSize: 14, color:"var(--fg-2)",
                    cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-canvas)"; }}
                >
                  <span style={{ color:"var(--fg-3)" }}>Mostrando:</span>
                  <span style={{ maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight: 400, color:"var(--brand-fg)" }} title={currentViewLabel}>{currentViewLabel}</span>
                  <span aria-hidden="true" style={{ color:"var(--border-strong)", margin:"0 2px" }}>·</span>
                  <span style={{ color:"var(--fg-3)" }}>Orden:</span>
                  <span style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight: 400, color:"var(--fg-2)" }} title={currentSortLabel}>{currentSortLabel}</span>
                  <ChevronDown size={14} style={{ color:"var(--brand-fg)", transform: sortOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
                  {triggerHasAttention && (
                    <span aria-label="Hay órdenes que requieren atención"
                          style={{
                            // `flexShrink: 0` + `display: block`: sin esto el
                            // punto es un flex item que se comprime contra el
                            // `marginLeft: auto` de al lado y sale ovalado/cortado.
                            display:"block", flexShrink:0,
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
                    maxHeight:"min(480px, calc(100vh - 260px))",
                    overflowX:"hidden", overflowY:"auto",
                    // El scrollbar se come el inset derecho y deja el resaltado
                    // de la fila activa descentrado. Reservar el canal en los
                    // dos bordes lo mantiene simétrico haya scroll o no.
                    scrollbarGutter:"stable both-edges",
                  }}>
                    {/* Mostrar — scope filter */}
                    <div style={{ padding:"8px 14px 6px", fontSize: 14, fontWeight: 400, color:"var(--fg-4)", letterSpacing:0, borderBottom:"1px solid var(--border)", marginBottom:4 }}>
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
                            border:"none", fontSize: 14,
                            color: isActive ? "var(--brand-fg)" : "var(--fg-1)",
                            fontWeight: 400,
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
                            fontSize: 14, fontWeight: 400, minWidth:18, textAlign:"right",
                            color: isActive ? "var(--brand-fg)" : "var(--fg-4)",
                          }}>
                            {o.count}
                          </span>
                        </button>
                      );
                    })}

                    {/* Ordenar por. Sin la línea separadora, el título necesita
                        aire arriba para no pegarse a la última fila de arriba;
                        16px es el mismo margen que usa SidebarGroupLabel. */}
                    <div style={{ padding:"8px 14px 6px", marginTop:12, fontSize: 14, fontWeight: 400, color:"var(--fg-4)", letterSpacing:0, borderBottom:"1px solid var(--border)", marginBottom:4 }}>
                      Ordenar por
                    </div>
                    {SORT_OPTIONS.filter(o => !o.soloCompletas || tab === "completas").map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => { setSort(o.value); setSortOpen(false); }}
                        style={{
                          display:"block", width:"100%", textAlign:"left",
                          padding:"9px 14px", background: sort === o.value ? "var(--brand-tint)" : "transparent",
                          border:"none", fontSize: 14,
                          color: sort === o.value ? "var(--brand-fg)" : "var(--fg-1)",
                          fontWeight: 400,
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
          {/* Gap + padding so each OTRow reads as a card floating on the canvas
              rather than a band in a continuous white sheet. */}
          {/* position:relative para que la píldora de "nuevas OT" flote sobre
              la lista sin ocupar espacio ni desplazar ninguna fila. */}
          <div style={{ flex:1, minHeight:0, position:"relative", display:"flex", flexDirection:"column" }}>
          <div ref={listScrollRef} style={{ flex:1, minHeight:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, padding:"8px 10px" }}>
            {searchPendiente && filtered.length === 0 ? (
              /* Buscando: ni la lista vieja ni "sin resultados", que serian las
                 dos respuestas equivocadas mientras la consulta viaja. */
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:280, gap:12, color:"var(--fg-4)" }}>
                <Loader2 size={22} className="animate-spin" style={{ color:"var(--brand)" }} />
                <p style={{ fontSize: 14, color:"var(--fg-2)", fontWeight: 400, margin:0 }}>Buscando…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:280, gap:12, color:"var(--fg-4)" }}>
                <svg width="38" height="46" viewBox="0 0 38 46" fill="none">
                  <rect x="2" y="2" width="34" height="42" rx="2" fill="#A67C52"/>
                  <rect x="6" y="7" width="26" height="32" rx="1" fill="var(--surface-1)"/>
                  <path d="M23 4a4 4 0 0 0-8 0h-3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3z" fill="#EFD358"/>
                  <circle cx="19" cy="4" r="1" fill="#B29930"/>
                  <path d="M17 30a1 1 0 0 1-.707-.293l-4-4a1 1 0 1 1 1.414-1.414L17 27.586l7.293-7.293a1 1 0 1 1 1.414 1.414l-8 8A1 1 0 0 1 17 30z" fill="#72C472"/>
                </svg>
                <p style={{ fontSize: 14, color:"var(--fg-2)", fontWeight: 400 }}>
                  {search
                    ? "Sin resultados para tu búsqueda"
                    : scope === "en_curso"      ? "No hay órdenes en curso ahora"
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
                    style={{ fontSize: 14, color:"var(--brand-fg)", fontWeight: 400, textDecoration:"underline" }}
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
                    onPrefetch={prefetchOT}
                    myId={myId}
                    onAssigned={handleRowAssigned}
                    coordinadaPara={scope === "reprogramadas" ? (o.fecha_inicio ?? null) : null}
                    isMarcada={marcadas.has(o.id)}
                    onToggleMarcada={handleToggleMarcada}
                    todayKey={todayKey}
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
                        fontSize: 14, fontWeight: 400, cursor: loadingMoreOrdenes ? "default" : "pointer",
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
          <div style={{ flex:1, minWidth:0, overflow:"hidden", background:"var(--c-bg, var(--surface-canvas))" }}>
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
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", gap:8, color:"var(--fg-4)", fontSize: 14 }}>
                  <Loader2 size={16} className="animate-spin" />
                  Cargando…
                </div>
              ) : detail ? (
                <OTDetail
                  // Remount per OT: a new key throws away OTDetail's local state,
                  // so opening another OT always lands on Detalles with its own
                  // data instead of inheriting the previous OT's section.
                  key={detail.id}
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
                  <p style={{ fontSize: 14, fontWeight: 400, color:"var(--fg-2)" }}>Selecciona una orden</p>
                  <p style={{ fontSize: 14, color:"var(--fg-4)", marginTop:4 }}>El detalle aparecerá aquí</p>
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
          onClick={() => { setSelected(null); setDetail(null); setRightPanel("none"); router.push(viewPath, { scroll: false }); }}
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
                onClose={() => { setRightPanel("none"); router.push(viewPath, { scroll: false }); }}
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
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"80px 20px", gap:8, color:"var(--fg-4)", fontSize: 14 }}>
                <Loader2 size={16} className="animate-spin" />
                Cargando…
              </div>
            ) : detail ? (
              <OTDetail
                // Remount per OT — see the note on the other render site.
                key={detail.id}
                orden={detail}
                usuarios={usuarios}
                myId={myId}
                myRol={myRol}
                wsId={wsId}
                onEdit={() => setRightPanel("edit")}
                onDelete={() => deleteOT(detail.id)}
                onClose={() => { setSelected(null); setDetail(null); setRightPanel("none"); router.push(viewPath, { scroll: false }); }}
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
                <div style={{ fontSize: 14, fontWeight: 400, color:"var(--fg-1)" }}>Exportar Excel</div>
                <div style={{ fontSize: 14, color:"var(--fg-4)", marginTop:2 }}>
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
                  <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em" }}>Filtrar por estado</span>
                  {exportFilterEstados.length > 0 && (
                    <button type="button" onClick={() => setExportFilterEstados([])}
                      style={{ fontSize: 14, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
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
                          fontSize: 14, fontWeight: 400,
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
                  <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)", letterSpacing: "0.01em" }}>Filtrar por tipo de trabajo</span>
                  {exportFilterTipos.length > 0 && (
                    <button type="button" onClick={() => setExportFilterTipos([])}
                      style={{ fontSize: 14, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
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
                          fontSize: 14, fontWeight: 400,
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
                  <div style={{ fontSize: 14, fontWeight: 400, color:"var(--fg-4)", letterSpacing:"0.01em", marginBottom:4, paddingLeft:10 }}>
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
                        <span style={{ fontSize: 14, color: exportCols[col.key] ? "var(--fg-1)" : "var(--fg-4)" }}>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Select all / none */}
            <div style={{ padding:"8px 20px 10px", display:"flex", gap:8, borderTop:"1px solid #F1F5F9" }}>
              <button type="button" onClick={() => setExportCols(ALL_COLS_ON)}
                style={{ fontSize: 14, color:"var(--brand-fg)", background:"transparent", border:"none", cursor:"pointer", padding:"2px 0", fontFamily:"inherit" }}>
                Seleccionar todo
              </button>
              <span style={{ color:"var(--border)" }}>·</span>
              <button type="button" onClick={() => setExportCols(ALL_COLS_OFF)}
                style={{ fontSize: 14, color:"var(--fg-4)", background:"transparent", border:"none", cursor:"pointer", padding:"2px 0", fontFamily:"inherit" }}>
                Limpiar
              </button>
              <span style={{ marginLeft:"auto", fontSize: 14, color:"var(--fg-4)" }}>
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
                style={{ height:36, padding:"0 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface-1)", fontSize: 14, color:"var(--fg-2)", cursor:"pointer", fontFamily:"inherit" }}
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
                  fontSize: 14, fontWeight: 400, color:"var(--surface-1)",
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
