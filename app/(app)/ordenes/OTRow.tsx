"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import {
  Clock, MapPin, Copy, Check as CheckIcon, AlertCircle, UserPlus, X as XIcon,
  CheckCircle2, Circle,
  Minus, Pause, Check, User as UserIcon,
  ArrowUp, ArrowDown,
  type LucideIcon,
} from "lucide-react";
import { parseDescMeta, updateOrden } from "@/lib/ordenes-api";
import type { OrdenListItem, Usuario, Estado, Prioridad } from "@/types/ordenes";
import { chileDateKey, dateKey, daysBetweenKeys } from "./date-utils";

/** Punto lleno perfectamente simétrico, para estados que no tienen un glifo
 *  direccional natural. */
const FilledDot: LucideIcon = ((props: { size?: number; color?: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <circle cx="12" cy="12" r="6" fill={props.color ?? "currentColor"} />
  </svg>
)) as unknown as LucideIcon;

/** Triángulo de alerta sólido con el signo en blanco. A diferencia del resto
 *  de los estados no va sobre un disco: la forma misma es la señal, que es
 *  justo lo que distingue a "urgente" del resto. Dibujado a medida porque el
 *  `AlertTriangle` de lucide es de trazo, no relleno. */
const AlertTriangleSolid: LucideIcon = ((props: { size?: number; color?: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" style={{ display: "block" }}>
    {/* Triángulo redondeado, ópticamente centrado en el viewBox. */}
    <path
      d="M12 3.2c-.62 0-1.19.33-1.5.86L2.6 18.05a1.73 1.73 0 0 0 1.5 2.6h15.8a1.73 1.73 0 0 0 1.5-2.6L13.5 4.06A1.73 1.73 0 0 0 12 3.2Z"
      fill={props.color ?? "currentColor"}
    />
    {/* Signo de exclamación calado en blanco. */}
    <rect x="10.75" y="8.6" width="2.5" height="6.2" rx="1.25" fill="#FFFFFF" />
    <circle cx="12" cy="17.5" r="1.35" fill="#FFFFFF" />
  </svg>
)) as unknown as LucideIcon;


// Estado y prioridad se muestran como etiquetas sin relleno: borde de 1px,
// texto casi negro en peso normal y el ícono como único portador del color.
const ESTADO: Record<Estado, { label: string; icon: LucideIcon; color: string }> = {
  pendiente:   { label: "Sin asignar", icon: Minus, color: "var(--st-open-dot)"     },
  en_espera:   { label: "En espera",   icon: Pause, color: "var(--st-wait-dot)"     },
  // `Play` no sirve aquí: su triángulo está desplazado a la derecha dentro del
  // viewBox y se ve descentrado en el disco. Un punto lleno es simétrico.
  en_curso:    { label: "En curso",    icon: FilledDot, color: "var(--st-progress-dot)" },
  completado:  { label: "Completada",  icon: Check, color: "var(--st-done-dot)"     },
};

const ESTADO_ASIGNADA = {
  label: "Asignada",
  icon:  UserIcon,
  color: "var(--st-progress-dot)",
};

// La dirección de la flecha comunica la intensidad y el color la refuerza:
// verde → azul → naranja → rojo.
const PRIORIDAD: Record<Prioridad, { label: string; icon: LucideIcon; color: string; bare?: boolean }> = {
  ninguna: { label: "",        icon: Minus,     color: "transparent"      },
  baja:    { label: "Baja",    icon: ArrowDown, color: "var(--success)"   },
  media:   { label: "Media",   icon: Minus,     color: "var(--brand)"     },
  alta:    { label: "Alta",    icon: ArrowUp,   color: "var(--pr-high)"   },
  urgente: { label: "Urgente", icon: AlertTriangleSolid, color: "var(--pr-urgent)", bare: true },
};

/** Ícono sólido: disco de color con el glifo en blanco. Concentra el color en
 *  una marca pequeña y densa, sin teñir el fondo de la etiqueta.
 *
 *  `bare` omite el disco para los íconos que ya traen su propia forma sólida
 *  (el triángulo de urgente): meterlos en un círculo los encogería y perdería
 *  la silueta que los hace reconocibles. */
function SolidIcon({ icon: Icon, color, size = 16, bare }: { icon: LucideIcon; color: string; size?: number; bare?: boolean }) {
  if (bare) {
    return <Icon size={size} color={color} style={{ display: "block", flexShrink: 0 }} />;
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      // `minWidth`/`minHeight` además de width/height: el disco es hijo de un
      // flex y sin el mínimo el algoritmo lo comprime cuando falta espacio.
      width: size, height: size, minWidth: size, minHeight: size,
      borderRadius: "50%",
      background: color, flexShrink: 0,
      // `lineHeight: 0` evita que el SVG se apoye en la línea base del texto.
      lineHeight: 0,
    }}>
      {/* El SVG también es un flex item y también se encoge: sin flexShrink:0
          se deforma bajo presión horizontal y deja de verse centrado. */}
      <Icon size={size - 5} strokeWidth={3} color="#FFFFFF" style={{ display: "block", flexShrink: 0 }} />
    </span>
  );
}

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  ícono sólido como único portador del color. */
function RowBadge({
  icon: Icon,
  iconColor,
  bareIcon,
  children,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  bareIcon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: "var(--fs-xs)", fontWeight: 400,
      padding: "2px 7px",
      border: "1px solid var(--border-strong)",
      borderRadius: "var(--r-sm)",
      color: "var(--fg-1)",
      background: "transparent",
      whiteSpace: "nowrap",
    }}>
      {Icon && <SolidIcon icon={Icon} color={iconColor ?? "var(--fg-3)"} bare={bareIcon} />}
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

function initials(n: string) {
  // Only use letters/numbers for initials. Indexing a string with `[0]`
  // can return half of an emoji surrogate pair (for example a trailing
  // "🏎️💨"), which serializes differently between SSR and the browser and
  // causes a hydration mismatch.
  const words = n.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const glyph = (word: string) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return Array.from(words[0]).filter((character) => /[\p{L}\p{N}]/u.test(character)).slice(0, 2).join("").toLocaleUpperCase("es");
  }
  return `${glyph(words[0])}${glyph(words[words.length - 1])}`.toLocaleUpperCase("es");
}

// â”€â”€ HoverTooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          <p style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>
            {label}
          </p>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--fg-1)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {body}
          </p>
        </div>,
        document.body
      )}
    </>
  );
}

// â”€â”€ AssignDropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AssignDropdown({ orden, usuarios, myId, onAssigned, onClose, anchorRect }: {
  orden:       OrdenListItem;
  usuarios:    Usuario[];
  myId:        string;
  onAssigned:  (ids: string[]) => void;
  onClose:     () => void;
  anchorRect:  DOMRect;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const currentIds = orden.asignados_ids ?? [];
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
        asignados_ids: newIds.length > 0 ? newIds : null,
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
        <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Asignar
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}>
          <XIcon size={12} />
        </button>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {usuarios.length === 0 && (
          <p style={{ padding: "10px 12px", fontSize: "var(--fs-sm)", color: "var(--fg-4)", margin: 0 }}>Sin usuarios</p>
        )}
        {usuarios.map(u => {
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
                fontSize: "var(--fs-2xs)", fontWeight: 700,
              }}>
                {initials(u.nombre)}
              </span>
              <span style={{ flex: 1, fontSize: "var(--fs-sm)", color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.nombre}
              </span>
              {isAssigned && <CheckIcon size={13} color="var(--brand-fg)" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Props {
  orden:        OrdenListItem;
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
  // Per-user "marcar como leÃ­da/vista" state + toggle.
  isMarcada?:       boolean;
  onToggleMarcada?: (id: string, next: boolean) => void;
  todayKey?:         string;
}

// `rowNumber` sigue en Props porque el contenedor lo pasa, pero ya no se
// muestra: el nÃºmero correlativo no aportaba y competÃ­a con el NÂ° de OT real.
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
  const titulo    = orden.titulo || meta.descripcion?.slice(0, 80) || "Sin tÃ­tulo";
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
        // Altura fija: todas las tarjetas miden lo mismo aunque el tÃ­tulo, la
        // ubicaciÃ³n o el nÃºmero de etiquetas cambien.
        height: 124,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        // El `gap` reemplaza a los mÃ¡rgenes sueltos de cada fila: separaciÃ³n
        // uniforme entre cabecera, tÃ­tulo, ITO y etiquetas.
        gap: 6,
        background: isSelected ? "var(--brand-tint)" : "var(--surface-1)",
        borderBottom: "1px solid var(--divider)",
        borderLeft: isSelected ? "3px solid var(--brand)" : "3px solid transparent",
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.55 : isMarcada ? 0.62 : 1,
        transition: "background var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease)",
      }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
    >
      {/* Top: row number + NÂ°OT + due date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {meta.nOT && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--brand-fg)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
                {meta.nOT}
              </span>
              <button
                type="button"
                onClick={copyNOT}
                title="Copiar NÂ° OT"
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "var(--success)" : "var(--fg-4)", transition: "color var(--dur-fast) var(--ease)" }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "var(--fg-3)"; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "var(--fg-4)"; }}
              >
                {copied ? <CheckIcon size={10} /> : <Copy size={10} />}
              </button>
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {due && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--fs-xs)", fontWeight: 400, color: "var(--fg-1)" }}>
              {due.overdue
                ? <AlertCircle size={11} style={{ color: "var(--danger)", flexShrink: 0 }} />
                : <Clock size={10} style={{ color: "var(--warning)", flexShrink: 0 }} />}
              {due.text}
            </span>
          )}
          {onToggleMarcada && !isPending && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggleMarcada(orden.id, !isMarcada); }}
              title={isMarcada ? "Marcada como leÃ­da â€” clic para desmarcar" : "Marcar como leÃ­da"}
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
              {isMarcada ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
          )}
        </span>
      </div>

      {/* Title â€” una sola lÃ­nea con elipsis. La descripciÃ³n se quitÃ³ a propÃ³sito:
          era la fila de alto variable. El detalle completo estÃ¡ a un clic. */}
      <HoverTooltip label="TÃ­tulo" body={titulo} triggerStyle={{ margin: 0 }}>
        <p style={{
          fontSize: "var(--fs-base)", fontWeight: 600, color: "var(--fg-1)",
          lineHeight: 1.4, margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {titulo}
        </p>
      </HoverTooltip>

      {/* ITO â€” altura reservada siempre, con o sin valor, para que las tarjetas
          con y sin ITO midan exactamente lo mismo. */}
      <p style={{
        fontSize: "var(--fs-sm)", color: "var(--fg-3)", margin: 0,
        height: 18, lineHeight: "18px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {meta.hito && <><span style={{ color: "var(--fg-4)" }}>ITO:</span> {meta.hito}</>}
      </p>

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        {/* `nowrap` + `overflow: hidden`: si las etiquetas se envolvieran a una
            segunda lÃ­nea la tarjeta crecerÃ­a y se romperÃ­a la altura uniforme. */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", flex: 1, minWidth: 0, overflow: "hidden" }}>

          {/* Status pill */}
          <RowBadge icon={estado.icon} iconColor={estado.color}>
            {estado.label}
          </RowBadge>

          {/* Coordinated date â€” only shown inside the Reprogramadas tab. */}
          {coordinadaPara && (
            <RowBadge icon={Clock} iconColor="var(--success)">
              Coordinada para {new Date(coordinadaPara + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
            </RowBadge>
          )}

          {/* Priority */}
          {orden.prioridad !== "ninguna" && (
            <RowBadge icon={prio.icon} iconColor={prio.color} bareIcon={prio.bare}>
              {prio.label}
            </RowBadge>
          )}

          {/* Location */}
          {orden.ubicaciones?.edificio && (
            <HoverTooltip label="UbicaciÃ³n" body={orden.ubicaciones.edificio}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--fs-xs)", color: "var(--fg-3)" }}>
                <MapPin size={11} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                  {orden.ubicaciones.edificio}
                </span>
              </span>
            </HoverTooltip>
          )}

        </div>

        {/* Right: time + avatars */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span suppressHydrationWarning style={{ fontSize: "var(--fs-xs)", color: "var(--fg-4)" }}>{mounted ? timeAgo(orden.created_at) : ""}</span>

          {/* Avatar trigger â€” always shown as a button when onAssigned is wired */}
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
                width: 26, height: 26, borderRadius: "50%",
                border: "1.5px dashed var(--border-strong)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--fg-4)",
              }}>
                <UserPlus size={12} />
              </span>
            ) : (
              <span style={{ display: "flex" }}>
                {assigned.slice(0, 3).map((u, i) => (
                  <span
                    key={u.id}
                    title={u.nombre}
                    style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                      color: "var(--fg-on-brand)",
                      border: "2px solid var(--surface-1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, flexShrink: 0,
                      marginLeft: i > 0 ? -7 : 0,
                    }}
                  >
                    {initials(u.nombre)}
                  </span>
                ))}
                {assigned.length > 3 && (
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "var(--surface-hover)", color: "var(--fg-2)",
                    border: "2px solid var(--surface-1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, marginLeft: -7,
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
// poll) only re-renders rows whose props actually changed â€” not all 70+. This
// is the main lever for INP on the orders list. Requires the parent to pass
// stable onClick/onAssigned callbacks (see OrdenesBandeja).
export default memo(OTRow);
