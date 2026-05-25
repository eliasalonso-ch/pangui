"use client";

import type { Recurrencia, RecurrenciaConfig } from "@/types/ordenes";

export interface RecurrenceDraft {
  recurrencia: Recurrencia;
  recurrencia_intervalo: string;
  recurrencia_dias: number[];
  recurrencia_mes_dia: string;
  recurrencia_fin: string;
  fecha_inicio: string;
}

const WEEKDAYS = [
  { value: 0, label: "Dom", long: "Domingo" },
  { value: 1, label: "Lun", long: "Lunes" },
  { value: 2, label: "Mar", long: "Martes" },
  { value: 3, label: "Mie", long: "Miercoles" },
  { value: 4, label: "Jue", long: "Jueves" },
  { value: 5, label: "Vie", long: "Viernes" },
  { value: 6, label: "Sab", long: "Sabado" },
];

export const RECURRENCIAS: { value: Recurrencia; label: string }[] = [
  { value: "ninguna", label: "No se repite" },
  { value: "diaria", label: "Diaria" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

export function recurrenceDraftFromConfig(
  recurrencia: Recurrencia,
  config: RecurrenciaConfig | null | undefined,
  fechaInicio: string,
): Pick<RecurrenceDraft, "recurrencia_intervalo" | "recurrencia_dias" | "recurrencia_mes_dia" | "recurrencia_fin"> {
  const start = parseDateOnly(fechaInicio);
  return {
    recurrencia_intervalo: String(config?.interval ?? 1),
    recurrencia_dias: config?.weekdays ?? (start ? [start.getDay()] : []),
    recurrencia_mes_dia: String(config?.month_day ?? start?.getDate() ?? 1),
    recurrencia_fin: config?.end_date ?? "",
  };
}

export function buildRecurrenciaConfig(form: RecurrenceDraft): RecurrenciaConfig | null {
  if (form.recurrencia === "ninguna") return null;
  const interval = Math.max(1, parseInt(form.recurrencia_intervalo, 10) || 1);
  const config: RecurrenciaConfig = {
    interval,
    end_date: form.recurrencia_fin || null,
  };

  if (form.recurrencia === "diaria" || form.recurrencia === "semanal") {
    config.weekdays = form.recurrencia_dias.length ? [...form.recurrencia_dias].sort() : null;
  }
  if (form.recurrencia === "mensual") {
    config.month_day = Math.min(31, Math.max(1, parseInt(form.recurrencia_mes_dia, 10) || 1));
  }
  if (form.recurrencia === "anual") {
    config.unit = "year";
  }

  return config;
}

export function RecurrenceControls({
  value,
  onChange,
  compact = false,
}: {
  value: RecurrenceDraft;
  onChange: (key: keyof RecurrenceDraft, val: string | number[]) => void;
  compact?: boolean;
}) {
  const interval = Math.max(1, parseInt(value.recurrencia_intervalo, 10) || 1);
  const start = parseDateOnly(value.fecha_inicio);
  const selectedDay = start ? start.getDay() : new Date().getDay();
  const selectedMonthDay = start ? start.getDate() : new Date().getDate();
  const effectiveWeekdays = value.recurrencia_dias.length ? value.recurrencia_dias : [selectedDay];
  const annualDate = start ? start.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }) : "la fecha de inicio";
  const gap = compact ? 8 : 10;
  const inputHeight = compact ? 36 : 40;

  const toggleDay = (day: number) => {
    const next = value.recurrencia_dias.includes(day)
      ? value.recurrencia_dias.filter(d => d !== day)
      : [...value.recurrencia_dias, day];
    onChange("recurrencia_dias", next);
  };

  return (
    <div style={{ display: "grid", gap }}>
      {value.recurrencia === "semanal" && (
        <>
          <div style={{ display: "grid", gap: 5 }}>
            <span style={labelStyle}>Cada</span>
            <select
              value={value.recurrencia_intervalo}
              onChange={e => onChange("recurrencia_intervalo", e.target.value)}
              style={controlStyle(inputHeight)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: 13, color: "var(--fg-2)" }}>semana el</span>
          </div>
          <WeekdayPicker selected={effectiveWeekdays} onToggle={day => onChange("recurrencia_dias", [day])} compact={compact} />
          <Preview text={`Se repite cada ${interval} ${interval === 1 ? "semana" : "semanas"} el ${weekdayNames(effectiveWeekdays)} despues de completar esta Orden de Trabajo.`} />
        </>
      )}

      {value.recurrencia === "diaria" && (
        <>
          <WeekdayPicker selected={effectiveWeekdays} onToggle={toggleDay} compact={compact} />
          <Preview text={effectiveWeekdays.length === 7
            ? "Se repite cada dia despues de completar esta Orden de Trabajo."
            : `Se repite los ${weekdayNames(effectiveWeekdays)} despues de completar esta Orden de Trabajo.`
          } />
        </>
      )}

      {value.recurrencia === "mensual" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Cada</span>
            <select value={value.recurrencia_intervalo} onChange={e => onChange("recurrencia_intervalo", e.target.value)} style={{ ...controlStyle(inputHeight), width: 82 }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: 13, color: "var(--fg-2)" }}>mes en el</span>
            <select value={value.recurrencia_mes_dia || selectedMonthDay} onChange={e => onChange("recurrencia_mes_dia", e.target.value)} style={{ ...controlStyle(inputHeight), width: 98 }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}°</option>)}
            </select>
          </div>
          <Preview text={`Se repite cada ${interval} ${interval === 1 ? "mes" : "meses"} el dia ${value.recurrencia_mes_dia || selectedMonthDay} despues de completar esta Orden de Trabajo.`} />
        </>
      )}

      {value.recurrencia === "anual" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Cada</span>
            <select value={value.recurrencia_intervalo} onChange={e => onChange("recurrencia_intervalo", e.target.value)} style={{ ...controlStyle(inputHeight), width: 82 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{interval === 1 ? "ano" : "anos"}</span>
          </div>
          <Preview text={`Se repite cada ${interval} ${interval === 1 ? "ano" : "anos"} el ${annualDate} despues de completar esta Orden de Trabajo.`} />
        </>
      )}

      {value.recurrencia !== "ninguna" && (
        <div style={{ display: "grid", gap: 5, maxWidth: 240 }}>
          <span style={labelStyle}>Fin de recurrencia</span>
          <input
            type="date"
            value={value.recurrencia_fin}
            onChange={e => onChange("recurrencia_fin", e.target.value)}
            style={controlStyle(inputHeight)}
          />
        </div>
      )}
    </div>
  );
}

function WeekdayPicker({
  selected,
  onToggle,
  compact,
}: {
  selected: number[];
  onToggle: (day: number) => void;
  compact: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: compact ? 6 : 10, flexWrap: "wrap" }}>
      {WEEKDAYS.map(day => {
        const active = selected.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            onClick={() => onToggle(day.value)}
            style={{
              height: compact ? 36 : 50,
              minWidth: compact ? 50 : 72,
              padding: "0 14px",
              borderRadius: 6,
              border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
              background: active ? "var(--brand-tint)" : "var(--surface-1)",
              color: active ? "var(--brand)" : "var(--fg-1)",
              fontSize: compact ? 13 : 15,
              fontWeight: active ? 800 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

function Preview({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.45 }}>{text}</div>;
}

function weekdayNames(days: number[]) {
  return [...days]
    .sort()
    .map(day => WEEKDAYS.find(w => w.value === day)?.long ?? "")
    .filter(Boolean)
    .join(", ");
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--fg-3)",
};

function controlStyle(height: number): React.CSSProperties {
  return {
    height,
    padding: "0 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--fg-1)",
    outline: "none",
    background: "var(--surface-1)",
    fontFamily: "inherit",
  };
}
