"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { Clock, MapPin, Copy, Check as CheckIcon, AlertCircle, UserPlus, X as XIcon } from "lucide-react";
import { parseDescMeta, updateOrden } from "@/lib/ordenes-api";
import type { OrdenListItem, Usuario, Estado, Prioridad } from "@/types/ordenes";
import { CategoriaIcon } from "@/components/ordenes/categoria-icon";

// Status and priority now use CSS custom properties from v2 token system
const ESTADO: Record<Estado, { label: string; bg: string; color: string; dot: string }> = {
  pendiente:   { label: "Sin asignar", bg: "var(--st-open-bg)",     color: "var(--st-open-fg)",     dot: "var(--st-open-dot)"     },
  en_espera:   { label: "En espera",   bg: "var(--st-wait-bg)",     color: "var(--st-wait-fg)",     dot: "var(--st-wait-dot)"     },
  en_curso:    { label: "En curso",    bg: "var(--st-progress-bg)", color: "var(--st-progress-fg)", dot: "var(--st-progress-dot)" },
  completado:  { label: "Completada",  bg: "var(--st-done-bg)",     color: "var(--st-done-fg)",     dot: "var(--st-done-dot)"     },
};

const ESTADO_ASIGNADA = {
  label: "Asignada",
  bg:    "var(--st-progress-bg)",
  color: "var(--st-progress-fg)",
  dot:   "var(--st-progress-dot)",
};

const PRIORIDAD: Record<Prioridad, { label: string; bg: string; color: string }> = {
  ninguna: { label: "",        bg: "transparent",          color: "transparent"       },
  baja:    { label: "Baja",    bg: "var(--surface-hover)", color: "var(--pr-low)"     },
  media:   { label: "Media",   bg: "var(--brand-tint)",    color: "var(--pr-medium)"  },
  alta:    { label: "Alta",    bg: "var(--st-wait-bg)",    color: "var(--pr-high)"    },
  urgente: { label: "Urgente", bg: "var(--danger-bg)",     color: "var(--pr-urgent)"  },
};

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

function dueLabel(fecha: string): { text: string; overdue: boolean } | null {
  const diff = Math.round((new Date(fecha).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff < 0)   return { text: `Venció hace ${Math.abs(diff)}d`, overdue: true };
  if (diff === 0) return { text: "Vence hoy", overdue: true };
  if (diff === 1) return { text: "Mañana", overdue: false };
  if (diff <= 7)  return { text: `${diff}d`, overdue: false };
  return null;
}

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
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

  useEffect(() => { setMounted(true); }, []);

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

// ── AssignDropdown ────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  orden:        OrdenListItem;
  rowNumber?:   number;
  usuarios:     Usuario[];
  isSelected:   boolean;
  onClick:      (id: string) => void;
  myId?:        string;
  onAssigned?:  (id: string, newIds: string[]) => void;
  // When set (only in the "Reprogramadas" tab), render a pill with the
  // coordinated date so the supervisor sees it without opening the OT.
  coordinadaPara?: string | null;
}

function OTRow({ orden, rowNumber, usuarios, isSelected, onClick, myId, onAssigned, coordinadaPara }: Props) {
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
  useEffect(() => { setMounted(true); }, []);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  const assigned = (orden.asignados_ids ?? [])
    .map(id => usuarios.find(u => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  const due = mounted && orden.fecha_termino && !isPending ? dueLabel(orden.fecha_termino) : null;

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
      style={{
        padding: "14px 20px",
        background: isSelected ? "var(--brand-tint)" : "var(--surface-1)",
        borderBottom: "1px solid var(--divider)",
        borderLeft: isSelected ? "3px solid var(--brand)" : "3px solid transparent",
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.55 : 1,
        transition: "background var(--dur-fast) var(--ease)",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
    >
      {/* Top: row number + N°OT + due date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--fg-4)", minWidth: 16, textAlign: "right", flexShrink: 0 }}>
            {rowNumber}
          </span>
          {meta.nOT && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--brand-fg)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
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
                {copied ? <CheckIcon size={10} /> : <Copy size={10} />}
              </button>
            </span>
          )}
        </span>
        {due && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--fs-xs)", fontWeight: 600, color: due.overdue ? "var(--danger)" : "var(--warning)" }}>
            {due.overdue && <AlertCircle size={11} />}
            <Clock size={10} />
            {due.text}
          </span>
        )}
      </div>

      {/* Title */}
      <HoverTooltip label="Título" body={titulo} triggerStyle={{ margin: "0 0 6px" }}>
        <p style={{
          fontSize: "var(--fs-base)", fontWeight: 600, color: "var(--fg-1)",
          lineHeight: 1.4, margin: 0,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {titulo}
        </p>
      </HoverTooltip>

      {/* Description */}
      {meta.descripcion && (
        <HoverTooltip label="Descripción" body={meta.descripcion} triggerStyle={{ margin: "0 0 6px" }}>
          <p style={{
            fontSize: "var(--fs-sm)", color: "var(--fg-2)", margin: 0,
            display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
            overflow: "hidden", lineHeight: 1.5,
          }}>
            {meta.descripcion}
          </p>
        </HoverTooltip>
      )}

      {/* Hito */}
      {meta.hito && (
        <p style={{ fontSize: "var(--fs-xs)", color: "var(--fg-2)", margin: "0 0 7px", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--fg-4)" }}>Hito:</span> {meta.hito}
        </p>
      )}

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", flex: 1, minWidth: 0 }}>

          {/* Status pill */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: "var(--fs-xs)", fontWeight: 600, padding: "3px 8px",
            background: estado.bg, color: estado.color, borderRadius: "var(--r-sm)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: estado.dot, flexShrink: 0 }} />
            {estado.label}
          </span>

          {/* Coordinated date — only shown inside the Reprogramadas tab. */}
          {coordinadaPara && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "var(--fs-xs)", fontWeight: 600, padding: "3px 8px",
              background: "var(--success-bg)", color: "var(--success)",
              borderRadius: "var(--r-sm)",
            }}>
              <Clock size={11} />
              Coordinada para {new Date(coordinadaPara + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
            </span>
          )}

          {/* Priority */}
          {orden.prioridad !== "ninguna" && (
            <span style={{
              fontSize: "var(--fs-xs)", fontWeight: 600, padding: "3px 8px",
              background: prio.bg, color: prio.color, borderRadius: "var(--r-sm)",
            }}>
              {prio.label}
            </span>
          )}

          {/* Location */}
          {orden.ubicaciones?.edificio && (
            <HoverTooltip label="Ubicación" body={orden.ubicaciones.edificio}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--fs-xs)", color: "var(--fg-3)" }}>
                <MapPin size={11} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                  {orden.ubicaciones.edificio}
                </span>
              </span>
            </HoverTooltip>
          )}

          {/* Category */}
          {orden.categorias_ot?.nombre && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: "var(--fs-xs)", fontWeight: 500, padding: "2px 7px", borderRadius: "var(--r-sm)",
              background: (orden.categorias_ot.color ?? "var(--fg-3)") + "20",
              color: orden.categorias_ot.color ?? "var(--fg-3)",
            }}>
              <CategoriaIcon icono={orden.categorias_ot.icono} size={11} />
              {orden.categorias_ot.nombre}
            </span>
          )}
        </div>

        {/* Right: time + avatars */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span suppressHydrationWarning style={{ fontSize: "var(--fs-xs)", color: "var(--fg-4)" }}>{mounted ? timeAgo(orden.created_at) : ""}</span>

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
// poll) only re-renders rows whose props actually changed — not all 70+. This
// is the main lever for INP on the orders list. Requires the parent to pass
// stable onClick/onAssigned callbacks (see OrdenesBandeja).
export default memo(OTRow);
