"use client";

import { useState } from "react";
import { Clock, MapPin, Settings2, Copy, Check as CheckIcon, AlertCircle } from "lucide-react";
import { parseDescMeta } from "@/lib/ordenes-api";
import type { OrdenListItem, Usuario, Estado, Prioridad } from "@/types/ordenes";

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADO: Record<Estado, { label: string; bg: string; color: string; dot: string }> = {
  pendiente:   { label: "Abierta",     bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_espera:   { label: "En espera",   bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  en_curso:    { label: "En curso",    bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  en_revision: { label: "En revisión", bg: "#F0F9FF", color: "#0369A1", dot: "#0EA5E9" },
  completado:  { label: "Completada",  bg: "#F0FDF4", color: "#166534", dot: "#16A34A" },
  cancelado:   { label: "Cancelada",   bg: "#F9FAFB", color: "#6B7280", dot: "#9CA3AF" },
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  ninguna: "#9CA3AF",
  baja:    "#9CA3AF",
  media:   "#3B82F6",
  alta:    "#F97316",
  urgente: "#EF4444",
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  ninguna: "", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
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

interface Props {
  orden:      OrdenListItem;
  usuarios:   Usuario[];
  isSelected: boolean;
  onClick:    () => void;
}

export default function OTRow({ orden, usuarios, isSelected, onClick }: Props) {
  const isPending = Boolean(orden._pending);
  const estado    = ESTADO[orden.estado];
  const titulo    = orden.titulo || orden.descripcion?.slice(0, 80) || "Sin título";
  const meta      = parseDescMeta(orden.descripcion ?? null);
  const [copied, setCopied] = useState(false);
  const prioColor = PRIORIDAD_COLOR[orden.prioridad];
  const prioLabel = PRIORIDAD_LABEL[orden.prioridad];

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

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={isPending ? undefined : onClick}
      style={{
        padding: "14px 20px",
        background: isSelected ? "#F0F4FF" : "#fff",
        borderBottom: "1px solid #F1F3F5",
        borderLeft: isSelected ? "3px solid #273D88" : "3px solid transparent",
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.55 : 1,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F8F9FF"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "#fff"; }}
    >
      {/* Top: N°OT + time */}
      {(meta.nOT || due) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          {meta.nOT ? (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#273D88", fontFamily: "monospace", letterSpacing: "0.02em" }}>
                {meta.nOT}
              </span>
              <button
                type="button"
                onClick={copyNOT}
                title="Copiar N° OT"
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "#16A34A" : "#C4CDD6", transition: "color 0.15s" }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "#8594A3"; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "#C4CDD6"; }}
              >
                {copied ? <CheckIcon size={10} /> : <Copy size={10} />}
              </button>
            </span>
          ) : <span />}

          {due && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: due.overdue ? "#DC2626" : "#D97706" }}>
              {due.overdue && <AlertCircle size={11} />}
              <Clock size={10} />
              {due.text}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <p style={{
        fontSize: 13.5, fontWeight: 600, color: "#111827",
        lineHeight: 1.4, margin: "0 0 8px",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {titulo}
      </p>

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", flex: 1, minWidth: 0 }}>

          {/* Status pill */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, fontWeight: 600, padding: "3px 8px",
            background: estado.bg, color: estado.color, borderRadius: 20,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: estado.dot, flexShrink: 0 }} />
            {estado.label}
          </span>

          {/* Priority */}
          {orden.prioridad !== "ninguna" && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "3px 8px",
              background: prioColor + "15", color: prioColor, borderRadius: 20,
            }}>
              {prioLabel}
            </span>
          )}

          {/* Location */}
          {orden.ubicaciones?.edificio && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#6B7280" }}>
              <MapPin size={11} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                {orden.ubicaciones.edificio}
              </span>
            </span>
          )}

          {/* Category */}
          {orden.categorias_ot?.nombre && (
            <span style={{
              fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 20,
              background: (orden.categorias_ot.color ?? "#6B7280") + "15",
              color: orden.categorias_ot.color ?? "#6B7280",
            }}>
              {orden.categorias_ot.icono && <span style={{ marginRight: 2 }}>{orden.categorias_ot.icono}</span>}
              {orden.categorias_ot.nombre}
            </span>
          )}
        </div>

        {/* Right: time + avatars */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{timeAgo(orden.created_at)}</span>
          {assigned.length > 0 && (
            <span style={{ display: "flex" }}>
              {assigned.slice(0, 3).map((u, i) => (
                <span
                  key={u.id}
                  title={u.nombre}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: "#273D88", color: "#fff",
                    border: "2px solid #fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                    marginLeft: i > 0 ? -6 : 0,
                  }}
                >
                  {initials(u.nombre)}
                </span>
              ))}
              {assigned.length > 3 && (
                <span style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: "#E5E7EB", color: "#6B7280",
                  border: "2px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, marginLeft: -6,
                }}>
                  +{assigned.length - 3}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
