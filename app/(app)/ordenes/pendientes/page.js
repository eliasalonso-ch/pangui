"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, Settings2, MapPin, Clock,
  ChevronDown, ChevronUp, Minus, AlertTriangle,
  Calendar, SlidersHorizontal,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "../page.module.css";

const ESTADO_LABEL = {
  pendiente: "Abierta", en_espera: "En espera",
  en_curso: "En curso", en_revision: "En revisión",
};
const ESTADO_COLOR = {
  pendiente:   { bg: "#EFF6FF", text: "#3B82F6" },
  en_espera:   { bg: "#FFFBEB", text: "#D97706" },
  en_curso:    { bg: "#EEF2FF", text: "#6366F1" },
  en_revision: { bg: "#EEF2FF", text: "#6366F1" },
};
const PRIORIDAD_COLOR = { ninguna: null, baja: "#9CA3AF", media: "#3B82F6", alta: "#F97316", urgente: "#EF4444" };
const PRIORIDAD_LABEL = { ninguna: "Sin prioridad", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" };
const PRIORIDAD_ICON  = { baja: ChevronDown, media: Minus, alta: ChevronUp, urgente: AlertTriangle };
const SORT_OPTS = [
  { value: "created_at_desc",   label: "Más reciente" },
  { value: "fecha_termino_asc", label: "Fecha límite ↑" },
  { value: "prioridad_desc",    label: "Prioridad ↓" },
];
const PRIORIDAD_ORDER = { urgente: 4, alta: 3, media: 2, baja: 1, ninguna: 0 };
const TIPO_TRABAJO_LABEL = { reactiva: "Reactiva", preventiva: "Preventiva", inspeccion: "Inspección", mejora: "Mejora" };

const ESTADOS_FILTRO = [
  { value: "todas",       label: "Todas" },
  { value: "pendiente",   label: "Abierta" },
  { value: "en_espera",   label: "En espera" },
  { value: "en_curso",    label: "En curso" },
  { value: "en_revision", label: "En revisión" },
];

function vencimiento(fecha) {
  if (!fecha) return null;
  const diff = Math.ceil((new Date(fecha) - Date.now()) / 86400000);
  if (diff < 0)  return { label: `vencida hace ${Math.abs(diff)}d`, urgent: true };
  if (diff === 0) return { label: "vence hoy", urgent: true };
  if (diff === 1) return { label: "vence mañana", urgent: true };
  if (diff <= 7)  return { label: `vence en ${diff} días`, urgent: false };
  return { label: new Date(fecha).toLocaleDateString("es-CL"), urgent: false };
}

export default function OrdenesPendientes() {
  const router = useRouter();
  const [ordenes,      setOrdenes]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busqueda,     setBusqueda]     = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [sortBy,       setSortBy]       = useState("created_at_desc");
  const [usuarios,     setUsuarios]     = useState([]);
  const [ubicaciones,  setUbicaciones]  = useState([]);
  const [activos,      setActivos]      = useState([]);
  const [categorias,   setCategorias]   = useState([]);

  // Overlays
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(null);
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [filtros,      setFiltros]      = useState({
    asignado_a: [], prioridad: [], ubicacion_id: [], activo_id: [],
    categoria_id: [], tipo_trabajo: [],
    fecha_termino_desde: "", fecha_termino_hasta: "",
    created_desde: "", created_hasta: "",
  });

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: perfil } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) { setLoading(false); return; }
      const [res, uRes, locRes, actRes, catRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select("id, titulo, descripcion, estado, prioridad, tipo_trabajo, fecha_termino, created_at, ubicacion_id, activo_id, asignados_ids, categoria_id, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
          .eq("workspace_id", perfil.workspace_id)
          .in("estado", ["pendiente","en_espera","en_curso","en_revision"])
          .order("created_at", { ascending: false }),
        sb.from("usuarios").select("id, nombre, rol").eq("workspace_id", perfil.workspace_id).order("nombre"),
        sb.from("ubicaciones").select("id, edificio").eq("workspace_id", perfil.workspace_id).eq("activa", true),
        sb.from("activos").select("id, nombre").eq("workspace_id", perfil.workspace_id).eq("activo", true),
        sb.from("categorias_ot").select("id, nombre, color").or(`workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`),
      ]);
      setOrdenes(res.data ?? []);
      setUsuarios(uRes.data ?? []);
      setUbicaciones(locRes.data ?? []);
      setActivos(actRes.data ?? []);
      setCategorias(catRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const lista = (() => {
    let list = [...ordenes];
    if (filtroEstado !== "todas") list = list.filter(o => o.estado === filtroEstado);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      list = list.filter(o => (o.titulo ?? o.descripcion ?? "").toLowerCase().includes(q));
    }
    if (calendarDate) {
      const cy = calendarDate.getFullYear(), cm = calendarDate.getMonth(), cd = calendarDate.getDate();
      list = list.filter(o => { const d = new Date(o.created_at); return d.getFullYear() === cy && d.getMonth() === cm && d.getDate() === cd; });
    }
    if (filtros.prioridad.length > 0)    list = list.filter(o => filtros.prioridad.includes(o.prioridad));
    if (filtros.asignado_a.length > 0)   list = list.filter(o => (o.asignados_ids ?? []).some(uid => filtros.asignado_a.includes(uid)));
    if (filtros.ubicacion_id.length > 0) list = list.filter(o => filtros.ubicacion_id.includes(o.ubicacion_id));
    if (filtros.activo_id.length > 0)    list = list.filter(o => filtros.activo_id.includes(o.activo_id));
    if (filtros.categoria_id.length > 0) list = list.filter(o => filtros.categoria_id.includes(o.categoria_id));
    if (filtros.tipo_trabajo.length > 0) list = list.filter(o => filtros.tipo_trabajo.includes(o.tipo_trabajo));
    if (filtros.created_desde)           list = list.filter(o => new Date(o.created_at) >= new Date(filtros.created_desde));
    if (filtros.created_hasta)           list = list.filter(o => new Date(o.created_at) <= new Date(filtros.created_hasta + "T23:59:59"));
    if (filtros.fecha_termino_desde)     list = list.filter(o => o.fecha_termino && new Date(o.fecha_termino) >= new Date(filtros.fecha_termino_desde));
    if (filtros.fecha_termino_hasta)     list = list.filter(o => o.fecha_termino && new Date(o.fecha_termino) <= new Date(filtros.fecha_termino_hasta + "T23:59:59"));
    list.sort((a, b) => {
      if (sortBy === "created_at_desc")   return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "fecha_termino_asc") { if (!a.fecha_termino) return 1; if (!b.fecha_termino) return -1; return new Date(a.fecha_termino) - new Date(b.fecha_termino); }
      if (sortBy === "prioridad_desc")    return (PRIORIDAD_ORDER[b.prioridad] ?? 0) - (PRIORIDAD_ORDER[a.prioridad] ?? 0);
      return 0;
    });
    return list;
  })();

  const activeFilterCount = [
    filtros.asignado_a.length > 0, filtros.prioridad.length > 0,
    filtros.ubicacion_id.length > 0, filtros.activo_id.length > 0,
    filtros.categoria_id.length > 0, filtros.tipo_trabajo.length > 0,
    !!(filtros.fecha_termino_desde || filtros.fecha_termino_hasta),
    !!(filtros.created_desde || filtros.created_hasta),
    sortBy !== "created_at_desc",
  ].filter(Boolean).length;

  return (
    <div className={styles.root} style={{ display: "block", height: "100dvh", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderLeft}>
            <button className={styles.pageHeaderBack} onClick={() => router.back()} type="button">
              <ArrowLeft size={20} />
            </button>
            <h1 className={styles.pageHeaderTitle}>Pendientes</h1>
          </div>
          <div className={styles.pageHeaderActions}>
            <button className={`${styles.pageHeaderBtn} ${calendarDate ? styles.pageHeaderBtnActive : ""}`}
              onClick={() => setCalendarOpen(true)} type="button" title="Filtrar por fecha">
              <Calendar size={18} />
              {calendarDate && <span className={styles.pageHeaderBtnDot} />}
            </button>
            <button className={`${styles.pageHeaderBtn} ${activeFilterCount > 0 ? styles.pageHeaderBtnActive : ""}`}
              onClick={() => setFilterOpen(true)} type="button" title="Filtros">
              <SlidersHorizontal size={18} />
              {activeFilterCount > 0 && <span className={styles.pageHeaderBtnBadge}>{activeFilterCount}</span>}
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div className={styles.sectionTabs}>
          <button className={`${styles.sectionTab} ${styles.sectionTabActive}`} type="button" onClick={() => router.push("/ordenes")}>
            Pendientes
          </button>
          <button className={styles.sectionTab} type="button" onClick={() => router.push("/ordenes/completadas")}>
            Completadas
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input className={styles.searchInput} placeholder="Buscar OTs…" value={busqueda}
            onChange={e => setBusqueda(e.target.value)} />
          {busqueda && <button className={styles.searchClear} onClick={() => setBusqueda("")}><X size={14} /></button>}
        </div>

        {/* Pills */}
        <div className={styles.pillsRow}>
          {ESTADOS_FILTRO.map(e => (
            <button key={e.value}
              className={`${styles.pill} ${filtroEstado === e.value ? styles.pillActive : ""}`}
              onClick={() => setFiltroEstado(e.value)}>
              {e.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className={styles.otList}>
          {loading ? (
            <div className={styles.emptyState}>Cargando…</div>
          ) : lista.length === 0 ? (
            <div className={styles.emptyState}>Sin órdenes pendientes</div>
          ) : lista.map(o => {
            const venc      = vencimiento(o.fecha_termino);
            const est       = ESTADO_COLOR[o.estado] ?? { bg: "#F3F4F6", text: "#6B7280" };
            const PrioIcon  = PRIORIDAD_ICON[o.prioridad];
            const prioColor = PRIORIDAD_COLOR[o.prioridad];
            return (
              <button key={o.id} className={styles.otCard} onClick={() => router.push(`/ordenes/${o.id}`)}>
                <div className={styles.otCardHeader}>
                  <span className={styles.otStatusBadge} style={{ background: est.bg, color: est.text }}>
                    {ESTADO_LABEL[o.estado]}
                  </span>
                  <span className={styles.otTimeAgo}>
                    {(() => {
                      const diff = Date.now() - new Date(o.created_at);
                      const min = Math.floor(diff / 60000);
                      if (min < 1) return "ahora";
                      if (min < 60) return `hace ${min}m`;
                      const h = Math.floor(min / 60);
                      if (h < 24) return `hace ${h}h`;
                      return new Date(o.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
                    })()}
                  </span>
                </div>
                <p className={styles.otTitle}>{o.titulo || o.descripcion?.slice(0, 80) || "Sin título"}</p>
                <div className={styles.otCardMeta}>
                  {o.activos?.nombre && <span className={styles.otMeta}><Settings2 size={11} />{o.activos.nombre}</span>}
                  {o.ubicaciones?.edificio && <span className={styles.otMeta}><MapPin size={11} />{o.ubicaciones.edificio}</span>}
                  {venc && <span className={`${styles.otMeta} ${venc.urgent ? styles.otMetaUrgent : ""}`}><Clock size={11} />{venc.label}</span>}
                  {PrioIcon && <span className={styles.otMeta} style={{ color: prioColor }}><PrioIcon size={11} />{PRIORIDAD_LABEL[o.prioridad]}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar Overlay */}
      {calendarOpen && (
        <PendientesCalendarOverlay
          onClose={() => setCalendarOpen(false)}
          calendarDate={calendarDate}
          setCalendarDate={setCalendarDate}
          ordenes={ordenes}
          ESTADO_LABEL={ESTADO_LABEL}
          ESTADO_COLOR={ESTADO_COLOR}
        />
      )}

      {/* Filter Overlay */}
      {filterOpen && (
        <PendientesFilterOverlay
          onClose={() => setFilterOpen(false)}
          filtros={filtros}
          setFiltros={setFiltros}
          sortBy={sortBy}
          setSortBy={setSortBy}
          usuarios={usuarios}
          ubicaciones={ubicaciones}
          activos={activos}
          categorias={categorias}
          SORT_OPTS={SORT_OPTS}
          PRIORIDAD_COLOR={PRIORIDAD_COLOR}
          PRIORIDAD_LABEL={PRIORIDAD_LABEL}
          TIPO_TRABAJO_LABEL={TIPO_TRABAJO_LABEL}
        />
      )}
    </div>
  );
}

function PendientesCalendarOverlay({ onClose, calendarDate, setCalendarDate, ordenes, ESTADO_LABEL, ESTADO_COLOR }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = calendarDate || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const firstDow = (new Date(viewMonth.year, viewMonth.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date();
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  const countByDay = {};
  ordenes.forEach(o => {
    const d = new Date(o.created_at);
    if (d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month) countByDay[d.getDate()] = (countByDay[d.getDate()] || 0) + 1;
  });
  const ordenesDia = calendarDate ? ordenes.filter(o => sameDay(new Date(o.created_at), calendarDate)) : [];
  const monthLabel = new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  function prevMonth() { const d = new Date(viewMonth.year, viewMonth.month - 1, 1); setViewMonth({ year: d.getFullYear(), month: d.getMonth() }); }
  function nextMonth() { const d = new Date(viewMonth.year, viewMonth.month + 1, 1); setViewMonth({ year: d.getFullYear(), month: d.getMonth() }); }
  function selectDay(day) { if (!day) return; const d = new Date(viewMonth.year, viewMonth.month, day); setCalendarDate(sameDay(d, calendarDate) ? null : d); }
  return (
    <div className={styles.overlayFull}>
      <div className={styles.overlayHeader}>
        <button className={styles.overlayBack} onClick={onClose} type="button"><X size={20} /></button>
        <span className={styles.overlayTitle}>Buscar por fecha</span>
        {calendarDate && <button className={styles.overlayClearBtn} type="button" onClick={() => setCalendarDate(null)}>Limpiar</button>}
      </div>
      <div className={styles.calendarWrap}>
        <div className={styles.calendarNav}>
          <button className={styles.calNavBtn} onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
          <span className={styles.calMonthLabel}>{monthLabel}</span>
          <button className={styles.calNavBtn} onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
        </div>
        <div className={styles.calDowRow}>{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => <div key={d} className={styles.calDow}>{d}</div>)}</div>
        <div className={styles.calGrid}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const thisDate = new Date(viewMonth.year, viewMonth.month, day);
            return (
              <button key={day} type="button"
                className={`${styles.calDay} ${sameDay(thisDate, today) ? styles.calDayToday : ""} ${sameDay(thisDate, calendarDate) ? styles.calDaySelected : ""}`}
                onClick={() => selectDay(day)}>
                {day}
                {(countByDay[day] || 0) > 0 && <span className={styles.calDayDot} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.calResults}>
        {calendarDate ? (
          <>
            <p className={styles.calResultsLabel}>{ordenesDia.length > 0 ? `${ordenesDia.length} orden${ordenesDia.length !== 1 ? "es" : ""} — ${calendarDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}` : `Sin órdenes el ${calendarDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`}</p>
            <div className={styles.calResultsList}>
              {ordenesDia.map(o => { const est = ESTADO_COLOR[o.estado] ?? { bg: "#F3F4F6", text: "#6B7280" }; return (<div key={o.id} className={styles.calResultCard}><span className={styles.otStatusBadge} style={{ background: est.bg, color: est.text, fontSize: 11 }}>{ESTADO_LABEL[o.estado]}</span><p className={styles.calResultTitle}>{o.titulo || "Sin título"}</p></div>); })}
            </div>
          </>
        ) : <p className={styles.calHint}>Selecciona un día para ver las órdenes creadas</p>}
      </div>
      <div className={styles.filterFooter}><button className={styles.filterApplyBtn} type="button" onClick={onClose}>{calendarDate ? "Ver resultados" : "Cerrar"}</button></div>
    </div>
  );
}

function PendientesFilterOverlay({ onClose, filtros, setFiltros, sortBy, setSortBy, usuarios, ubicaciones, activos, categorias, SORT_OPTS, PRIORIDAD_COLOR, PRIORIDAD_LABEL, TIPO_TRABAJO_LABEL }) {
  function toggle(key, val) { setFiltros(f => { const arr = f[key]; return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }; }); }
  function clearAll() { setFiltros({ asignado_a: [], prioridad: [], ubicacion_id: [], activo_id: [], categoria_id: [], tipo_trabajo: [], fecha_termino_desde: "", fecha_termino_hasta: "", created_desde: "", created_hasta: "" }); setSortBy("created_at_desc"); }
  const activeCount = [filtros.asignado_a.length > 0, filtros.prioridad.length > 0, filtros.ubicacion_id.length > 0, filtros.activo_id.length > 0, filtros.categoria_id.length > 0, filtros.tipo_trabajo.length > 0, !!(filtros.fecha_termino_desde || filtros.fecha_termino_hasta), !!(filtros.created_desde || filtros.created_hasta), sortBy !== "created_at_desc"].filter(Boolean).length;
  return (
    <div className={styles.overlayFull}>
      <div className={styles.overlayHeader}>
        <button className={styles.overlayBack} onClick={onClose} type="button"><X size={20} /></button>
        <span className={styles.overlayTitle}>Filtros{activeCount > 0 ? ` (${activeCount})` : ""}</span>
        {activeCount > 0 && <button className={styles.overlayClearBtn} type="button" onClick={clearAll}>Limpiar todo</button>}
      </div>
      <div className={styles.filterBody}>
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Ordenar por</p>
          <div className={styles.filterChipRow}>{SORT_OPTS.map(o => (<button key={o.value} type="button" className={`${styles.filterChip} ${sortBy === o.value ? styles.filterChipActive : ""}`} onClick={() => setSortBy(o.value)}>{o.label}</button>))}</div>
        </div>
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Prioridad</p>
          <div className={styles.filterChipRow}>{["urgente","alta","media","baja","ninguna"].map(v => (<button key={v} type="button" className={`${styles.filterChip} ${filtros.prioridad.includes(v) ? styles.filterChipActive : ""}`} onClick={() => toggle("prioridad", v)} style={filtros.prioridad.includes(v) && PRIORIDAD_COLOR[v] ? { borderColor: PRIORIDAD_COLOR[v], color: PRIORIDAD_COLOR[v], background: PRIORIDAD_COLOR[v] + "18" } : {}}>{PRIORIDAD_LABEL[v]}</button>))}</div>
        </div>
        {usuarios.length > 0 && (<div className={styles.filterSection}><p className={styles.filterSectionLabel}>Responsable</p><div className={styles.filterChipRow}>{usuarios.map(u => { const initials = u.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase(); const active = filtros.asignado_a.includes(u.id); return (<button key={u.id} type="button" className={`${styles.filterChip} ${active ? styles.filterChipActive : ""}`} onClick={() => toggle("asignado_a", u.id)}><span className={styles.filterAvatar} style={active ? { background: "var(--accent-1)", color: "#fff" } : {}}>{initials}</span>{u.nombre.split(" ")[0]}</button>); })}</div></div>)}
        <div className={styles.filterSection}><p className={styles.filterSectionLabel}>Tipo de trabajo</p><div className={styles.filterChipRow}>{Object.entries(TIPO_TRABAJO_LABEL).map(([v, l]) => (<button key={v} type="button" className={`${styles.filterChip} ${filtros.tipo_trabajo.includes(v) ? styles.filterChipActive : ""}`} onClick={() => toggle("tipo_trabajo", v)}>{l}</button>))}</div></div>
        {ubicaciones.length > 0 && (<div className={styles.filterSection}><p className={styles.filterSectionLabel}>Ubicación</p><div className={styles.filterChipRow}>{ubicaciones.map(u => (<button key={u.id} type="button" className={`${styles.filterChip} ${filtros.ubicacion_id.includes(u.id) ? styles.filterChipActive : ""}`} onClick={() => toggle("ubicacion_id", u.id)}>{u.edificio}</button>))}</div></div>)}
        {activos.length > 0 && (<div className={styles.filterSection}><p className={styles.filterSectionLabel}>Activo / Equipo</p><div className={styles.filterChipRow}>{activos.map(a => (<button key={a.id} type="button" className={`${styles.filterChip} ${filtros.activo_id.includes(a.id) ? styles.filterChipActive : ""}`} onClick={() => toggle("activo_id", a.id)}>{a.nombre}</button>))}</div></div>)}
        <div className={styles.filterSection}><p className={styles.filterSectionLabel}>Fecha de creación</p><div className={styles.filterDateRow}><div className={styles.filterDateField}><label className={styles.filterDateLabel}>Desde</label><input type="date" className={styles.filterDateInput} value={filtros.created_desde} onChange={e => setFiltros(f => ({ ...f, created_desde: e.target.value }))} /></div><div className={styles.filterDateField}><label className={styles.filterDateLabel}>Hasta</label><input type="date" className={styles.filterDateInput} value={filtros.created_hasta} onChange={e => setFiltros(f => ({ ...f, created_hasta: e.target.value }))} /></div></div></div>
        <div className={styles.filterSection}><p className={styles.filterSectionLabel}>Fecha límite</p><div className={styles.filterDateRow}><div className={styles.filterDateField}><label className={styles.filterDateLabel}>Desde</label><input type="date" className={styles.filterDateInput} value={filtros.fecha_termino_desde} onChange={e => setFiltros(f => ({ ...f, fecha_termino_desde: e.target.value }))} /></div><div className={styles.filterDateField}><label className={styles.filterDateLabel}>Hasta</label><input type="date" className={styles.filterDateInput} value={filtros.fecha_termino_hasta} onChange={e => setFiltros(f => ({ ...f, fecha_termino_hasta: e.target.value }))} /></div></div></div>
        <div style={{ height: 100 }} />
      </div>
      <div className={styles.filterFooter}><button className={styles.filterApplyBtn} type="button" onClick={onClose}>Ver resultados</button></div>
    </div>
  );
}
