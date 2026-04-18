"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, ChevronDown, Loader2, FileText, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { fetchOrden, deleteOrden, LIST_SELECT } from "@/lib/ordenes-api";
import OTRow from "./OTRow";
import OTDetail from "./OTDetail";
import OTCrearPanel from "./OTCrearPanel";
import OTEditPanel from "./OTEditPanel";
import OTFiltrosPanel from "./OTFiltrosPanel";
import type {
  OrdenListItem, OrdenTrabajo,
  Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT,
  Estado, FiltrosState, SortOption,
} from "@/types/ordenes";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_ESTADOS  = new Set<Estado>(["pendiente","en_espera","en_curso","en_revision"]);
const CLOSED_ESTADOS  = new Set<Estado>(["completado","cancelado"]);
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
  venceHoy: false,
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

  const [ordenes, setOrdenes]   = useState<OrdenListItem[]>(initialOrdenes);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const [detail, setDetail]     = useState<OrdenTrabajo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [tab, setTab]           = useState<"activas" | "cerradas">("activas");
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<SortOption>("prioridad_desc");
  const [filtros, setFiltros]   = useState<FiltrosState>(EMPTY_FILTROS);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sortOpen, setSortOpen]  = useState(false);

  const [rightPanel, setRightPanel] = useState<"none" | "create" | "edit">(initialPanel === "create" ? "create" : "none");

  // Keep left-panel visible when right panel is open (desktop only hides list on mobile)
  const rtRef   = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
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

  // Realtime subscription
  useEffect(() => {
    const sb = createClient();
    rtRef.current = sb.channel(`ordenes-bandeja-${wsId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ordenes_trabajo", filter: `workspace_id=eq.${wsId}` },
        p => setOrdenes(prev => prev.find(o => o.id === (p.new as OrdenListItem).id) ? prev : [p.new as unknown as OrdenListItem, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ordenes_trabajo", filter: `workspace_id=eq.${wsId}` },
        p => {
          setOrdenes(prev => prev.map(o => o.id === (p.new as OrdenListItem).id ? { ...o, ...p.new } : o));
          setDetail(prev => prev?.id === (p.new as OrdenTrabajo).id ? { ...prev, ...p.new as OrdenTrabajo } : prev);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "ordenes_trabajo" },
        p => {
          setOrdenes(prev => prev.filter(o => o.id !== (p.old as { id: string }).id));
          setDetail(prev => prev?.id === (p.old as { id: string }).id ? null : prev);
        })
      .subscribe();
    return () => { if (rtRef.current) sb.removeChannel(rtRef.current); };
  }, [wsId]);

  // Open order detail
  const openOT = useCallback(async (id: string, pushUrl = true) => {
    if (pushUrl) router.push(`/ordenes?id=${id}`, { scroll: false });
    setRightPanel("none");
    setSelected(id);
    setLoadingDetail(true);
    try {
      const orden = await fetchOrden(id);
      setDetail(orden);
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
      tab === "activas" ? ACTIVE_ESTADOS.has(o.estado) : CLOSED_ESTADOS.has(o.estado)
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
    if (filtros.venceHoy) {
      const today = new Date().toDateString();
      list = list.filter(o => o.fecha_termino != null && new Date(o.fecha_termino).toDateString() === today);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => (o.titulo ?? o.descripcion ?? "").toLowerCase().includes(q));
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

  const activeCount = ordenes.filter(o => ACTIVE_ESTADOS.has(o.estado)).length;
  const closedCount = ordenes.filter(o => CLOSED_ESTADOS.has(o.estado)).length;
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? "";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", overflow:"hidden", background:"#fff" }}>

      {/* ── Navigation header ── */}
      <div style={{ flexShrink:0, borderBottom:"1px solid #E5E7EB", background:"#fff" }}>

        {/* Top row */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 20px", height:56, gap:12,
        }}>
          <h1 style={{ fontSize:20, fontWeight:700, color:"#1E2429", letterSpacing:"-0.3px", lineHeight:1.25, flexShrink:0 }}>
            Órdenes de Trabajo
          </h1>

          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"flex-end" }}>
            {/* Search */}
            <div style={{ position:"relative", maxWidth:280, flex:1 }}>
              <Search size={14} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"#8594A3", pointerEvents:"none" }} />
              <input
                type="search"
                placeholder="Buscar Órdenes de Trabajo"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  paddingLeft:32, paddingRight:search ? 28 : 10,
                  height:34, width:"100%",
                  border:"1px solid #E5E7EB", borderRadius:6,
                  fontSize:13, color:"#1E2429", background:"#fff",
                  outline:"none", fontFamily:"inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#273D88"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#8594A3", display:"flex" }}
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
                padding:"0 14px", height:36,
                background:"#273D88", color:"#fff",
                border:"none", borderRadius:6,
                fontSize:13, fontWeight:600,
                cursor:"pointer", fontFamily:"inherit",
                transition:"background 0.1s", whiteSpace:"nowrap", flexShrink:0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#1F316E")}
              onMouseLeave={e => (e.currentTarget.style.background = "#273D88")}
            >
              <Plus size={16} strokeWidth={2} />
              Nueva Orden de Trabajo
            </button>
          </div>
        </div>

        {/* Sub-nav: filter chips + sort */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 20px", height:40, gap:8,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {/* Active filter chips */}
            {filtros.estados.map(e => (
              <span key={e} style={{ display:"flex", alignItems:"center", gap:4, height:24, padding:"0 8px", background:"#EEF1FB", borderRadius:4, fontSize:11, fontWeight:600, color:"#273D88" }}>
                {e}
                <button type="button" onClick={() => setFiltros(f => ({ ...f, estados: f.estados.filter(x => x !== e) }))} style={{ background:"none", border:"none", cursor:"pointer", color:"#273D88", display:"flex", padding:0, lineHeight:1 }}><X size={9} /></button>
              </span>
            ))}
            {filtros.prioridades.map(p => (
              <span key={p} style={{ display:"flex", alignItems:"center", gap:4, height:24, padding:"0 8px", background:"#EEF1FB", borderRadius:4, fontSize:11, fontWeight:600, color:"#273D88" }}>
                {p}
                <button type="button" onClick={() => setFiltros(f => ({ ...f, prioridades: f.prioridades.filter(x => x !== p) }))} style={{ background:"none", border:"none", cursor:"pointer", color:"#273D88", display:"flex", padding:0, lineHeight:1 }}><X size={9} /></button>
              </span>
            ))}
            {filtros.venceHoy && (
              <span style={{ display:"flex", alignItems:"center", gap:4, height:24, padding:"0 8px", background:"#FFF7ED", borderRadius:4, fontSize:11, fontWeight:600, color:"#F97316" }}>
                Vence hoy
                <button type="button" onClick={() => setFiltros(f => ({ ...f, venceHoy: false }))} style={{ background:"none", border:"none", cursor:"pointer", color:"#F97316", display:"flex", padding:0, lineHeight:1 }}><X size={9} /></button>
              </span>
            )}
            <button
              type="button"
              onClick={() => setFiltrosOpen(v => !v)}
              style={{
                display:"flex", alignItems:"center", gap:5,
                height:28, padding:"0 10px",
                border: filtrosOpen ? "1.5px solid #273D88" : "1px solid #E5E7EB",
                borderRadius:6,
                background: filtrosOpen ? "#EEF1FB" : "#fff",
                color: filtrosOpen ? "#273D88" : "#4D5A66",
                fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit",
              }}
            >
              <SlidersHorizontal size={13} />
              Filtros
              {(filtros.estados.length + filtros.prioridades.length + filtros.tipos.length + filtros.asignadoIds.length + filtros.ubicacionIds.length + filtros.sociedadIds.length + (filtros.venceHoy ? 1 : 0)) > 0 && (
                <span style={{ fontSize:10, fontWeight:700, background:"#273D88", color:"#fff", borderRadius:"50%", width:16, height:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {filtros.estados.length + filtros.prioridades.length + filtros.tipos.length + filtros.asignadoIds.length + filtros.ubicacionIds.length + filtros.sociedadIds.length + (filtros.venceHoy ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          {/* Sort dropdown */}
          <div ref={sortRef} style={{ position:"relative" }}>
            <button
              type="button"
              onClick={() => setSortOpen(v => !v)}
              style={{
                display:"flex", alignItems:"center", gap:4,
                height:28, padding:"0 8px",
                border:"1px solid #E5E7EB", borderRadius:6,
                background:"#fff", color:"#4D5A66",
                fontSize:12, fontWeight:500, cursor:"pointer",
                fontFamily:"inherit", whiteSpace:"nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#B5C0C9"; e.currentTarget.style.background = "#F9FAFB"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
            >
              <ArrowUpDown size={11} style={{ color:"#8594A3" }} />
              <span>Ordenar por:</span>
              <span style={{ fontWeight:600, color:"#1E2429" }}>{currentSortLabel.split(":")[0]}</span>
              <ChevronDown size={11} style={{ color:"#8594A3", transform: sortOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
            </button>
            {sortOpen && (
              <div style={{
                position:"absolute", right:0, top:"calc(100% + 4px)", zIndex:50,
                background:"#fff", border:"1px solid #E5E7EB",
                borderRadius:6, boxShadow:"0 4px 16px rgba(0,0,0,0.1)",
                minWidth:220, overflow:"hidden",
              }}>
                {SORT_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { setSort(o.value); setSortOpen(false); }}
                    style={{
                      display:"block", width:"100%", textAlign:"left",
                      padding:"8px 14px", background: sort === o.value ? "#EEF1FB" : "none",
                      border:"none", fontSize:12.5,
                      color: sort === o.value ? "#273D88" : "#1E2429",
                      fontWeight: sort === o.value ? 600 : 400,
                      cursor:"pointer", fontFamily:"inherit",
                    }}
                    onMouseEnter={e => { if (sort !== o.value) e.currentTarget.style.background = "#F9FAFB"; }}
                    onMouseLeave={e => { if (sort !== o.value) e.currentTarget.style.background = "none"; }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          borderRight: isDesktop ? "1px solid #E5E7EB" : "none",
          background:"#fff",
          flexShrink:0,
          position:"relative",
        }}>

          {/* Filter panel overlay — slides over the list */}
          {filtrosOpen && (
            <div style={{ position:"absolute", inset:0, zIndex:30, background:"#fff" }}>
              <OTFiltrosPanel
                filtros={filtros}
                onChange={setFiltros}
                onClose={() => setFiltrosOpen(false)}
                usuarios={usuarios}
                ubicaciones={ubicaciones}
                sociedades={sociedades}
              />
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:"flex", borderBottom:"1px solid #E5E7EB", padding:"0 20px", flexShrink:0 }}>
            {[
              { key:"activas",  label:"Pendientes", count:activeCount },
              { key:"cerradas", label:"Completas",  count:closedCount },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key as "activas" | "cerradas")}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"12px 4px", marginRight:16,
                  background:"none", border:"none",
                  borderBottom: tab === t.key ? "2px solid #273D88" : "2px solid transparent",
                  color: tab === t.key ? "#273D88" : "#4D5A66",
                  fontSize:13, fontWeight: tab === t.key ? 600 : 500,
                  cursor:"pointer", fontFamily:"inherit",
                  marginBottom:-1, transition:"color 0.1s",
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    fontSize:11, fontWeight:600, padding:"1px 6px",
                    background: tab === t.key ? "#EEF1FB" : "#F3F4F6",
                    color: tab === t.key ? "#273D88" : "#6B7280",
                    borderRadius:4,
                  }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
            {filtered.length === 0 ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:280, gap:12, color:"#8594A3" }}>
                <svg width="38" height="46" viewBox="0 0 38 46" fill="none">
                  <rect x="2" y="2" width="34" height="42" rx="2" fill="#A67C52"/>
                  <rect x="6" y="7" width="26" height="32" rx="1" fill="#fff"/>
                  <path d="M23 4a4 4 0 0 0-8 0h-3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3z" fill="#EFD358"/>
                  <circle cx="19" cy="4" r="1" fill="#B29930"/>
                  <path d="M17 30a1 1 0 0 1-.707-.293l-4-4a1 1 0 1 1 1.414-1.414L17 27.586l7.293-7.293a1 1 0 1 1 1.414 1.414l-8 8A1 1 0 0 1 17 30z" fill="#72C472"/>
                </svg>
                <p style={{ fontSize:13, color:"#4D5A66", fontWeight:500 }}>
                  {search ? "Sin resultados para tu búsqueda" : tab === "activas" ? "No tienes ninguna Orden de Trabajo" : "No hay órdenes cerradas"}
                </p>
                {!search && tab === "activas" && (
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); openCreate(); }}
                    style={{ fontSize:13, color:"#273D88", fontWeight:500, textDecoration:"underline" }}
                  >
                    Crea la primera Orden de Trabajo
                  </a>
                )}
              </div>
            ) : (
              filtered.map(o => (
                <OTRow
                  key={o.id}
                  orden={o}
                  usuarios={usuarios}
                  isSelected={selected === o.id}
                  onClick={() => openOT(o.id, true)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT: create panel or detail */}
        {isDesktop && (
          <div style={{ flex:1, minWidth:0, overflow:"hidden", background:"#fff" }}>
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
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", gap:8, color:"#8594A3", fontSize:13 }}>
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
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, color:"#8594A3" }}>
                <div style={{ width:64, height:64, borderRadius:8, background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <FileText size={28} style={{ color:"#D1D5DB" }} />
                </div>
                <div style={{ textAlign:"center" }}>
                  <p style={{ fontSize:14, fontWeight:600, color:"#4D5A66" }}>Selecciona una orden</p>
                  <p style={{ fontSize:12, color:"#8594A3", marginTop:4 }}>El detalle aparecerá aquí</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
