"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, RotateCw, Lock, MapPin, Wrench, Clock, User, AlertCircle } from "lucide-react";
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

export default function CalendarView({ ordenes, reprogramadaIds, selectedId, myId, usuarios, onOpenOT, onPatchOrden }: Props) {
  const [mode, setMode]       = useState<CalendarMode>("mes");
  const [anchor, setAnchor]   = useState<Date>(() => new Date());
  const [dragId, setDragId]   = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Hover popover state. We use a portal anchored to viewport coordinates so
  // the popover can escape the day cell (which is overflow:hidden) without
  // being clipped.
  const [hoverOrden, setHoverOrden] = useState<OrdenListItem | null>(null);
  const [hoverPos, setHoverPos]     = useState<{ left: number; top: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Index OTs by their fecha_inicio for O(1) cell lookup. We sort by priority
  // then created_at so the most important rows appear at the top of each cell.
  const otsByDate = useMemo(() => {
    const map = new Map<string, OrdenListItem[]>();
    for (const o of ordenes) {
      const d = parseOTDate(o.fecha_inicio ?? null);
      if (!d) continue;
      const key = toDateOnly(d);
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    const PRIO_ORDER: Record<string, number> = { urgente: 4, alta: 3, media: 2, baja: 1, ninguna: 0 };
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const dp = (PRIO_ORDER[b.prioridad] ?? 0) - (PRIO_ORDER[a.prioridad] ?? 0);
        if (dp !== 0) return dp;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return map;
  }, [ordenes]);

  const orphanCount = useMemo(() => ordenes.filter(o => !o.fecha_inicio).length, [ordenes]);

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

  async function handleDrop(targetKey: string) {
    if (!dragId) return;
    const orden = ordenes.find(o => o.id === dragId);
    setDragId(null);
    setDropTarget(null);
    if (!orden) return;
    const currentKey = orden.fecha_inicio ? orden.fecha_inicio.slice(0, 10) : null;
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

  return (
    <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--surface-1)", overflow: "hidden" }}>
      {/* Toolbar — Mes/Semana left, label center, prev/next around label */}
      <div style={{
        display:"flex", alignItems:"center", padding:"12px 16px",
        flexShrink:0,
      }}>
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

        {/* Centered prev / label / next */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:14 }}>
          <button
            type="button"
            onClick={() => setAnchor(mode === "mes" ? addMonths(anchor, -1) : addWeeks(anchor, -1))}
            style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", border:"none", background:"transparent", cursor:"pointer", color:"var(--brand)" }}
            aria-label="Anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <div style={{ fontSize:18, fontWeight:700, color:"var(--fg-1)", textTransform:"capitalize", minWidth:200, textAlign:"center" }}>
            {headerLabel}
          </div>
          <button
            type="button"
            onClick={() => setAnchor(mode === "mes" ? addMonths(anchor, 1) : addWeeks(anchor, 1))}
            style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", border:"none", background:"transparent", cursor:"pointer", color:"var(--brand)" }}
            aria-label="Siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Spacer to balance the left toggle so the label stays centered */}
        <div style={{ width:128 }} />
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
            const items    = otsByDate.get(key) ?? [];
            const isDropTarget = dropTarget === key;
            const col      = idx % 7;
            const row      = Math.floor(idx / 7);
            const isLastCol = col === 6;
            const totalRows = Math.ceil(days.length / 7);
            const isLastRow = row === totalRows - 1;
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
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
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
                <div style={{ display:"flex", flexDirection:"column", gap:3, overflow:"hidden", flex:1, minWidth:0 }}>
                  {items.slice(0, mode === "mes" ? 4 : 12).map(o => (
                    <EventCard
                      key={o.id}
                      orden={o}
                      isReprogramada={reprogramadaIds.has(o.id)}
                      isSelected={selectedId === o.id}
                      isDragging={dragId === o.id}
                      onDragStart={() => setDragId(o.id)}
                      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                      onClick={() => onOpenOT(o.id)}
                      onMouseEnter={(e) => showHover(e, o)}
                      onMouseLeave={hideHover}
                    />
                  ))}
                  {mode === "mes" && items.length > 4 && (
                    <button
                      type="button"
                      onClick={() => { setMode("semana"); setAnchor(day); }}
                      style={{
                        fontSize:11, color:"var(--brand-fg)", fontWeight:600,
                        background:"transparent", border:"none", textAlign:"left",
                        padding:"2px 4px", cursor:"pointer", fontFamily:"inherit",
                      }}
                    >
                      +{items.length - 4} más
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
    </div>
  );
}

// ── Event card ───────────────────────────────────────────────────────────────

interface EventCardProps {
  orden:           OrdenListItem;
  isReprogramada:  boolean;
  isSelected:      boolean;
  isDragging:      boolean;
  onDragStart:     () => void;
  onDragEnd:       () => void;
  onClick:         () => void;
  onMouseEnter:    (e: React.MouseEvent) => void;
  onMouseLeave:    () => void;
}

function EventCard({ orden, isReprogramada, isSelected, isDragging, onDragStart, onDragEnd, onClick, onMouseEnter, onMouseLeave }: EventCardProps) {
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
      draggable
      onDragStart={(e) => {
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
        padding:"4px 8px",
        background: isReprogramada ? "var(--danger-bg)" : "var(--brand-tint)",
        borderRadius:6,
        fontSize:12,
        color: isReprogramada ? "var(--danger)" : "var(--brand-fg)",
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.4 : 1,
        outline: isSelected ? "2px solid var(--brand)" : "none",
        overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
        userSelect:"none",
        fontFamily:"inherit",
        minWidth:0,
      }}
    >
      {LeadingIcon && (
        <LeadingIcon size={11} style={{ color: iconColor, flexShrink:0 }} />
      )}
      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", fontWeight:500, minWidth:0 }}>
        {title}
      </span>
      {orden.prioridad === "urgente" && (
        <AlertCircle size={11} style={{ color:"var(--pr-urgent)", flexShrink:0 }} />
      )}
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
