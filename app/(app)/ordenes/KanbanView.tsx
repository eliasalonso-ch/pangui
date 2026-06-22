"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Lock, RotateCw, AlertCircle, MapPin, CalendarRange, X } from "lucide-react";
import { updateOrdenEstado } from "@/lib/ordenes-api";
import type { Estado, OrdenListItem, Usuario } from "@/types/ordenes";

// Local-time YYYY-MM-DD (toISOString would shift by UTC offset).
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function todayYmd(): string { return toYmd(new Date()); }

function formatShortYmd(value: string | null | undefined): string {
  if (!value) return "Sin venc.";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "Sin venc.";
  return `${d}-${m}-${y}`;
}

interface Props {
  ordenes:         OrdenListItem[];
  reprogramadaIds: Set<string>;
  selectedId:      string | null;
  myId:            string;
  usuarios:        Usuario[];
  onOpenOT:        (id: string) => void;
  // Optimistic local update. Parent patches the ordenes array so the card
  // visually moves columns before the Supabase round-trip resolves.
  onPatchOrden:    (id: string, patch: Partial<OrdenListItem>) => void;
}

interface ColumnDef {
  estado: Estado;
  label:  string;
  bg:     string;
  fg:     string;
}

const COLUMNS: ColumnDef[] = [
  { estado: "pendiente",  label: "Asignadas",  bg: "var(--st-open-bg)",     fg: "var(--st-open-fg)" },
  { estado: "en_curso",   label: "En curso",   bg: "var(--st-progress-bg)", fg: "var(--st-progress-fg)" },
  { estado: "en_espera",  label: "En espera",  bg: "var(--st-wait-bg)",     fg: "var(--st-wait-fg)" },
  { estado: "completado", label: "Completas",  bg: "var(--st-done-bg)",     fg: "var(--st-done-fg)" },
];

const PRIO_ORDER: Record<string, number> = { urgente: 4, alta: 3, media: 2, baja: 1, ninguna: 0 };

// Render only a window of cards per column so a column with hundreds of OTs
// (e.g. Completadas) doesn't mount every card as a DOM node at once. More are
// revealed as the user scrolls that column near the bottom.
const KANBAN_PAGE = 30;
// Reveal the next chunk when scrolled within this many px of the bottom.
const SCROLL_REVEAL_THRESHOLD = 240;

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

export default function KanbanView({ ordenes, reprogramadaIds, selectedId, myId, onOpenOT, onPatchOrden }: Props) {
  const [dragId, setDragId]         = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Estado | null>(null);
  const [rangeFrom, setRangeFrom]   = useState<string>("");
  const [rangeTo, setRangeTo]       = useState<string>("");

  // Kanban is a flow/status board, not a calendar. When the date range is
  // active, it narrows the board by due date only so "Hoy" means "vence hoy".
  const rangeFiltered = useMemo(() => {
    if (!rangeFrom && !rangeTo) return ordenes;
    return ordenes.filter(o => {
      const due = o.fecha_termino?.slice(0, 10) ?? null;
      if (!due) return false;
      if (rangeFrom && due < rangeFrom) return false;
      if (rangeTo && due > rangeTo) return false;
      return true;
    });
  }, [ordenes, rangeFrom, rangeTo]);

  // Bucket OTs by estado and sort within each column for execution: due date,
  // then priority, then newest created.
  const byEstado = useMemo(() => {
    const map = new Map<Estado, OrdenListItem[]>();
    for (const col of COLUMNS) map.set(col.estado, []);
    for (const o of rangeFiltered) {
      const arr = map.get(o.estado as Estado);
      if (arr) arr.push(o);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ad = a.fecha_termino?.slice(0, 10) ?? "9999-12-31";
        const bd = b.fecha_termino?.slice(0, 10) ?? "9999-12-31";
        if (ad !== bd) return ad.localeCompare(bd);
        const dp = (PRIO_ORDER[b.prioridad] ?? 0) - (PRIO_ORDER[a.prioridad] ?? 0);
        if (dp !== 0) return dp;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return map;
  }, [rangeFiltered]);

  function applyPreset(preset: "hoy" | "semana" | "mes") {
    const t = todayYmd();
    if (preset === "hoy") { setRangeFrom(t); setRangeTo(t); return; }
    const now = new Date();
    if (preset === "semana") {
      // Monday → Sunday of the current week (locale-independent ISO week).
      const dow = (now.getDay() + 6) % 7; // 0 = Monday
      const start = new Date(now); start.setDate(now.getDate() - dow);
      const end   = new Date(start); end.setDate(start.getDate() + 6);
      setRangeFrom(toYmd(start));
      setRangeTo(toYmd(end));
      return;
    }
    if (preset === "mes") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setRangeFrom(toYmd(start));
      setRangeTo(toYmd(end));
    }
  }
  function clearRange() { setRangeFrom(""); setRangeTo(""); }

  async function handleDrop(targetEstado: Estado) {
    if (!dragId) return;
    const orden = ordenes.find(o => o.id === dragId);
    setDragId(null);
    setDropTarget(null);
    if (!orden) return;
    if (orden.estado === targetEstado) return;

    // Completing requires the full set of checks in OTDetail (fotos, hoja,
    // materiales). Rather than duplicate that logic here, open the detail
    // panel so the user hits the existing "Completar" button.
    if (targetEstado === "completado") {
      onOpenOT(orden.id);
      return;
    }

    const prevEstado = orden.estado;
    onPatchOrden(orden.id, { estado: targetEstado });
    try {
      await updateOrdenEstado(orden.id, targetEstado, myId);
    } catch {
      onPatchOrden(orden.id, { estado: prevEstado });
      alert("No se pudo cambiar el estado de la orden. Verifica tu conexión e intenta de nuevo.");
    }
  }

  const rangeActive = !!(rangeFrom || rangeTo);
  const totalShown  = rangeFiltered.length;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-0)" }}>
      {/* Range header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        background: "var(--surface-1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-3)", fontSize: 12, fontWeight: 600 }}>
          <CalendarRange size={14} />
          Vencen entre
        </div>
        <input
          type="date"
          value={rangeFrom}
          max={rangeTo || undefined}
          onChange={e => setRangeFrom(e.target.value)}
          style={{
            height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 6,
            background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 12, fontFamily: "inherit",
          }}
        />
        <span style={{ color: "var(--fg-4)", fontSize: 12 }}>→</span>
        <input
          type="date"
          value={rangeTo}
          min={rangeFrom || undefined}
          onChange={e => setRangeTo(e.target.value)}
          style={{
            height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 6,
            background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 12, fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {([
            { key: "hoy",    label: "Hoy" },
            { key: "semana", label: "Esta semana" },
            { key: "mes",    label: "Este mes" },
          ] as const).map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              style={{
                height: 30, padding: "0 10px", borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--surface-1)",
                fontSize: 11, fontWeight: 600, color: "var(--fg-2)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {rangeActive && (
          <button
            type="button"
            onClick={clearRange}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              height: 30, padding: "0 10px", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface-1)",
              fontSize: 11, fontWeight: 600, color: "var(--fg-3)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <X size={12} />
            Limpiar
          </button>
        )}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-4)" }}>
          {rangeActive ? `${totalShown} OT${totalShown === 1 ? "" : "s"} vencen en rango` : `${totalShown} OT${totalShown === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* Columns */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", gap: 12, padding: 16,
        overflowX: "auto", overflowY: "hidden",
      }}>
      {COLUMNS.map(col => (
        <KanbanColumn
          key={col.estado}
          col={col}
          items={byEstado.get(col.estado) ?? []}
          rangeActive={rangeActive}
          isDropTarget={dropTarget === col.estado && dragId !== null}
          dragId={dragId}
          reprogramadaIds={reprogramadaIds}
          selectedId={selectedId}
          onDragOver={() => { if (dropTarget !== col.estado) setDropTarget(col.estado); }}
          onDragLeaveColumn={() => { if (dropTarget === col.estado) setDropTarget(null); }}
          onDrop={() => handleDrop(col.estado)}
          onCardDragStart={(o, e) => {
            e.dataTransfer.setData("text/plain", o.id);
            e.dataTransfer.effectAllowed = "move";
            setDragPreview(e, o.titulo || "Sin título");
            setDragId(o.id);
          }}
          onCardDragEnd={() => { setDragId(null); setDropTarget(null); }}
          onOpenOT={onOpenOT}
        />
      ))}
      </div>
    </div>
  );
}

// ── Column ──────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col:               ColumnDef;
  items:             OrdenListItem[];
  rangeActive:       boolean;
  isDropTarget:      boolean;
  dragId:            string | null;
  reprogramadaIds:   Set<string>;
  selectedId:        string | null;
  onDragOver:        () => void;
  onDragLeaveColumn: () => void;
  onDrop:            () => void;
  onCardDragStart:   (orden: OrdenListItem, e: React.DragEvent) => void;
  onCardDragEnd:     () => void;
  onOpenOT:          (id: string) => void;
}

function KanbanColumn({
  col, items, rangeActive, isDropTarget, dragId,
  reprogramadaIds, selectedId,
  onDragOver, onDragLeaveColumn, onDrop, onCardDragStart, onCardDragEnd, onOpenOT,
}: KanbanColumnProps) {
  // Only render the first `visibleCount` cards; reveal more on scroll. Reset
  // whenever the bucket shrinks below what's shown (filter change, range
  // change, or a card moving to another column) so we never index past the end.
  const [visibleCount, setVisibleCount] = useState(KANBAN_PAGE);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When the underlying list changes size, clamp back to one page and scroll
    // to top so the user isn't stranded in a now-empty tail.
    setVisibleCount(KANBAN_PAGE);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [items.length]);

  const revealMore = () => {
    setVisibleCount(c => (c >= items.length ? c : c + KANBAN_PAGE));
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (visibleCount >= items.length) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_REVEAL_THRESHOLD) {
      revealMore();
    }
  };

  const shown   = items.slice(0, visibleCount);
  const remaining = items.length - shown.length;

  return (
    <div
      onDragOver={(e) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the column container, not its children.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        onDragLeaveColumn();
      }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      style={{
        flex: "0 0 300px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--surface-1)",
        border: `1px solid ${isDropTarget ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 10,
        boxShadow: isDropTarget ? "0 0 0 2px var(--brand-tint)" : "none",
        transition: "box-shadow 120ms, border-color 120ms",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: col.fg,
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>
            {col.label}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: col.fg, background: col.bg,
          padding: "2px 8px", borderRadius: 999,
        }}>
          {items.length}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: 10, display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        {items.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 12px", textAlign: "center",
            fontSize: 12, color: "var(--fg-4)",
            border: "1px dashed var(--border)", borderRadius: 8,
          }}>
            {rangeActive ? "Sin OTs con vencimiento en este rango" : "Sin OTs en esta columna"}
          </div>
        ) : (
          <>
            {shown.map(o => (
              <KanbanCard
                key={o.id}
                orden={o}
                isReprogramada={reprogramadaIds.has(o.id)}
                isSelected={selectedId === o.id}
                isDragging={dragId === o.id}
                onDragStart={(e) => onCardDragStart(o, e)}
                onDragEnd={onCardDragEnd}
                onClick={() => onOpenOT(o.id)}
              />
            ))}
            {remaining > 0 && (
              <button
                type="button"
                onClick={revealMore}
                style={{
                  flexShrink: 0,
                  marginTop: 2, padding: "8px 10px", borderRadius: 8,
                  border: "1px dashed var(--border)", background: "transparent",
                  color: "var(--fg-3)", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Mostrar {Math.min(KANBAN_PAGE, remaining)} más ({remaining} restantes)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  orden:           OrdenListItem;
  isReprogramada:  boolean;
  isSelected:      boolean;
  isDragging:      boolean;
  onDragStart:     (e: React.DragEvent) => void;
  onDragEnd:       () => void;
  onClick:         () => void;
}

function KanbanCard({ orden, isReprogramada, isSelected, isDragging, onDragStart, onDragEnd, onClick }: KanbanCardProps) {
  const title       = orden.titulo || "Sin título";
  const isRecurrent = orden.recurrencia && orden.recurrencia !== "ninguna";
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
  const ubicacion = orden.ubicaciones?.edificio
    ? orden.ubicaciones.edificio + (orden.ubicaciones.detalle ? ` · ${orden.ubicaciones.detalle}` : "")
    : null;
  const dueYmd = orden.fecha_termino?.slice(0, 10) ?? null;
  const overdue = !!dueYmd && dueYmd < todayYmd() && orden.estado !== "completado";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        background: "var(--surface-2)",
        border: `1px solid ${isSelected ? "var(--brand)" : "var(--border)"}`,
        outline: isSelected ? "1px solid var(--brand)" : "none",
        borderRadius: 8,
        padding: 10,
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.4 : 1,
        userSelect: "none",
        // The column body is a flex container; without this, cards shrink to
        // fit when the column overflows (crushing their content and
        // overlapping text) instead of letting the column scroll.
        flexShrink: 0,
        display: "flex", flexDirection: "column", gap: 6,
        boxShadow: isSelected ? "0 0 0 1px var(--brand)" : "0 1px 2px rgba(15,23,42,0.04)",
        transition: "box-shadow 100ms, border-color 100ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        {LeadingIcon && <LeadingIcon size={12} style={{ color: iconColor, flexShrink: 0, marginTop: 2 }} />}
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--fg-1)",
          lineHeight: 1.35,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
        }}>
          {title}
        </span>
        {orden.prioridad === "urgente" && (
          <AlertCircle size={12} style={{ color: "var(--pr-urgent)", flexShrink: 0, marginTop: 2 }} />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: "var(--fg-3)" }}>
        {orden.numero != null && (
          <span style={{ fontWeight: 600, color: "var(--fg-4)" }}>#{orden.numero}</span>
        )}
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          color: overdue ? "var(--danger)" : "var(--fg-3)",
          fontWeight: overdue ? 600 : 500,
        }}>
          <CalendarRange size={10} style={{ flexShrink: 0 }} />
          {formatShortYmd(dueYmd)}
        </span>
        {ubicacion && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, minWidth: 0 }}>
            <MapPin size={10} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ubicacion}</span>
          </span>
        )}
      </div>
    </div>
  );
}
