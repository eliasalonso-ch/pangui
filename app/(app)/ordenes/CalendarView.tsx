"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, RotateCw, Lock, MapPin, Wrench, Clock, User, AlertCircle, X, CalendarClock } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks,
  format, isSameMonth, isSameDay, parseISO, isWeekend, getWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { updateOrden } from "@/lib/ordenes-api";
import type { OrdenListItem, Usuario } from "@/types/ordenes";

export type CalendarMode = "mes" | "semana";

interface Props {
  ordenes:         OrdenListItem[];
  reprogramadaIds: Set<string>;
  selectedId:      string | null;
  myId:            string;
  usuarios:        Usuario[];
  onOpenOT:        (id: string) => void;
  // Optimistic local update. The bandeja patches its `ordenes` state on drop
  // so the card visually moves before the Supabase round-trip completes.
  onPatchOrden:    (id: string, patch: Partial<OrdenListItem>) => void;
}

interface CalendarEntry {
  key: string;
  orden: OrdenListItem;
  dateKey: string;
  isPreview: boolean;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente:  "Asignada",
  en_espera:  "En espera",
  en_curso:   "En curso",
  completado: "Completada",
};

const ESTADO_BG: Record<string, string> = {
  pendiente:  "var(--st-open-bg)",
  en_espera:  "var(--st-wait-bg)",
  en_curso:   "var(--st-progress-bg)",
  completado: "var(--st-done-bg)",
};

const ESTADO_FG: Record<string, string> = {
  pendiente:  "var(--st-open-fg)",
  en_espera:  "var(--st-wait-fg)",
  en_curso:   "var(--st-progress-fg)",
  completado: "var(--st-done-fg)",
};

const PRIO_LABEL: Record<string, string> = {
  urgente: "Urgente",
  alta:    "Alta",
  media:   "Media",
  baja:    "Baja",
  ninguna: "—",
};

// Local-time YYYY-MM-DD (toISOString would shift by UTC offset).
function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Parse "YYYY-MM-DD" as local midnight (not UTC). Otherwise an OT scheduled for
// May 25 in CL renders on May 24 because UTC midnight is the previous local day.
function parseOTDate(s: string | null): Date | null {
  if (!s) return null;
  return parseISO(s.slice(0, 10) + "T00:00:00");
}

function getCalendarDate(o: OrdenListItem): Date | null {
  return parseOTDate(o.fecha_inicio ?? o.fecha_termino ?? null);
}

function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addLocalMonths(d: Date, months: number, dayOfMonth?: number | null): Date {
  const base = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(dayOfMonth ?? d.getDate(), last));
  return base;
}

function firstWeeklyOccurrence(d: Date, interval: number, targetWeekday: number): Date {
  const daysUntilTarget = (targetWeekday - d.getDay() + 7) % 7;
  // Selecting a later day in the current week should show that occurrence
  // immediately. When the selected day is today, the next occurrence belongs
  // to the following interval rather than duplicating the source OT.
  const days = daysUntilTarget === 0
    ? interval * 7
    : daysUntilTarget + (interval - 1) * 7;
  return addLocalDays(d, days);
}

function advanceOccurrenceDate(d: Date, o: OrdenListItem): Date | null {
  const config = o.recurrencia_config;
  const interval = Math.max(1, Number(config?.interval ?? 1) || 1);
  const weekdays = Array.isArray(config?.weekdays) ? config.weekdays : [];

  switch (o.recurrencia) {
    case "diaria": {
      let next = addLocalDays(d, 1);
      if (weekdays.length === 0) return addLocalDays(d, interval);
      for (let guard = 0; guard < 370; guard += 1) {
        if (weekdays.includes(next.getDay())) return next;
        next = addLocalDays(next, 1);
      }
      return null;
    }
    case "semanal": {
      const target = weekdays[0] ?? d.getDay();
      const shifted = addLocalDays(d, interval * 7);
      return addLocalDays(shifted, (target - shifted.getDay() + 7) % 7);
    }
    case "quincenal":
      return addLocalDays(d, 15);
    case "mensual":
    case "mensual_fecha":
    case "mensual_dia":
      return addLocalMonths(d, interval, config?.day_of_month ?? config?.month_day);
    case "anual":
      if (config?.anchor_date) {
        const anchor = parseOTDate(config.anchor_date);
        if (anchor) return new Date(d.getFullYear() + interval, anchor.getMonth(), anchor.getDate());
      }
      return new Date(d.getFullYear() + interval, d.getMonth(), d.getDate());
    case "personalizada":
      if (config?.unit === "day") return addLocalDays(d, interval);
      if (config?.unit === "week") {
        const target = weekdays[0] ?? d.getDay();
        const shifted = addLocalDays(d, interval * 7);
        return addLocalDays(shifted, (target - shifted.getDay() + 7) % 7);
      }
      if (config?.unit === "month") return addLocalMonths(d, interval, config?.day_of_month ?? config?.month_day);
      if (config?.unit === "year") return new Date(d.getFullYear() + interval, d.getMonth(), d.getDate());
      return null;
    default:
      return null;
  }
}

function getFirstPreviewDate(o: OrdenListItem): Date | null {
  const base = getCalendarDate(o);
  const config = o.recurrencia_config;
  const interval = Math.max(1, Number(config?.interval ?? 1) || 1);
  const target = config?.weekdays?.[0];
  if (base && target != null && (
    o.recurrencia === "semanal" ||
    (o.recurrencia === "personalizada" && config?.unit === "week")
  )) {
    return firstWeeklyOccurrence(base, interval, target);
  }
  const explicitNext = parseOTDate(o.proxima_ejecucion ?? null);
  if (explicitNext) return explicitNext;
  return base ? advanceOccurrenceDate(base, o) : null;
}

function buildRecurrencePreviewDates(o: OrdenListItem, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!o.recurrencia || o.recurrencia === "ninguna") return [];
  const endDate = parseOTDate(o.recurrencia_config?.end_date ?? null);
  const actualKey = getCalendarDate(o) ? toDateOnly(getCalendarDate(o)!) : null;
  const out: Date[] = [];
  let current = getFirstPreviewDate(o);

  for (let guard = 0; current && guard < 600; guard += 1) {
    if (endDate && current > endDate) break;
    if (current > rangeEnd) break;

    const key = toDateOnly(current);
    if (current >= rangeStart && key !== actualKey) out.push(current);
    current = advanceOccurrenceDate(current, o);
  }

  return out;
}

function setDragPreview(e: React.DragEvent, label: string) {
  const preview = document.createElement("div");
  preview.textContent = label;
  preview.style.position = "fixed";
  preview.style.top = "-1000px";
  preview.style.left = "-1000px";
  preview.style.maxWidth = "260px";
  preview.style.padding = "7px 10px";
  preview.style.border = "1px solid var(--brand)";
  preview.style.borderRadius = "6px";
  preview.style.background = "var(--brand-tint)";
  preview.style.color = "var(--brand-fg)";
  preview.style.font = "600 12px var(--font-sans)";
  preview.style.opacity = "0.82";
  preview.style.whiteSpace = "nowrap";
  preview.style.overflow = "hidden";
  preview.style.textOverflow = "ellipsis";
  preview.style.boxShadow = "0 8px 24px rgba(15,23,42,0.16)";
  document.body.appendChild(preview);
  e.dataTransfer.setDragImage(preview, 16, 16);
  window.setTimeout(() => preview.remove(), 0);
}

export default function CalendarView({ ordenes, reprogramadaIds, selectedId, myId, usuarios, onOpenOT, onPatchOrden }: Props) {
  const [mode, setMode]       = useState<CalendarMode>("mes");
  const [anchor, setAnchor]   = useState<Date>(() => new Date());
  const [dragId, setDragId]   = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragNavTarget, setDragNavTarget] = useState<"prev" | "next" | null>(null);
  const [dayModalKey, setDayModalKey] = useState<string | null>(null);
  const [reprogramOpen, setReprogramOpen] = useState(false);

  // Hover popover state. We use a portal anchored to viewport coordinates so
  // the popover can escape the day cell (which is overflow:hidden) without
  // being clipped.
  const [hoverOrden, setHoverOrden] = useState<OrdenListItem | null>(null);
  const [hoverPos, setHoverPos]     = useState<{ left: number; top: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const dragNavTimer = useRef<number | null>(null);

  // Index OTs by their scheduled date for O(1) cell lookup. fecha_inicio wins
  // when present; fecha_termino keeps due-date-only OTs visible in the calendar.
  const otsByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const o of ordenes) {
      const d = getCalendarDate(o);
      if (!d) continue;
      const key = toDateOnly(d);
      const arr = map.get(key) ?? [];
      arr.push({ key: o.id, orden: o, dateKey: key, isPreview: false });
      map.set(key, arr);
    }
    const PRIO_ORDER: Record<string, number> = { urgente: 4, alta: 3, media: 2, baja: 1, ninguna: 0 };
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const dp = (PRIO_ORDER[b.orden.prioridad] ?? 0) - (PRIO_ORDER[a.orden.prioridad] ?? 0);
        if (dp !== 0) return dp;
        if (a.isPreview !== b.isPreview) return a.isPreview ? 1 : -1;
        return new Date(b.orden.created_at).getTime() - new Date(a.orden.created_at).getTime();
      });
    }
    return map;
  }, [ordenes]);

  const orphanCount = useMemo(() => ordenes.filter(o => !o.fecha_inicio && !o.fecha_termino).length, [ordenes]);
  const reprogramadas = useMemo(
    () => ordenes
      .filter(o => reprogramadaIds.has(o.id) && o.estado !== "completado")
      .sort((a, b) => (a.fecha_inicio ?? a.fecha_termino ?? "").localeCompare(b.fecha_inicio ?? b.fecha_termino ?? "")),
    [ordenes, reprogramadaIds],
  );

  // Build the grid for the current viewport.
  const days = useMemo(() => {
    if (mode === "semana") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const monthStart = startOfMonth(anchor);
    const monthEnd   = endOfMonth(anchor);
    const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) { out.push(d); d = addDays(d, 1); }
    return out;
  }, [anchor, mode]);

  const calendarEntriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const [key, entries] of otsByDate.entries()) map.set(key, [...entries]);
    if (days.length === 0) return map;

    const rangeStart = days[0];
    const rangeEnd = days[days.length - 1];
    const realKeys = new Set<string>();
    for (const entries of otsByDate.values()) {
      for (const entry of entries) {
        realKeys.add(`${entry.orden.recurrencia_origen_id ?? entry.orden.id}:${entry.dateKey}`);
      }
    }

    for (const orden of ordenes) {
      if (!orden.recurrencia || orden.recurrencia === "ninguna") continue;
      if (orden.parent_id) continue;

      const seriesId = orden.recurrencia_origen_id ?? orden.id;
      for (const occurrence of buildRecurrencePreviewDates(orden, rangeStart, rangeEnd)) {
        const key = toDateOnly(occurrence);
        if (realKeys.has(`${seriesId}:${key}`)) continue;
        const arr = map.get(key) ?? [];
        arr.push({
          key: `${orden.id}:preview:${key}`,
          orden,
          dateKey: key,
          isPreview: true,
        });
        map.set(key, arr);
      }
    }

    const PRIO_ORDER: Record<string, number> = { urgente: 4, alta: 3, media: 2, baja: 1, ninguna: 0 };
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.isPreview !== b.isPreview) return a.isPreview ? 1 : -1;
        const dp = (PRIO_ORDER[b.orden.prioridad] ?? 0) - (PRIO_ORDER[a.orden.prioridad] ?? 0);
        if (dp !== 0) return dp;
        return new Date(b.orden.created_at).getTime() - new Date(a.orden.created_at).getTime();
      });
    }

    return map;
  }, [days, ordenes, otsByDate]);

  async function handleDrop(targetKey: string) {
    if (!dragId) return;
    const orden = ordenes.find(o => o.id === dragId);
    setDragId(null);
    setDropTarget(null);
    setDayModalKey(null);
    clearDragNavigation();
    if (!orden) return;
    const currentDate = getCalendarDate(orden);
    const currentKey = currentDate ? toDateOnly(currentDate) : null;
    if (currentKey === targetKey) return;

    const prev = { fecha_inicio: orden.fecha_inicio, fecha_termino: orden.fecha_termino };
    onPatchOrden(orden.id, { fecha_inicio: targetKey, fecha_termino: targetKey });
    try {
      await updateOrden(orden.id, myId, { fecha_inicio: targetKey, fecha_termino: targetKey });
    } catch {
      onPatchOrden(orden.id, prev);
      alert("No se pudo reprogramar la orden. Verifica tu conexión e intenta de nuevo.");
    }
  }

  function moveAnchor(direction: -1 | 1) {
    setAnchor(prev => mode === "mes" ? addMonths(prev, direction) : addWeeks(prev, direction));
  }

  function scheduleDragNavigation(direction: -1 | 1) {
    if (!dragId || dragNavTimer.current) return;
    setDragNavTarget(direction === -1 ? "prev" : "next");
    dragNavTimer.current = window.setTimeout(() => {
      dragNavTimer.current = null;
      moveAnchor(direction);
    }, 450);
  }

  function clearDragNavigation() {
    if (dragNavTimer.current) {
      window.clearTimeout(dragNavTimer.current);
      dragNavTimer.current = null;
    }
    setDragNavTarget(null);
  }

  function startDraggingOrden(id: string) {
    setDragId(id);
    setHoverOrden(null);
    setHoverPos(null);
  }

  function endDraggingOrden() {
    setDragId(null);
    setDropTarget(null);
    clearDragNavigation();
  }

  // Hover handlers. Small delay so brushing past doesn't open every card.
  function showHover(e: React.MouseEvent, o: OrdenListItem) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHoverOrden(o);
      // Anchor popover BELOW the card. If it would overflow the viewport
      // bottom, flip above; if it would overflow the right edge, nudge left.
      const W = 320;
      const H = 340; // approximate popover height
      let left = rect.left;
      if (left + W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - W - 8);
      let top  = rect.bottom + 6;
      if (top + H > window.innerHeight - 8) top = Math.max(8, rect.top - H - 6);
      setHoverPos({ left, top });
    }, 220);
  }
  function hideHover() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHoverOrden(null);
      setHoverPos(null);
    }, 120);
  }
  function cancelHide() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
  }

  const headerLabel = mode === "mes"
    ? format(anchor, "MMMM yyyy", { locale: es })
    : `${format(anchor, "MMMM yyyy", { locale: es })} | Semana ${getWeek(anchor, { weekStartsOn: 1, firstWeekContainsDate: 4 })}`;

  const dow = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const monthInlineLimit = 2;
  const monthOverflowPreviewLimit = 1;
  const dayModalDate = dayModalKey ? parseOTDate(dayModalKey) : null;
  const dayModalItems = dayModalKey ? (calendarEntriesByDate.get(dayModalKey) ?? []) : [];

  return (
    <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--surface-1)", overflow: "hidden" }}>
      {/* Toolbar — Mes/Semana left, label center, prev/next around label */}
      <div style={{
        display:"flex", alignItems:"center", padding:"12px 16px",
        flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, position:"relative" }}>
          {/* Mode toggle */}
          <div style={{ display:"flex", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", height:30 }}>
            {(["mes","semana"] as CalendarMode[]).map((m, i) => {
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    padding:"0 16px", height:"100%",
                    background: isActive ? "var(--brand)" : "var(--surface-1)",
                    color: isActive ? "white" : "var(--fg-2)",
                    border:"none", borderRight: i === 0 ? "1px solid var(--border)" : "none",
                    fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
                    textTransform:"capitalize",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {reprogramadas.length > 0 && (
            <div style={{ position:"relative" }}>
              <button
                type="button"
                onClick={() => setReprogramOpen(v => !v)}
                style={{
                  height:30, padding:"0 10px", display:"flex", alignItems:"center", gap:6,
                  border:"1px solid var(--danger)", borderRadius:8,
                  background:"var(--danger-bg)", color:"var(--danger)",
                  fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
                  whiteSpace:"nowrap",
                }}
                title={`${reprogramadas.length} OT${reprogramadas.length > 1 ? "s" : ""} reprogramada${reprogramadas.length > 1 ? "s" : ""}`}
              >
                <CalendarClock size={14} />
                Reprogramadas
                <span style={{ fontWeight:800 }}>{reprogramadas.length}</span>
              </button>

              {reprogramOpen && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:60,
                  width:360, maxWidth:"calc(100vw - 32px)",
                  background:"var(--surface-1)", border:"1px solid var(--border)",
                  borderRadius:10, boxShadow:"0 16px 36px rgba(15,23,42,0.16)",
                  overflow:"hidden",
                }}>
                  <div style={{ padding:"10px 12px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                    <span style={{ fontSize:12, fontWeight:750, color:"var(--fg-1)" }}>OTs reprogramadas</span>
                    <span style={{ fontSize:11, fontWeight:700, color:"var(--danger)" }}>{reprogramadas.length}</span>
                  </div>
                  <div style={{ maxHeight:300, overflowY:"auto", padding:6 }}>
                    {reprogramadas.map((orden) => {
                      const date = parseOTDate(orden.fecha_inicio ?? orden.fecha_termino ?? null);
                      return (
                        <button
                          key={orden.id}
                          type="button"
                          onClick={() => {
                            setReprogramOpen(false);
                            onOpenOT(orden.id);
                          }}
                          style={{
                            width:"100%", display:"flex", alignItems:"center", gap:10,
                            padding:"9px 10px", border:"none", borderRadius:8,
                            background:"transparent", cursor:"pointer", textAlign:"left",
                            fontFamily:"inherit",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <Clock size={15} style={{ color:"var(--danger)", flexShrink:0 }} />
                          <span style={{ minWidth:0, flex:1 }}>
                            <span style={{ display:"block", fontSize:12, fontWeight:650, color:"var(--fg-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {orden.numero ? `#${orden.numero} · ` : ""}{orden.titulo || "Sin titulo"}
                            </span>
                            <span style={{ display:"block", marginTop:2, fontSize:11, fontWeight:550, color:"var(--fg-3)" }}>
                              {date ? `Coordinada para ${format(date, "dd MMM yyyy", { locale: es })}` : "Sin fecha coordinada"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Centered prev / label / next */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:14 }}>
          <button
            type="button"
            onClick={() => moveAnchor(-1)}
            onDragOver={(e) => { e.preventDefault(); scheduleDragNavigation(-1); }}
            onDragLeave={clearDragNavigation}
            onDrop={(e) => { e.preventDefault(); clearDragNavigation(); }}
            style={{
              width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center",
              border:"none", borderRadius:999,
              background: dragNavTarget === "prev" ? "var(--brand-tint)" : "transparent",
              cursor:"pointer", color:"var(--brand)",
              outline: dragNavTarget === "prev" ? "2px solid var(--brand)" : "none",
              outlineOffset:2,
            }}
            aria-label="Anterior"
            title={dragId ? "Mantén aquí para ir al periodo anterior" : "Anterior"}
          >
            <ChevronLeft size={20} />
          </button>
          <div style={{ fontSize:18, fontWeight:700, color:"var(--fg-1)", textTransform:"capitalize", minWidth:200, textAlign:"center" }}>
            {headerLabel}
          </div>
          <button
            type="button"
            onClick={() => moveAnchor(1)}
            onDragOver={(e) => { e.preventDefault(); scheduleDragNavigation(1); }}
            onDragLeave={clearDragNavigation}
            onDrop={(e) => { e.preventDefault(); clearDragNavigation(); }}
            style={{
              width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center",
              border:"none", borderRadius:999,
              background: dragNavTarget === "next" ? "var(--brand-tint)" : "transparent",
              cursor:"pointer", color:"var(--brand)",
              outline: dragNavTarget === "next" ? "2px solid var(--brand)" : "none",
              outlineOffset:2,
            }}
            aria-label="Siguiente"
            title={dragId ? "Mantén aquí para ir al periodo siguiente" : "Siguiente"}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Spacer to balance the left toggle so the label stays centered */}
        <div style={{ width: reprogramadas.length > 0 ? 268 : 128 }} />
      </div>

      {orphanCount > 0 && (
        <div style={{
          padding:"6px 16px", fontSize:12, color:"var(--fg-3)",
          background:"var(--surface-hover)", borderBottom:"1px solid var(--border)", flexShrink:0,
        }}>
          {orphanCount} orden{orphanCount > 1 ? "es" : ""} sin fecha — no aparece{orphanCount > 1 ? "n" : ""} en el calendario.
        </div>
      )}

      {/* Grid */}
      <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden", border:"1px solid var(--border)", borderRadius:10, margin:"0 16px 16px" }}>
        {/* DoW header — capitalized full words like the reference */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7, minmax(0, 1fr))", flexShrink:0, borderBottom:"1px solid var(--border)" }}>
          {dow.map(d => (
            <div key={d} style={{ padding:"10px 12px", fontSize:11, fontWeight:700, color:"var(--fg-3)", textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"left" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridAutoRows: "minmax(0, 1fr)",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}>
          {days.map((day, idx) => {
            const key      = toDateOnly(day);
            const inMonth  = mode === "semana" || isSameMonth(day, anchor);
            const isToday  = isSameDay(day, new Date());
            const items    = calendarEntriesByDate.get(key) ?? [];
            const isDropTarget = dropTarget === key;
            const col      = idx % 7;
            const row      = Math.floor(idx / 7);
            const isLastCol = col === 6;
            const totalRows = Math.ceil(days.length / 7);
            const isLastRow = row === totalRows - 1;
            const visibleMonthCount = items.length > monthInlineLimit ? monthOverflowPreviewLimit : monthInlineLimit;
            const visibleItems = mode === "mes" ? items.slice(0, visibleMonthCount) : items;
            const hiddenCount = mode === "mes" ? Math.max(items.length - visibleMonthCount, 0) : 0;
            return (
              <div
                key={key}
                onDragOver={(e) => { e.preventDefault(); setDropTarget(key); }}
                onDragLeave={() => { if (dropTarget === key) setDropTarget(null); }}
                onDrop={() => handleDrop(key)}
                style={{
                  borderRight: !isLastCol ? "1px solid var(--border)" : "none",
                  borderBottom: !isLastRow ? "1px solid var(--border)" : "none",
                  background: isDropTarget ? "var(--brand-tint)" : isWeekend(day) ? "var(--surface-0)" : "var(--surface-1)",
                  opacity: inMonth ? 1 : 0.55,
                  padding:"6px 6px",
                  display:"flex", flexDirection:"column", minHeight: 0, minWidth: 0,
                  transition: "background 0.1s",
                  overflow: "hidden",
                }}
              >
                <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:6, marginBottom:5, minHeight:20 }}>
                  <span style={{
                    fontSize:12, fontWeight: isToday ? 700 : 600,
                    color: isToday ? "white" : inMonth ? "var(--fg-2)" : "var(--fg-4)",
                    background: isToday ? "var(--brand)" : "transparent",
                    padding: isToday ? "1px 7px" : 0,
                    borderRadius: 999,
                    minWidth: isToday ? 22 : 0,
                    textAlign:"center",
                  }}>
                    {format(day, "dd")}
                  </span>
                </div>
                <div style={{
                  display:"flex", flexDirection:"column", gap:3,
                  overflowX:"hidden", overflowY: mode === "semana" ? "auto" : "hidden",
                  flex:1, minWidth:0, paddingRight: mode === "semana" && items.length > 8 ? 2 : 0,
                }}>
                  {visibleItems.map(entry => (
                    <EventCard
                      key={entry.key}
                      orden={entry.orden}
                      isReprogramada={reprogramadaIds.has(entry.orden.id)}
                      isSelected={selectedId === entry.orden.id}
                      isDragging={dragId === entry.orden.id}
                      isPreview={entry.isPreview}
                      onDragStart={() => startDraggingOrden(entry.orden.id)}
                      onDragEnd={endDraggingOrden}
                      onClick={() => onOpenOT(entry.orden.id)}
                      onMouseEnter={(e) => showHover(e, entry.orden)}
                      onMouseLeave={hideHover}
                      compact={mode === "mes"}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setDayModalKey(key)}
                      style={{
                        minHeight:20, width:"100%",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:11, color:"var(--brand-fg)", fontWeight:700,
                        background:"transparent", border:"none", borderRadius:6,
                        textAlign:"center", padding:"0 6px", cursor:"pointer", fontFamily:"inherit",
                        flexShrink:0,
                      }}
                    >
                      {hiddenCount} más
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover popover, portaled to body so it can overflow the calendar grid */}
      {hoverOrden && hoverPos && typeof document !== "undefined" && createPortal(
        <HoverPopover
          orden={hoverOrden}
          left={hoverPos.left}
          top={hoverPos.top}
          usuarios={usuarios}
          onMouseEnter={cancelHide}
          onMouseLeave={hideHover}
          onClick={() => { onOpenOT(hoverOrden.id); setHoverOrden(null); setHoverPos(null); }}
        />,
        document.body,
      )}

      {dayModalDate && typeof document !== "undefined" && createPortal(
        <DayOrdersModal
          date={dayModalDate}
          ordenes={dayModalItems}
          usuarios={usuarios}
          selectedId={selectedId}
          draggingId={dragId}
          reprogramadaIds={reprogramadaIds}
          onClose={() => setDayModalKey(null)}
          onOpenOT={(id) => { setDayModalKey(null); onOpenOT(id); }}
          onDragStart={startDraggingOrden}
          onDragEnd={endDraggingOrden}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Event card ───────────────────────────────────────────────────────────────

interface EventCardProps {
  orden:           OrdenListItem;
  isReprogramada:  boolean;
  isSelected:      boolean;
  isDragging:      boolean;
  isPreview?:      boolean;
  onDragStart:     () => void;
  onDragEnd:       () => void;
  onClick:         () => void;
  onMouseEnter:    (e: React.MouseEvent) => void;
  onMouseLeave:    () => void;
  compact?:        boolean;
}

function EventCard({ orden, isReprogramada, isSelected, isDragging, isPreview = false, onDragStart, onDragEnd, onClick, onMouseEnter, onMouseLeave, compact = false }: EventCardProps) {
  const title = orden.titulo || "Sin título";
  const isRecurrent = orden.recurrencia && orden.recurrencia !== "ninguna";
  // Pick the leading icon following the reference (lock for pending, refresh
  // for recurrent, check for completed). Reprogramadas keep the clock cue.
  const LeadingIcon = isReprogramada
    ? Clock
    : orden.estado === "completado"
      ? null
      : isRecurrent
        ? RotateCw
        : Lock;
  const iconColor = isReprogramada
    ? "var(--danger)"
    : orden.estado === "completado"
      ? "var(--success)"
      : "var(--brand)";

  return (
    <div
      draggable={!isPreview}
      onDragStart={(e) => {
        if (isPreview) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", orden.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
      style={{
        display:"flex", alignItems:"center", gap:5,
        minHeight: compact ? 22 : 26,
        padding: compact ? "3px 6px" : "4px 8px",
        background: isReprogramada ? "var(--danger-bg)" : isPreview ? "var(--surface-hover)" : "var(--brand-tint)",
        border: isPreview ? "1px dashed var(--border-strong)" : "none",
        borderRadius:6,
        fontSize: compact ? 11 : 12,
        color: isReprogramada ? "var(--danger)" : isPreview ? "var(--fg-2)" : "var(--brand-fg)",
        cursor: isPreview ? "pointer" : isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.4 : isPreview ? 0.86 : 1,
        outline: isSelected ? "2px solid var(--brand)" : "none",
        overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
        userSelect:"none",
        fontFamily:"inherit",
        minWidth:0,
        flexShrink:0,
      }}
    >
      {isPreview ? (
        <RotateCw size={11} style={{ color:"var(--fg-3)", flexShrink:0 }} />
      ) : LeadingIcon ? (
        <LeadingIcon size={11} style={{ color: iconColor, flexShrink:0 }} />
      ) : null}
      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", fontWeight:500, minWidth:0 }}>
        {title}
      </span>
      {orden.prioridad === "urgente" && (
        <AlertCircle size={11} style={{ color:"var(--pr-urgent)", flexShrink:0 }} />
      )}
    </div>
  );
}

// ── Day orders modal ───────────────────────────────────────────────────────

interface DayOrdersModalProps {
  date:             Date;
  ordenes:          CalendarEntry[];
  usuarios:         Usuario[];
  selectedId:       string | null;
  draggingId:       string | null;
  reprogramadaIds:  Set<string>;
  onClose:          () => void;
  onOpenOT:         (id: string) => void;
  onDragStart:      (id: string) => void;
  onDragEnd:        () => void;
}

function DayOrdersModal({ date, ordenes, usuarios, selectedId, draggingId, reprogramadaIds, onClose, onOpenOT, onDragStart, onDragEnd }: DayOrdersModalProps) {
  const title = format(date, "EEEE, d 'de' MMMM", { locale: es });
  const panelRef = useRef<HTMLDivElement | null>(null);

  function closeWhenDragLeavesPanel(e: React.DragEvent) {
    if (!draggingId || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const outside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (outside) onClose();
  }

  return (
    <div
      onClick={onClose}
      onDragOver={(e) => {
        e.preventDefault();
        closeWhenDragLeavesPanel(e);
      }}
      style={{
        position:"fixed", inset:0, zIndex:260,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:24,
        background: draggingId ? "rgba(15,23,42,0.10)" : "rgba(15,23,42,0.24)",
      }}
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        onDrag={closeWhenDragLeavesPanel}
        style={{
          width:"min(600px, 100%)", maxHeight:"min(640px, calc(100vh - 48px))",
          background:"var(--surface-1)", border:"1px solid var(--border)",
          borderRadius:10, boxShadow:"0 20px 60px rgba(15,23,42,0.22)",
          display:"flex", flexDirection:"column", overflow:"hidden",
          opacity: draggingId ? 0.78 : 1,
        }}
      >
        <div style={{
          height:68, padding:"0 18px", borderBottom:"1px solid var(--border)",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
          flexShrink:0,
        }}>
          <div style={{ fontSize:23, fontWeight:700, color:"var(--fg-1)", textTransform:"lowercase" }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center",
              border:"none", borderRadius:8, background:"transparent",
              color:"var(--fg-2)", cursor:"pointer",
            }}
          >
            <X size={21} />
          </button>
        </div>

        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"18px" }}>
          {ordenes.map((entry) => {
            const orden = entry.orden;
            const creator = orden.solicitante || "Sin solicitante";
            const titleText = orden.titulo || "Sin título";
            const isSelected = selectedId === orden.id;
            const isDragging = draggingId === orden.id;
            const isReprogramada = reprogramadaIds.has(orden.id);

            return (
              <div
                key={entry.key}
                draggable={!entry.isPreview}
                onDragStart={(e) => {
                  if (entry.isPreview) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData("text/plain", orden.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragPreview(e, titleText);
                  onDragStart(orden.id);
                }}
                onDrag={closeWhenDragLeavesPanel}
                onDragEnd={onDragEnd}
                onClick={() => onOpenOT(orden.id)}
                title={titleText}
                style={{
                  display:"flex", alignItems:"center", gap:14,
                  padding:"12px 14px", borderRadius:6,
                  border: isSelected ? "1px solid var(--border-strong)" : entry.isPreview ? "1px dashed var(--border-strong)" : "1px solid transparent",
                  background: isSelected ? "var(--surface-1)" : "transparent",
                  opacity: isDragging ? 0.45 : entry.isPreview ? 0.76 : 1,
                  cursor: entry.isPreview ? "pointer" : isDragging ? "grabbing" : "grab",
                  userSelect:"none",
                }}
              >
                <div style={{
                  width:58, height:58, borderRadius:999,
                  background:"var(--surface-hover)", border:"1px solid var(--border)",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>
                  <Lock size={18} style={{ color:"var(--brand-fg)", opacity:0.55 }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{
                    fontSize:18, fontWeight:700, color:"var(--fg-1)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  }}>
                    {(isReprogramada || entry.isPreview) && <RotateCw size={16} style={{ color: entry.isPreview ? "var(--fg-3)" : "var(--brand)", marginRight:6, verticalAlign:"-2px" }} />}
                    {titleText}
                  </div>
                  <div style={{ marginTop:5, fontSize:15, color:"var(--fg-2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    Solicitado por {creator}
                  </div>
                  <div style={{
                    marginTop:5, display:"flex", alignItems:"center", gap:5,
                    fontSize:15, color: ESTADO_FG[orden.estado] ?? "var(--brand-fg)",
                  }}>
                    <Lock size={12} />
                    {entry.isPreview ? "Programada" : ESTADO_LABEL[orden.estado] ?? orden.estado}
                  </div>
                </div>
                <div style={{ fontSize:14, color:"var(--fg-2)", flexShrink:0 }}>
                  {orden.numero ? `#${orden.numero}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Hover popover ────────────────────────────────────────────────────────────

interface HoverPopoverProps {
  orden:        OrdenListItem;
  left:         number;
  top:          number;
  usuarios:     Usuario[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick:      () => void;
}

function HoverPopover({ orden, left, top, usuarios, onMouseEnter, onMouseLeave, onClick }: HoverPopoverProps) {
  const title = orden.titulo || "Sin título";
  const fecha = orden.fecha_termino ? format(parseISO(orden.fecha_termino.slice(0, 10) + "T00:00:00"), "dd/MM/yyyy") : "—";
  const asignados = (orden.asignados_ids ?? [])
    .map(id => usuarios.find(u => u.id === id)?.nombre)
    .filter(Boolean) as string[];
  const isRecurrent = orden.recurrencia && orden.recurrencia !== "ninguna";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        position:"fixed", left, top, zIndex: 200,
        width:320,
        background:"var(--surface-1)", border:"1px solid var(--border)",
        borderRadius:10, boxShadow:"0 12px 32px rgba(15,23,42,0.18)",
        cursor:"pointer", fontFamily:"inherit",
        overflow:"hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding:"12px 14px 10px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
          {isRecurrent && <RotateCw size={14} style={{ color:"var(--brand)", flexShrink:0, marginTop:2 }} />}
          <div style={{ fontSize:14, fontWeight:700, color:"var(--fg-1)", lineHeight:1.35, wordBreak:"break-word" }}>
            {title}
          </div>
        </div>
      </div>

      {/* Body — key/value rows. Each row uses a 110px gutter for keys so the
          values align visually like the reference. */}
      <div style={{ padding:"6px 4px" }}>
        <Row label="Estado" value={
          <span style={{
            display:"inline-flex", alignItems:"center", gap:5,
            fontSize:11, fontWeight:600,
            padding:"3px 8px", borderRadius:6,
            background: ESTADO_BG[orden.estado] ?? "var(--surface-hover)",
            color: ESTADO_FG[orden.estado] ?? "var(--fg-2)",
          }}>
            <Lock size={10} />
            {ESTADO_LABEL[orden.estado] ?? orden.estado}
          </span>
        } />
        <Row label="Fecha de vencimiento" value={fecha} />
        <Row label="Tipo de trabajo" value={orden.tipo_trabajo ?? "—"} />
        <Row label="Asignado a" value={
          asignados.length === 0 ? "—" : (
            <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
              <User size={11} style={{ color:"var(--fg-3)" }} />
              {asignados[0]}{asignados.length > 1 ? ` +${asignados.length - 1}` : ""}
            </span>
          )
        } />
        <Row label="Ubicación" value={
          orden.ubicaciones?.edificio
            ? (
              <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <MapPin size={11} style={{ color:"var(--fg-3)" }} />
                {orden.ubicaciones.edificio}
              </span>
            )
            : "—"
        } />
        <Row label="Activo" value={
          orden.activos?.nombre
            ? (
              <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <Wrench size={11} style={{ color:"var(--fg-3)" }} />
                {orden.activos.nombre}
              </span>
            )
            : "—"
        } />
        <Row label="Prioridad" value={PRIO_LABEL[orden.prioridad] ?? "—"} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"7px 12px" }}>
      <span style={{ fontSize:12, color:"var(--fg-3)", flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:12, color:"var(--fg-1)", fontWeight:500, textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>
        {value}
      </span>
    </div>
  );
}
