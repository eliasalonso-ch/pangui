"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, MapPin, Copy, Check as CheckIcon, AlertCircle, UserPlus, X as XIcon } from "lucide-react";
import { parseDescMeta, updateOrden } from "@/lib/ordenes-api";
import type { OrdenListItem, Usuario, Estado, Prioridad } from "@/types/ordenes";

const ESTADO: Record<Estado, { label: string; bg: string; color: string; dot: string }> = {
  pendiente:   { label: "Sin asignar", bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_espera:   { label: "En espera",   bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  en_curso:    { label: "En curso",    bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  completado:  { label: "Completada",  bg: "#F0FDF4", color: "#166534", dot: "#16A34A" },
};

const ESTADO_ASIGNADA = { label: "Asignada", bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" };

const PRIORIDAD: Record<Prioridad, { label: string; bg: string; color: string }> = {
  ninguna: { label: "",        bg: "transparent", color: "transparent" },
  baja:    { label: "Baja",    bg: "#F1F5F9",     color: "#64748B" },
  media:   { label: "Media",   bg: "#EFF6FF",     color: "#2563EB" },
  alta:    { label: "Alta",    bg: "#FFF7ED",     color: "#C2410C" },
  urgente: { label: "Urgente", bg: "#FEF2F2",     color: "#DC2626" },
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
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06)",
            padding: "12px 14px",
            transform: pos.flipUp ? "translateY(-100%) translateY(-6px)" : "none",
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>
            {label}
          </p>
          <p style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 10,
        boxShadow: "0 8px 28px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06)",
        overflow: "hidden",
        transform: flipUp ? "translateY(-100%) translateY(-6px)" : "none",
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Asignar
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, display: "flex" }}>
          <XIcon size={12} />
        </button>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {usuarios.length === 0 && (
          <p style={{ padding: "10px 12px", fontSize: 12, color: "#94A3B8", margin: 0 }}>Sin usuarios</p>
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
                background: isAssigned ? "#EFF6FF" : "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                opacity: isSaving ? 0.6 : 1,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (!isAssigned) e.currentTarget.style.background = "#F8FAFC"; }}
              onMouseLeave={e => { if (!isAssigned) e.currentTarget.style.background = "none"; }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: isAssigned ? "linear-gradient(135deg,#1E3A8A,#2563EB)" : "#E2E8F0",
                color: isAssigned ? "#fff" : "#64748B",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
              }}>
                {initials(u.nombre)}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.nombre}
              </span>
              {isAssigned && <CheckIcon size={13} color="#2563EB" />}
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
  onClick:      () => void;
  myId?:        string;
  onAssigned?:  (id: string, newIds: string[]) => void;
}

export default function OTRow({ orden, rowNumber, usuarios, isSelected, onClick, myId, onAssigned }: Props) {
  const isPending = Boolean(orden._pending);
  const hasAssignees = (orden.asignados_ids ?? []).length > 0;
  const estado = orden.estado === "pendiente"
    ? (hasAssignees ? ESTADO_ASIGNADA : ESTADO["pendiente"])
    : ESTADO[orden.estado];
  const prio      = PRIORIDAD[orden.prioridad];
  const meta      = parseDescMeta(orden.descripcion ?? null);
  const titulo    = orden.titulo || meta.descripcion?.slice(0, 80) || "Sin título";
  const [copied, setCopied] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  const assigned = (orden.asignados_ids ?? [])
    .map(id => usuarios.find(u => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  const due = orden.fecha_termino && !isPending ? dueLabel(orden.fecha_termino) : null;

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
      onClick={isPending ? undefined : onClick}
      style={{
        padding: "14px 20px",
        background: isSelected ? "#EFF6FF" : "#fff",
        borderBottom: "1px solid #E2E8F0",
        borderLeft: isSelected ? "3px solid #2563EB" : "3px solid transparent",
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.55 : 1,
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F8FAFC"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "#fff"; }}
    >
      {/* Top: row number + N°OT + due date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#CBD5E1", minWidth: 16, textAlign: "right", flexShrink: 0 }}>
            {rowNumber}
          </span>
          {meta.nOT && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#1E3A8A", fontFamily: "monospace", letterSpacing: "0.02em" }}>
                {meta.nOT}
              </span>
              <button
                type="button"
                onClick={copyNOT}
                title="Copiar N° OT"
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "#16A34A" : "#CBD5E1", transition: "color 0.15s" }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "#94A3B8"; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "#CBD5E1"; }}
              >
                {copied ? <CheckIcon size={10} /> : <Copy size={10} />}
              </button>
            </span>
          )}
        </span>
        {due && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: due.overdue ? "#DC2626" : "#D97706" }}>
            {due.overdue && <AlertCircle size={11} />}
            <Clock size={10} />
            {due.text}
          </span>
        )}
      </div>

      {/* Title */}
      <HoverTooltip label="Título" body={titulo} triggerStyle={{ margin: "0 0 6px" }}>
        <p style={{
          fontSize: 14, fontWeight: 600, color: "#0F172A",
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
            fontSize: 12, color: "#64748B", margin: 0,
            display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
            overflow: "hidden", lineHeight: 1.5,
          }}>
            {meta.descripcion}
          </p>
        </HoverTooltip>
      )}

      {/* Hito */}
      {meta.hito && (
        <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 7px", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#94A3B8" }}>Hito:</span> {meta.hito}
        </p>
      )}

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", flex: 1, minWidth: 0 }}>

          {/* Status pill */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, fontWeight: 600, padding: "3px 8px",
            background: estado.bg, color: estado.color, borderRadius: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: estado.dot, flexShrink: 0 }} />
            {estado.label}
          </span>

          {/* Priority */}
          {orden.prioridad !== "ninguna" && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "3px 8px",
              background: prio.bg, color: prio.color, borderRadius: 6,
            }}>
              {prio.label}
            </span>
          )}

          {/* Location */}
          {orden.ubicaciones?.edificio && (
            <HoverTooltip label="Ubicación" body={orden.ubicaciones.edificio}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748B" }}>
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
              fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 6,
              background: (orden.categorias_ot.color ?? "#64748B") + "20",
              color: orden.categorias_ot.color ?? "#64748B",
            }}>
              {orden.categorias_ot.icono && <span style={{ marginRight: 2 }}>{orden.categorias_ot.icono}</span>}
              {orden.categorias_ot.nombre}
            </span>
          )}
        </div>

        {/* Right: time + avatars */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span suppressHydrationWarning style={{ fontSize: 11, color: "#94A3B8" }}>{timeAgo(orden.created_at)}</span>

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
                border: "1.5px dashed #CBD5E1",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#CBD5E1",
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
                      background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff",
                      border: "2px solid #fff",
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
                    background: "#E2E8F0", color: "#64748B",
                    border: "2px solid #fff",
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
