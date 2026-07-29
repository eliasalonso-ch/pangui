"use client";

import React from "react";
import {
  Settings2, MapPin, Clock, MessageSquare,
  CircleDashed, PauseCircle, PlayCircle, CheckCircle2, UserCheck,
  ArrowUpCircle, ArrowDownCircle, MinusCircle, AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OrdenListItem, Usuario, Estado, Prioridad } from "@/types/ordenes";
import { CategoriaIcon } from "@/components/ordenes/categoria-icon";

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
): { label: string; color: string } | null {
  const now = new Date();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(fechaTermino);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - nowDay.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return {
      label: `vencida hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}`,
      color: "var(--danger)",
    };
  }
  if (diffDays === 0) return { label: "vence hoy", color: "var(--danger)" };
  if (diffDays === 1) return { label: "vence mañana", color: "var(--danger)" };
  if (diffDays <= 7) {
    return { label: `vence en ${diffDays} días`, color: "var(--warning)" };
  }
  return null;
}

// ─── Status config ────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<
  Estado,
  { label: string; icon: LucideIcon; color: string }
> = {
  pendiente:   { label: "Sin asignar", icon: CircleDashed, color: "var(--st-open-dot)" },
  en_espera:   { label: "En espera",   icon: PauseCircle,  color: "var(--st-wait-dot)" },
  en_curso:    { label: "En curso",    icon: PlayCircle,   color: "var(--st-progress-dot)" },
  completado:  { label: "Completada",  icon: CheckCircle2, color: "var(--st-done-dot)" },
};

// ─── Priority config ──────────────────────────────────────────────────────────

// Las flechas siguen el patrón de MaintainX: el ícono lleva el color saturado y
// la dirección comunica la intensidad. Baja y media no son señales, así que van
// en gris; alta y urgente sí, y se ven de inmediato.
const PRIORIDAD_CONFIG: Record<
  Prioridad,
  { label: string; icon: LucideIcon; color: string }
> = {
  ninguna:  { label: "Sin prioridad", icon: MinusCircle, color: "var(--pr-low)" },
  baja:     { label: "Baja",          icon: ArrowDownCircle, color: "var(--pr-low)" },
  media:    { label: "Media",         icon: MinusCircle, color: "var(--pr-medium)" },
  alta:     { label: "Alta",          icon: ArrowUpCircle, color: "var(--pr-high)" },
  urgente:  { label: "Urgente",       icon: AlertCircle, color: "var(--pr-urgent)" },
};

// ─── Badge ────────────────────────────────────────────────────────────────────

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  ícono como único portador del color. Al no teñir el fondo, el color queda
 *  concentrado en una marca pequeña y varias etiquetas pueden convivir en la
 *  misma fila sin competir entre sí. */
function CardBadge({
  icon: Icon,
  iconColor,
  children,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-normal border shrink-0"
      style={{
        borderColor: "var(--border-strong)",
        borderRadius: "var(--r-sm)",
        color: "var(--fg-1)",
        background: "transparent",
      }}
    >
      {Icon && <Icon className="size-3 shrink-0" style={{ color: iconColor }} />}
      {children}
    </span>
  );
}

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
  const isCompleted = orden.estado === "completado";

  const hasAssignees = (orden.asignados_ids ?? []).length > 0;
  const estadoCfg = orden.estado === "pendiente" && hasAssignees
    ? { label: "Asignada", icon: UserCheck, color: "var(--st-progress-dot)" }
    : ESTADO_CONFIG[orden.estado];
  const titulo =
    orden.titulo ||
    (orden.descripcion ? orden.descripcion.slice(0, 80) : null) ||
    "Sin título";

  const assignedUsers = (orden.asignados_ids ?? [])
    .map((id) => usuarios.find((u) => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  const dueInfo =
    orden.fecha_termino && !isPending && !isCompleted
      ? dueDateLabel(orden.fecha_termino)
      : null;

  const showDue =
    dueInfo !== null ||
    (orden.fecha_termino && !isCompleted
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
          ? "border-l-[3px] border-l-[var(--brand)] bg-[var(--brand-tint)] border-b border-border"
          : "border-b border-border bg-background hover:bg-[var(--surface-hover)]",
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
          <CardBadge icon={estadoCfg.icon} iconColor={estadoCfg.color}>
            {estadoCfg.label}
          </CardBadge>
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

        {/* Due date — una fecha próxima o vencida sí es una señal, así que va
            en etiqueta con el reloj en color; una fecha normal es solo dato. */}
        {showDue && orden.fecha_termino && (
          dueInfo ? (
            <CardBadge icon={Clock} iconColor={dueInfo.color}>
              {dueInfo.label}
            </CardBadge>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3 shrink-0" />
              {new Date(orden.fecha_termino).toLocaleDateString("es-CL", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )
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
          <CardBadge icon={prioridadCfg.icon} iconColor={prioridadCfg.color}>
            {prioridadCfg.label}
          </CardBadge>
        )}

        {/* Category badge — el color de la categoría (definido por el usuario)
            se aplica solo al ícono, nunca como fondo teñido. */}
        {orden.categorias_ot?.nombre && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-normal border shrink-0"
            style={{
              borderColor: "var(--border-strong)",
              borderRadius: "var(--r-sm)",
              color: "var(--fg-1)",
              background: "transparent",
            }}
          >
            <span
              className="inline-flex items-center shrink-0"
              style={{ color: orden.categorias_ot.color ?? "var(--fg-3)" }}
            >
              <CategoriaIcon icono={orden.categorias_ot.icono} size={11} />
            </span>
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
