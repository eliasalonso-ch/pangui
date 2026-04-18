"use client";

import React from "react";
import { Settings2, MapPin, Clock, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OrdenListItem, Usuario, Estado, Prioridad } from "@/types/ordenes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function dueDateLabel(
  fechaTermino: string
): { label: string; className: string } | null {
  const now = new Date();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(fechaTermino);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - nowDay.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return {
      label: `vencida hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}`,
      className: "text-red-500",
    };
  }
  if (diffDays === 0) return { label: "vence hoy", className: "text-red-500" };
  if (diffDays === 1) return { label: "vence mañana", className: "text-red-500" };
  if (diffDays <= 7) {
    return { label: `vence en ${diffDays} días`, className: "text-amber-500" };
  }
  return null;
}

// ─── Status config ────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<
  Estado,
  { label: string; bg: string; color: string }
> = {
  pendiente:   { label: "Abierta",      bg: "#EEF1FB", color: "#273D88" },
  en_espera:   { label: "En espera",    bg: "#fffbeb", color: "#b45309" },
  en_curso:    { label: "En curso",     bg: "#f0f3ff", color: "#3D52A0" },
  en_revision: { label: "En revisión",  bg: "#F5F3FF", color: "#7c3aed" },
  completado:  { label: "Completada",   bg: "#ECFDF5", color: "#059669" },
  cancelado:   { label: "Cancelada",    bg: "#f4f4f5", color: "#71717a" },
};

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORIDAD_CONFIG: Record<
  Prioridad,
  { label: string; textClass: string }
> = {
  ninguna:  { label: "—",       textClass: "text-zinc-400" },
  baja:     { label: "Baja",    textClass: "text-zinc-400" },
  media:    { label: "Media",   textClass: "text-blue-500" },
  alta:     { label: "Alta",    textClass: "text-orange-500" },
  urgente:  { label: "Urgente", textClass: "text-red-500" },
};

// ─── Initials helper ──────────────────────────────────────────────────────────

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface OTCardProps {
  orden: OrdenListItem;
  isSelected: boolean;
  usuarios: Usuario[];
  comCount?: number;
  onClick: () => void;
  onPrefetch: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OTCard({
  orden,
  isSelected,
  usuarios,
  onClick,
  onPrefetch,
}: OTCardProps) {
  const isPending = Boolean(orden._pending);

  const estadoCfg = ESTADO_CONFIG[orden.estado];
  const titulo =
    orden.titulo ||
    (orden.descripcion ? orden.descripcion.slice(0, 80) : null) ||
    "Sin título";

  const assignedUsers = (orden.asignados_ids ?? [])
    .map((id) => usuarios.find((u) => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  const dueInfo =
    orden.fecha_termino && !isPending
      ? dueDateLabel(orden.fecha_termino)
      : null;

  const showDue =
    dueInfo !== null ||
    (orden.fecha_termino
      ? (() => {
          const now = new Date();
          const nowDay = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          const due = new Date(orden.fecha_termino);
          const dueDay = new Date(
            due.getFullYear(),
            due.getMonth(),
            due.getDate()
          );
          const diff = Math.round(
            (dueDay.getTime() - nowDay.getTime()) / 86_400_000
          );
          return diff <= 7;
        })()
      : false);

  const prioridadCfg = PRIORIDAD_CONFIG[orden.prioridad];
  const showPriority = orden.prioridad !== "ninguna";

  // Comment count from any extended field (not in base type; guard gracefully)
  const commentCount: number =
    (orden as Record<string, unknown>)._comment_count as number ?? 0;

  return (
    <div
      role="button"
      tabIndex={isPending ? -1 : 0}
      aria-disabled={isPending}
      onClick={isPending ? undefined : onClick}
      onMouseEnter={isPending ? undefined : onPrefetch}
      onFocus={isPending ? undefined : onPrefetch}
      onKeyDown={
        isPending
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
      }
      className={[
        "w-full flex flex-col gap-2 px-4 py-3.5 cursor-pointer select-none outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-primary",
        isSelected
          ? "border-l-[3px] border-l-[#273D88] bg-[#EEF1FB] border-b border-border"
          : "border-b border-border bg-background hover:bg-[#F8F9FF]",
        isPending ? "opacity-60 pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Row 1: status + time */}
      <div className="flex items-center justify-between gap-2">
        {isPending ? (
          <Badge variant="secondary" className="text-xs">
            Guardando…
          </Badge>
        ) : (
          <span
            className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full"
            style={{ backgroundColor: estadoCfg.bg, color: estadoCfg.color }}
          >
            {estadoCfg.label}
          </span>
        )}
        <span className="text-xs text-muted-foreground shrink-0">
          {timeAgo(orden.created_at)}
        </span>
      </div>

      {/* Row 2: title */}
      <p className="font-semibold text-sm leading-snug line-clamp-2 text-foreground">
        {titulo}
      </p>

      {/* Row 3: meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Asset */}
        {orden.activos?.nombre && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Settings2 className="size-3 shrink-0" />
            {orden.activos.nombre}
          </span>
        )}

        {/* Location */}
        {orden.ubicaciones?.edificio && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {orden.ubicaciones.edificio}
          </span>
        )}

        {/* Due date */}
        {showDue && orden.fecha_termino && (
          <span
            className={[
              "inline-flex items-center gap-1 text-xs",
              dueInfo ? dueInfo.className : "text-muted-foreground",
            ].join(" ")}
          >
            <Clock className="size-3 shrink-0" />
            {dueInfo
              ? dueInfo.label
              : new Date(orden.fecha_termino).toLocaleDateString("es-CL", {
                  day: "numeric",
                  month: "short",
                })}
          </span>
        )}

        {/* Comment count */}
        {commentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <MessageSquare className="size-3 shrink-0" />
            {commentCount}
          </span>
        )}

        {/* Priority chip */}
        {showPriority && (
          <span
            className={[
              "inline-flex items-center text-xs font-medium",
              prioridadCfg.textClass,
            ].join(" ")}
          >
            {prioridadCfg.label}
          </span>
        )}

        {/* Category badge */}
        {orden.categorias_ot?.nombre && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-md"
            style={
              orden.categorias_ot.color
                ? {
                    backgroundColor: orden.categorias_ot.color + "22",
                    color: orden.categorias_ot.color,
                  }
                : undefined
            }
          >
            {orden.categorias_ot.icono && (
              <span className="mr-1">{orden.categorias_ot.icono}</span>
            )}
            {orden.categorias_ot.nombre}
          </span>
        )}

        {/* Assigned user initials */}
        {assignedUsers.length > 0 && (
          <span className="inline-flex items-center gap-0.5">
            {assignedUsers.slice(0, 3).map((u) => (
              <span
                key={u.id}
                title={u.nombre}
                className="inline-flex items-center justify-center size-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold border border-border"
              >
                {initials(u.nombre)}
              </span>
            ))}
            {assignedUsers.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{assignedUsers.length - 3}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export default OTCard;
