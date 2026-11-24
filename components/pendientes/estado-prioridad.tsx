"use client";

import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Circle, CircleOff, Minus, Timer } from "lucide-react";
import {
  ESTADOS_PENDIENTE, PRIORIDADES_PENDIENTE, etiquetaDe,
  type EstadoPendiente, type PrioridadPendiente,
} from "@/lib/pendientes-api";

/**
 * Ícono + texto de estado y prioridad, como las columnas Status / Priority del
 * ejemplo "Tasks" de shadcn, con los colores de la app. La prioridad usa los
 * mismos íconos y colores que la de las OTs (OTDetail: PRIO_ICON / PRIO_COLOR_SOLID).
 */

type Icono = React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;

export const ESTADO_UI: Record<EstadoPendiente, { icono: Icono; color: string }> = {
  por_hacer: { icono: Circle,       color: "var(--fg-3)" },
  en_curso:  { icono: Timer,        color: "var(--st-progress-dot)" },
  hecho:     { icono: CheckCircle2, color: "var(--st-done-dot)" },
  cancelado: { icono: CircleOff,    color: "var(--fg-4)" },
};

export const PRIORIDAD_UI: Record<PrioridadPendiente, { icono: Icono; color: string }> = {
  baja:    { icono: ArrowDown,     color: "var(--success)" },
  media:   { icono: Minus,         color: "var(--brand)" },
  alta:    { icono: ArrowUp,       color: "var(--pr-high)" },
  urgente: { icono: AlertTriangle, color: "var(--pr-urgent)" },
};

function ConIcono({ icono: I, color, texto }: { icono: Icono; color: string; texto: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", color: "var(--fg-1)" }}>
      <I size={15} color={color} style={{ flexShrink: 0 }} />
      {texto}
    </span>
  );
}

export const EstadoPendienteTag = ({ estado }: { estado: EstadoPendiente }) =>
  <ConIcono {...ESTADO_UI[estado]} texto={etiquetaDe(ESTADOS_PENDIENTE, estado)} />;

export const PrioridadPendienteTag = ({ prioridad }: { prioridad: PrioridadPendiente }) =>
  <ConIcono {...PRIORIDAD_UI[prioridad]} texto={etiquetaDe(PRIORIDADES_PENDIENTE, prioridad)} />;
