"use client";

import type { Recurrencia, RecurrenciaConfig } from "@/types/ordenes";

// Web recurrence UI, mirrored from the mobile app (RecurrenceRows.tsx):
//   • "Repetir"  → a preset list (Nunca, Cada día, Entre semana, … Cada año).
//   • "Terminar repetición" → Nunca / En una fecha.
//   • "Fecha de fin" → only shown when "En una fecha" is selected.
// Each preset resolves to a (recurrencia, config) pair the DB advancer already
// understands; an end date promotes the preset to its "personalizada" form
// since end_date only lives on the config object.

export interface RecurrenceDraft {
  recurrencia: Recurrencia;
  recurrencia_config: RecurrenciaConfig | null;
  fecha_inicio: string;
}

// ── Presets (same set + mapping as the mobile app) ───────────────────────────
type PresetKey =
  | "nunca" | "diaria" | "entre_semana" | "fines_semana" | "semanal"
  | "dos_semanas" | "mensual" | "tres_meses" | "seis_meses" | "anual";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "nunca",        label: "Nunca" },
  { key: "diaria",       label: "Cada día" },
  { key: "entre_semana", label: "Entre semana" },
  { key: "fines_semana", label: "Fines de semana" },
  { key: "semanal",      label: "Cada semana" },
  { key: "dos_semanas",  label: "Cada dos semanas" },
  { key: "mensual",      label: "Cada mes" },
  { key: "tres_meses",   label: "Cada 3 meses" },
  { key: "seis_meses",   label: "Cada 6 meses" },
  { key: "anual",        label: "Cada año" },
];

function presetToValue(key: PresetKey): { recurrencia: Recurrencia; config: RecurrenciaConfig | null } {
  switch (key) {
    case "nunca":        return { recurrencia: "ninguna", config: null };
    case "diaria":       return { recurrencia: "diaria", config: null };
    case "semanal":      return { recurrencia: "semanal", config: { interval: 1, unit: "week" } };
    case "mensual":      return { recurrencia: "mensual_fecha", config: { interval: 1, unit: "month" } };
    case "anual":        return { recurrencia: "anual", config: { interval: 1, unit: "year" } };
    case "entre_semana": return { recurrencia: "personalizada", config: { interval: 1, unit: "week", weekdays: [1], preset: "entre_semana" } };
    case "fines_semana": return { recurrencia: "personalizada", config: { interval: 1, unit: "week", weekdays: [6], preset: "fines_semana" } };
    case "dos_semanas":  return { recurrencia: "personalizada", config: { interval: 2, unit: "week", preset: "dos_semanas" } };
    case "tres_meses":   return { recurrencia: "personalizada", config: { interval: 3, unit: "month", preset: "tres_meses" } };
    case "seis_meses":   return { recurrencia: "personalizada", config: { interval: 6, unit: "month", preset: "seis_meses" } };
  }
}

export function valueToPreset(recurrencia: Recurrencia, config: RecurrenciaConfig | null | undefined): PresetKey {
  switch (recurrencia) {
    case "ninguna":       return "nunca";
    case "diaria":        return "diaria";
    case "semanal":       return "semanal";
    case "quincenal":     return "dos_semanas";
    case "mensual":
    case "mensual_fecha":
    case "mensual_dia":   return "mensual";
    case "anual":         return "anual";
    case "personalizada": {
      if (!config) return "semanal";
      if (config.preset) return config.preset;
      const { interval, unit, weekdays } = config;
      if (unit === "week" && interval === 1 && weekdays?.length === 5 && [1, 2, 3, 4, 5].every(d => weekdays.includes(d))) return "entre_semana";
      if (unit === "week" && interval === 1 && weekdays?.length === 2 && [0, 6].every(d => weekdays.includes(d))) return "fines_semana";
      if (unit === "week" && interval === 2) return "dos_semanas";
      if (unit === "month" && interval === 3) return "tres_meses";
      if (unit === "month" && interval === 6) return "seis_meses";
      if (unit === "day") return "diaria";
      if (unit === "week") return "semanal";
      if (unit === "month") return "mensual";
      if (unit === "year") return "anual";
      return "semanal";
    }
  }
}

// Plain interval/unit config for a non-custom recurrencia, used when an end date
// forces promotion to personalizada.
function recurrenciaToConfig(rec: Recurrencia): RecurrenciaConfig {
  switch (rec) {
    case "diaria":        return { interval: 1, unit: "day" };
    case "semanal":       return { interval: 1, unit: "week" };
    case "quincenal":     return { interval: 2, unit: "week" };
    case "mensual":
    case "mensual_fecha":
    case "mensual_dia":   return { interval: 1, unit: "month" };
    case "anual":         return { interval: 1, unit: "year" };
    default:              return { interval: 1, unit: "week" };
  }
}

// Setting/clearing an end date may promote a preset to personalizada (since
// end_date only exists on the config object).
function withEndDate(rec: Recurrencia, cfg: RecurrenciaConfig | null, end: string | null): { recurrencia: Recurrencia; config: RecurrenciaConfig | null } {
  if (!end) {
    if (cfg) return { recurrencia: rec, config: { ...cfg, end_date: null } };
    return { recurrencia: rec, config: null };
  }
  const baseCfg: RecurrenciaConfig = cfg ?? recurrenciaToConfig(rec);
  return { recurrencia: "personalizada", config: { ...baseCfg, end_date: end } };
}

// Pulls the stored config out of the form for the create/edit save calls. The
// form already holds the exact (recurrencia, config) the UI built, so this just
// nulls it out when not repeating.
export function buildRecurrenciaConfig(form: { recurrencia: Recurrencia; recurrencia_config: RecurrenciaConfig | null }): RecurrenciaConfig | null {
  if (form.recurrencia === "ninguna") return null;
  return form.recurrencia_config;
}

export function RecurrenceControls({
  value,
  onChange,
  compact = false,
}: {
  value: RecurrenceDraft;
  onChange: (next: Pick<RecurrenceDraft, "recurrencia" | "recurrencia_config">) => void;
  compact?: boolean;
}) {
  const currentPreset = valueToPreset(value.recurrencia, value.recurrencia_config);
  const repeats = currentPreset !== "nunca";
  const endDate = value.recurrencia_config?.end_date ?? "";
  const gap = compact ? 10 : 12;
  const ctrl = controlStyle(compact);
  const lbl = labelStyle(compact);

  function selectPreset(key: PresetKey) {
    const base = presetToValue(key);
    if (key === "nunca") {
      onChange({ recurrencia: "ninguna", recurrencia_config: null });
      return;
    }
    const anchor = value.fecha_inicio ? new Date(`${value.fecha_inicio.slice(0, 10)}T12:00:00`) : new Date();
    const allowed = key === "entre_semana" ? [1, 2, 3, 4, 5] : key === "fines_semana" ? [6, 0] : null;
    const existingWeekday = value.recurrencia_config?.weekdays?.[0];
    const weekday = existingWeekday != null && (!allowed || allowed.includes(existingWeekday))
      ? existingWeekday
      : allowed?.includes(anchor.getDay()) ? anchor.getDay() : allowed?.[0] ?? anchor.getDay();
    const dayOfMonth = value.recurrencia_config?.day_of_month ?? value.recurrencia_config?.month_day ?? anchor.getDate();
    const cfg = base.config ? { ...base.config } : null;
    if (cfg?.unit === "week") cfg.weekdays = [weekday];
    if (cfg?.unit === "month") cfg.day_of_month = dayOfMonth;
    if (cfg?.unit === "year") cfg.anchor_date = value.fecha_inicio || anchor.toISOString().slice(0, 10);
    const keepEnd = value.recurrencia_config?.end_date ?? null;
    const next = withEndDate(base.recurrencia, cfg, keepEnd);
    onChange({ recurrencia: next.recurrencia, recurrencia_config: next.config });
  }

  const weekdayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const weekdayPresets: PresetKey[] = ["semanal", "entre_semana", "fines_semana", "dos_semanas"];
  const monthPresets: PresetKey[] = ["mensual", "tres_meses", "seis_meses"];
  const selectedWeekday = value.recurrencia_config?.weekdays?.[0] ?? (value.fecha_inicio ? new Date(`${value.fecha_inicio.slice(0, 10)}T12:00:00`).getDay() : new Date().getDay());
  const selectableWeekdays = currentPreset === "entre_semana" ? [1, 2, 3, 4, 5] : currentPreset === "fines_semana" ? [6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const selectedMonthDay = value.recurrencia_config?.day_of_month ?? value.recurrencia_config?.month_day ?? (value.fecha_inicio ? new Date(`${value.fecha_inicio.slice(0, 10)}T12:00:00`).getDate() : new Date().getDate());

  function setEndDate(end: string | null) {
    const next = withEndDate(value.recurrencia, value.recurrencia_config, end || null);
    onChange({ recurrencia: next.recurrencia, recurrencia_config: next.config });
  }

  // "Terminar repetición": "nunca" clears the end date; "fecha" seeds a default
  // (one month out) so the date field has a value and the config is valid.
  function setEndMode(mode: "nunca" | "fecha") {
    if (mode === "nunca") { setEndDate(null); return; }
    if (endDate) return;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setEndDate(d.toISOString().slice(0, 10));
  }

  return (
    <div style={{ display: "grid", gap }}>
      {/* Repetir */}
      <div style={{ display: "grid", gap: 6 }}>
        <span style={lbl}>Repetir</span>
        <select
          value={currentPreset}
          onChange={e => selectPreset(e.target.value as PresetKey)}
          style={ctrl}
        >
          {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {weekdayPresets.includes(currentPreset) && (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Día de la semana</span>
          <select value={selectedWeekday} onChange={e => {
            const interval = currentPreset === "dos_semanas" ? 2 : 1;
            const preset = currentPreset === "semanal" ? null : currentPreset as RecurrenciaConfig["preset"];
            onChange({ recurrencia: currentPreset === "semanal" ? "semanal" : "personalizada", recurrencia_config: { ...value.recurrencia_config, interval, unit: "week", weekdays: [Number(e.target.value)], preset } });
          }} style={ctrl}>
            {selectableWeekdays.map(day => <option key={day} value={day}>{weekdayNames[day]}</option>)}
          </select>
        </div>
      )}

      {monthPresets.includes(currentPreset) && (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Día del mes</span>
          <select value={selectedMonthDay} onChange={e => {
            const interval = currentPreset === "tres_meses" ? 3 : currentPreset === "seis_meses" ? 6 : 1;
            const preset = currentPreset === "mensual" ? null : currentPreset as RecurrenciaConfig["preset"];
            onChange({ recurrencia: currentPreset === "mensual" ? "mensual_fecha" : "personalizada", recurrencia_config: { ...value.recurrencia_config, interval, unit: "month", day_of_month: Number(e.target.value), preset } });
          }} style={ctrl}>
            {Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>Día {index + 1}</option>)}
          </select>
        </div>
      )}

      {/* Terminar repetición + Fecha de fin (only when it repeats) */}
      {repeats && (
        <>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={lbl}>Terminar repetición</span>
            <select
              value={endDate ? "fecha" : "nunca"}
              onChange={e => setEndMode(e.target.value as "nunca" | "fecha")}
              style={ctrl}
            >
              <option value="nunca">Nunca</option>
              <option value="fecha">En una fecha</option>
            </select>
          </div>

          {endDate && (
            <div style={{ display: "grid", gap: 6, maxWidth: 240 }}>
              <span style={lbl}>Fecha de fin</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={ctrl}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Label matches the form's uppercase sub-labels (e.g. "Tipo de trabajo").
function labelStyle(compact: boolean): React.CSSProperties {
  return {
    fontSize: compact ? 11 : 12,
    fontWeight: 600,
    color: "var(--fg-3)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
}

// Mirrors the app's sibling native <select>s exactly so the chevron and box
// line up: compact (create forms) = 36/radius 6/13.5; full (edit panel) = 40/8/13.
function controlStyle(compact: boolean): React.CSSProperties {
  return {
    height: compact ? 36 : 40,
    padding: compact ? "0 8px" : "0 12px",
    border: "1px solid var(--border)",
    borderRadius: compact ? 6 : 8,
    fontSize: compact ? 13.5 : 13,
    color: "var(--fg-1)",
    outline: "none",
    background: "var(--surface-1)",
    fontFamily: "inherit",
  };
}
