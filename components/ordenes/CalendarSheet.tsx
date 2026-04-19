"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrdenListItem } from "@/types/ordenes";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Abierta",
  en_espera: "En espera",
  en_curso: "En curso",
  completado: "Completada",
};

const ESTADO_COLORS: Record<string, { bg: string; text: string }> = {
  pendiente:   { bg: "#EFF6FF", text: "#2563EB" },
  en_espera:   { bg: "#FFFBEB", text: "#D97706" },
  en_curso:    { bg: "#EEF2FF", text: "#6366F1" },
  completado:  { bg: "#F0FDF4", text: "#16A34A" },
};

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface CalendarSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarDate: Date | null;
  setCalendarDate: (d: Date | null) => void;
  ordenes: OrdenListItem[];
}

export default function CalendarSheet({
  open,
  onOpenChange,
  calendarDate,
  setCalendarDate,
  ordenes,
}: CalendarSheetProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = calendarDate ?? new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const today = new Date();
  const firstDow = (new Date(viewMonth.year, viewMonth.month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Count orders per day in view month
  const countByDay: Record<number, number> = {};
  for (const o of ordenes) {
    const d = new Date(o.created_at);
    if (d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month) {
      countByDay[d.getDate()] = (countByDay[d.getDate()] ?? 0) + 1;
    }
  }

  const ordenesDia = calendarDate
    ? ordenes.filter((o) => sameDay(new Date(o.created_at), calendarDate))
    : [];

  const monthLabel = new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });

  function prevMonth() {
    const d = new Date(viewMonth.year, viewMonth.month - 1, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  function nextMonth() {
    const d = new Date(viewMonth.year, viewMonth.month + 1, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  function selectDay(day: number) {
    const d = new Date(viewMonth.year, viewMonth.month, day);
    setCalendarDate(sameDay(d, calendarDate) ? null : d);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] flex flex-col p-0 rounded-none">
        {/* Header */}
        <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border space-y-0 shrink-0">
          <SheetTitle className="text-base font-semibold">Buscar por fecha</SheetTitle>
          <div className="flex items-center gap-3">
            {calendarDate && (
              <button
                className="text-sm text-primary font-medium"
                onClick={() => setCalendarDate(null)}
              >
                Limpiar
              </button>
            )}
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X size={18} />
            </button>
          </div>
        </SheetHeader>

        {/* Calendar */}
        <div className="px-4 pt-4 shrink-0">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground"
              onClick={prevMonth}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold capitalize">{monthLabel}</span>
            <button
              className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground"
              onClick={nextMonth}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const thisDate = new Date(viewMonth.year, viewMonth.month, day);
              const isToday = sameDay(thisDate, today);
              const isSelected = sameDay(thisDate, calendarDate);
              const count = countByDay[day] ?? 0;
              return (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    "aspect-square flex flex-col items-center justify-center text-sm font-medium relative transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                      ? "text-primary font-bold hover:bg-muted"
                      : "hover:bg-muted",
                  )}
                  onClick={() => selectDay(day)}
                >
                  {day}
                  {count > 0 && (
                    <span
                      className={cn(
                        "absolute bottom-1 w-1 h-1 rounded-full",
                        isSelected ? "bg-primary-foreground/70" : "bg-primary",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-3 border-t border-border mt-3">
          {calendarDate ? (
            <>
              <p className="text-sm font-medium text-muted-foreground mb-3">
                {ordenesDia.length > 0
                  ? `${ordenesDia.length} orden${ordenesDia.length !== 1 ? "es" : ""} creada${ordenesDia.length !== 1 ? "s" : ""} — ${calendarDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`
                  : `Sin órdenes creadas el ${calendarDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`}
              </p>
              <div className="space-y-2">
                {ordenesDia.map((o) => {
                  const col = ESTADO_COLORS[o.estado] ?? { bg: "#F4F4F5", text: "#71717A" };
                  return (
                    <div key={o.id} className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 shrink-0 mt-0.5"
                        style={{ background: col.bg, color: col.text }}
                      >
                        {ESTADO_LABEL[o.estado] ?? o.estado}
                      </span>
                      <p className="text-sm leading-snug line-clamp-2">
                        {o.titulo || o.descripcion?.slice(0, 80) || "Sin título"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Selecciona un día para ver las órdenes creadas en esa fecha
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          <Button
            className="w-full rounded-none h-11 font-semibold"
            onClick={() => onOpenChange(false)}
          >
            {calendarDate ? "Ver resultados" : "Cerrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
