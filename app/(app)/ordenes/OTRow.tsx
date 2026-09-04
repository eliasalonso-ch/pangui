"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import {
  Clock, MapPin, Copy, Check as CheckIcon, AlertCircle, UserPlus, X as XIcon,
  CheckCircle2, Circle,
  Minus, Pause, Check, RotateCw, UserRoundX, UserRoundCheck,
  ArrowUp, ArrowDown, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { parseDescMeta, updateOrden } from "@/lib/ordenes-api";
import type { OrdenListItem, OrdenBulkItem, Usuario, Estado, Prioridad } from "@/types/ordenes";
import { chileDateKey, dateKey, daysBetweenKeys } from "./date-utils";
import { iniciales } from "@/lib/avatar";

// Estado y prioridad se muestran como etiquetas sin relleno: borde de 1px,
// texto casi negro en peso normal y el ícono como único portador del color.
const ESTADO: Record<Estado, { label: string; icon: LucideIcon; color: string }> = {
  pendiente:   { label: "Sin asignar", icon: UserRoundX,  color: "var(--st-open-dot)"     },
  en_espera:   { label: "En espera",   icon: Pause,       color: "var(--st-wait-dot)"     },
  en_curso:    { label: "En curso",    icon: RotateCw,    color: "var(--st-progress-dot)" },
  completado:  { label: "Completada",  icon: Check,       color: "var(--st-done-dot)"     },
};

const ESTADO_ASIGNADA = {
  label: "Asignada",
  icon:  UserRoundCheck,
  color: "var(--st-progress-dot)",
};

// La dirección de la flecha comunica la intensidad y el color la refuerza:
// verde → azul → naranja → rojo.
const PRIORIDAD: Record<Prioridad, { label: string; icon: LucideIcon; color: string }> = {
  ninguna: { label: "",        icon: Minus,     color: "transparent"      },
  baja:    { label: "Baja",    icon: ArrowDown, color: "var(--pr-low)"    },
  media:   { label: "Media",   icon: Minus,     color: "var(--pr-medium)" },
  alta:    { label: "Alta",    icon: ArrowUp,   color: "var(--pr-high)"   },
  urgente: { label: "Urgente", icon: AlertTriangle, color: "var(--pr-urgent)" },
};

/** Ícono de la etiqueta: glifo de contorno en el color del estado, sin disco
 *  ni relleno. El color queda en el trazo, que es suficiente para distinguir
 *  el estado sin agregar una mancha de color a cada fila.
 *
 *  `display: block` + `flexShrink: 0` evitan que el SVG se apoye en la línea
 *  base del texto o se comprima cuando falta espacio horizontal. */
function SolidIcon({ icon: Icon, color, size = 14 }: { icon: LucideIcon; color: string; size?: number }) {
  return <Icon size={size} color={color} strokeWidth={2.25} style={{ display: "block", flexShrink: 0 }} />;
}

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  ícono sólido como único portador del color. */
function RowBadge({
  icon: Icon,
  iconColor,
  children,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  children: React.ReactNode;
}) {
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
      {Icon && <SolidIcon icon={Icon} color={iconColor ?? "var(--fg-3)"} />}
      {children}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1)  return "ahora";
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `${d}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function dueLabel(fecha: string, todayKey: string): { text: string; overdue: boolean } | null {
  const dueKey = dateKey(fecha);
  if (!dueKey) return null;
  const diff = daysBetweenKeys(todayKey, dueKey);
  if (diff < 0)   return { text: `Vencio hace ${Math.abs(diff)}d`, overdue: true };
  if (diff === 0) return { text: "Vence hoy", overdue: false };
  if (diff === 1) return { text: "Manana", overdue: false };
  if (diff <= 7)  return { text: `${diff}d`, overdue: false };
  return null;
}

// ── HoverTooltip ──────────────────────────────────────────────────────────────

function HoverTooltip({ label, body, children, triggerStyle }: {
  label: string;
  body: string;
  children: React.ReactNode;
  triggerStyle?: React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  function show() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const W = 300;
    const vw = window.innerWidth;
    let left = r.left;
    if (left + W > vw - 12) left = vw - W - 12;
    if (left < 12) left = 12;
    const flipUp = window.innerHeight - r.bottom < 160;
    setPos({ top: flipUp ? r.top : r.bottom + 6, left, flipUp });
    setVisible(true);
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        style={{ cursor: "default", ...triggerStyle }}
      >
        {children}
      </div>

      {visible && mounted && createPortal(
        <div
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: 300,
            zIndex: 9999,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "12px 14px",
            transform: pos.flipUp ? "translateY(-100%) translateY(-6px)" : "none",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 6px" }}>
            {label}
          </p>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {body}
          </p>
        </div>,
        document.body
      )}
    </>
  );
}

// ── AssignDropdown ────────────────────────────────────────────────────────────

function AssignDropdown({ orden, usuarios, myId, onAssigned, onClose, anchorRect }: {
  orden:       OrdenBulkItem;
  usuarios:    Usuario[];
  myId:        string;
  onAssigned:  (ids: string[]) => void;
  onClose:     () => void;
  anchorRect:  DOMRect;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const currentIds = orden.asignados_ids ?? [];
  // La lista incluye a los dados de baja para poder mostrar su nombre en OTs
  // viejas; aca se filtran porque no pueden recibir trabajo nuevo.
  const asignables = usuarios.filter(u => !u.deleted_at);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const W = 220;
  const vw = window.innerWidth;
  let left = anchorRect.right - W;
  if (left < 8) left = 8;
  if (left + W > vw - 8) left = vw - W - 8;
  const flipUp = window.innerHeight - anchorRect.bottom < 220;
  const top = flipUp ? anchorRect.top : anchorRect.bottom + 6;

  async function toggle(userId: string) {
    const already = currentIds.includes(userId);
    const newIds = already ? currentIds.filter(id => id !== userId) : [...currentIds, userId];
    setSaving(userId);
    try {
      await updateOrden(orden.id, myId, {
        // Array vacio, no null: la validacion del comando exige un array
        // cuando la clave viene presente (400 "asignados_ids must be an
        // array" al desasignar al ultimo usuario).
        asignados_ids: newIds,
      }, currentIds);
      onAssigned(newIds);
    } finally {
      setSaving(null);
    }
  }

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: W,
        zIndex: 9999,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        transform: flipUp ? "translateY(-100%) translateY(-6px)" : "none",
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em" }}>
          Asignar
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}>
          <XIcon size={14} />
        </button>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {asignables.length === 0 && (
          <p style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-4)", margin: 0 }}>Sin usuarios</p>
        )}
        {asignables.map(u => {
          const isAssigned = currentIds.includes(u.id);
          const isSaving = saving === u.id;
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              disabled={isSaving}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: isAssigned ? "var(--brand-tint)" : "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                opacity: isSaving ? 0.6 : 1,
                transition: "background var(--dur-fast) var(--ease)",
              }}
              onMouseEnter={e => { if (!isAssigned) e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { if (!isAssigned) e.currentTarget.style.background = "none"; }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: isAssigned ? "linear-gradient(135deg, var(--brand-active), var(--brand))" : "var(--surface-hover)",
                color: isAssigned ? "var(--fg-on-brand)" : "var(--fg-3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 400,
              }}>
                {iniciales(u.nombre)}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.nombre}
              </span>
              {isAssigned && <CheckIcon size={14} color="var(--brand-fg)" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  orden:        OrdenBulkItem;
  rowNumber?:   number;
  usuarios:     Usuario[];
  isSelected:   boolean;
  onClick:      (id: string) => void;
  onPrefetch?:  (id: string) => void;
  myId?:        string;
  onAssigned?:  (id: string, newIds: string[]) => void;
  // When set (only in the "Reprogramadas" tab), render a pill with the
  // coordinated date so the supervisor sees it without opening the OT.
  coordinadaPara?: string | null;
  // Per-user "marcar como leída/vista" state + toggle.
  isMarcada?:       boolean;
  onToggleMarcada?: (id: string, next: boolean) => void;
  todayKey?:         string;
}

// `rowNumber` sigue en Props porque el contenedor lo pasa, pero ya no se
// muestra: el número correlativo no aportaba y competía con el N° de OT real.
function OTRow({ orden, usuarios, isSelected, onClick, onPrefetch, myId, onAssigned, coordinadaPara, isMarcada, onToggleMarcada, todayKey }: Props) {
  const effectiveTodayKey = todayKey ?? chileDateKey();
  const isPending = Boolean(orden._pending);
  const hasAssignees = (orden.asignados_ids ?? []).length > 0;
  const estado = orden.estado === "pendiente"
    ? (hasAssignees ? ESTADO_ASIGNADA : ESTADO["pendiente"])
    : ESTADO[orden.estado];
  const prio      = PRIORIDAD[orden.prioridad];
  // Parsing the description is non-trivial; memoize so it only re-runs when the
  // description text actually changes, not on every parent re-render.
  const meta      = useMemo(() => parseDescMeta(orden.descripcion ?? null), [orden.descripcion]);
  const titulo    = orden.titulo || meta.descripcion?.slice(0, 80) || "Sin título";
  const [copied, setCopied] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  const assigned = (orden.asignados_ids ?? [])
    .map(id => usuarios.find(u => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  const due = mounted && orden.fecha_termino && !isPending && orden.estado !== "completado" ? dueLabel(orden.fecha_termino, effectiveTodayKey) : null;

  function copyNOT(e: React.MouseEvent) {
    e.stopPropagation();
    if (!meta.nOT) return;
    navigator.clipboard.writeText(meta.nOT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openDrop(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onAssigned || !myId) return;
    if (avatarRef.current) setAnchorRect(avatarRef.current.getBoundingClientRect());
    setDropOpen(v => !v);
  }

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={isPending ? undefined : () => onClick(orden.id)}
      onMouseEnter={e => {
        if (!isPending) onPrefetch?.(orden.id);
        if (!isSelected) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onFocus={() => { if (!isPending) onPrefetch?.(orden.id); }}
      style={{
        padding: "16px 20px",
        // Altura fija: todas las tarjetas miden lo mismo aunque el título, la
        // ubicación o el número de etiquetas cambien. Subió de 124 al crecer
        // los chips (22) y los metadatos (12px): con 124 el contenido se salía.
        height: 148,
        // The list is now a flex column; without this, rows would be squeezed
        // below their fixed height when the list overflows.
        flexShrink: 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        // El `gap` reemplaza a los márgenes sueltos de cada fila: separación
        // uniforme entre cabecera, título, ITO y etiquetas.
        gap: 6,
        // Cards on the canvas, not a continuous white sheet: each row keeps its
        // own border and the list gaps them, so --surface-canvas shows between.
        background: isSelected ? "var(--brand-tint)" : "var(--surface-1)",
        border: `1px solid ${isSelected ? "var(--brand)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        // Selection is shown with a 3px accent, but the border width stays 1px
        // so the card's content never shifts sideways when it is selected.
        boxShadow: isSelected ? "inset 3px 0 0 0 var(--brand)" : "none",
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.55 : isMarcada ? 0.62 : 1,
        transition: "background var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease)",
      }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
    >
      {/* Top: row number + N°OT + due date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {meta.nOT && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 400, color: "var(--brand-fg)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
                {meta.nOT}
              </span>
              <button
                type="button"
                onClick={copyNOT}
                title="Copiar N° OT"
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "var(--success)" : "var(--fg-4)", transition: "color var(--dur-fast) var(--ease)" }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "var(--fg-3)"; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "var(--fg-4)"; }}
              >
                {copied ? <CheckIcon size={14} /> : <Copy size={14} />}
              </button>
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {due && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
              {due.overdue
                ? <AlertCircle size={14} style={{ color: "var(--danger)", flexShrink: 0 }} />
                : <Clock size={14} style={{ color: "var(--warning)", flexShrink: 0 }} />}
              {due.text}
            </span>
          )}
          {onToggleMarcada && !isPending && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggleMarcada(orden.id, !isMarcada); }}
              title={isMarcada ? "Marcada como leída — clic para desmarcar" : "Marcar como leída"}
              aria-pressed={isMarcada}
              style={{
                display: "flex", alignItems: "center", background: "none", border: "none",
                cursor: "pointer", padding: 2,
                color: isMarcada ? "var(--brand-fg)" : "var(--fg-4)",
                transition: "color var(--dur-fast) var(--ease)",
              }}
              onMouseEnter={e => { if (!isMarcada) e.currentTarget.style.color = "var(--fg-2)"; }}
              onMouseLeave={e => { if (!isMarcada) e.currentTarget.style.color = "var(--fg-4)"; }}
            >
              {isMarcada ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            </button>
          )}
        </span>
      </div>

      {/* Title — una sola línea con elipsis. La descripción se quitó a propósito:
          era la fila de alto variable. El detalle completo está a un clic. */}
      <HoverTooltip label="Título" body={titulo} triggerStyle={{ margin: 0 }}>
        <p style={{
          fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
          lineHeight: 1.4, margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {titulo}
        </p>
      </HoverTooltip>

      {/* ITO — altura reservada siempre, con o sin valor, para que las tarjetas
          con y sin ITO midan exactamente lo mismo. */}
      <p style={{
        fontSize: 14, fontWeight: 400, color: "var(--fg-3)", margin: 0,
        height: 20, lineHeight: "20px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {meta.hito && <><span style={{ color: "var(--fg-4)" }}>ITO:</span> {meta.hito}</>}
      </p>

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        {/* `nowrap` + `overflow: hidden`: si las etiquetas se envolvieran a una
            segunda línea la tarjeta crecería y se rompería la altura uniforme. */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", flex: 1, minWidth: 0, overflow: "hidden" }}>

          {/* Status pill */}
          <RowBadge icon={estado.icon} iconColor={estado.color}>
            {estado.label}
          </RowBadge>

          {/* Coordinated date — only shown inside the Reprogramadas tab. */}
          {coordinadaPara && (
            <RowBadge icon={Clock} iconColor="var(--success)">
              Coordinada para {new Date(coordinadaPara + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
            </RowBadge>
          )}

          {/* Priority */}
          {orden.prioridad !== "ninguna" && (
            <RowBadge icon={prio.icon} iconColor={prio.color}>
              {prio.label}
            </RowBadge>
          )}

          {/* Location */}
          {orden.ubicaciones?.edificio && (
            <HoverTooltip label="Ubicación" body={orden.ubicaciones.edificio}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>
                <MapPin size={14} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                  {orden.ubicaciones.edificio}
                </span>
              </span>
            </HoverTooltip>
          )}

        </div>

        {/* Right: time + avatars */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span suppressHydrationWarning style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>{mounted ? timeAgo(orden.created_at) : ""}</span>

          {/* Avatar trigger — always shown as a button when onAssigned is wired */}
          <button
            ref={avatarRef}
            type="button"
            onClick={openDrop}
            title={assigned.length === 0 ? "Asignar usuario" : "Cambiar asignados"}
            style={{
              background: "none", border: "none", cursor: onAssigned ? "pointer" : "default",
              padding: 0, display: "flex", alignItems: "center",
            }}
          >
            {assigned.length === 0 ? (
              <span style={{
                width: 27, height: 27, borderRadius: "50%",
                border: "1.5px dashed var(--border-strong)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--fg-4)",
              }}>
                <UserPlus size={16} />
              </span>
            ) : (
              <span style={{ display: "flex" }}>
                {assigned.slice(0, 3).map((u, i) => (
                  <span
                    key={u.id}
                    title={u.nombre}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                      color: "var(--fg-on-brand)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 400, flexShrink: 0,
                      marginLeft: i > 0 ? -7 : 0,
                    }}
                  >
                    {iniciales(u.nombre)}
                  </span>
                ))}
                {assigned.length > 3 && (
                  <span style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: "var(--surface-hover)", color: "var(--fg-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 400, marginLeft: -7,
                  }}>
                    +{assigned.length - 3}
                  </span>
                )}
              </span>
            )}
          </button>

          {dropOpen && anchorRect && myId && onAssigned && (
            <AssignDropdown
              orden={orden}
              usuarios={usuarios}
              myId={myId}
              onAssigned={newIds => { onAssigned(orden.id, newIds); setDropOpen(false); }}
              onClose={() => setDropOpen(false)}
              anchorRect={anchorRect}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Memoized so a parent re-render (e.g. selecting another row, the 60s list
// poll) only re-renders rows whose props actually changed — not all 70+. This
// is the main lever for INP on the orders list. Requires the parent to pass
// stable onClick/onAssigned callbacks (see OrdenesBandeja).
export default memo(OTRow);
