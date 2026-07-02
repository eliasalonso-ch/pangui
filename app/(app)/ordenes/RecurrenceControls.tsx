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
    case "semanal":      return { recurrencia: "semanal", config: null };
    case "mensual":      return { recurrencia: "mensual_fecha", config: null };
    case "anual":        return { recurrencia: "anual", config: null };
    case "entre_semana": return { recurrencia: "personalizada", config: { interval: 1, unit: "week", weekdays: [1, 2, 3, 4, 5] } };
    case "fines_semana": return { recurrencia: "personalizada", config: { interval: 1, unit: "week", weekdays: [0, 6] } };
    case "dos_semanas":  return { recurrencia: "personalizada", config: { interval: 2, unit: "week" } };
    case "tres_meses":   return { recurrencia: "personalizada", config: { interval: 3, unit: "month" } };
    case "seis_meses":   return { recurrencia: "personalizada", config: { interval: 6, unit: "month" } };
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
    const keepEnd = value.recurrencia_config?.end_date ?? null;
    const next = withEndDate(base.recurrencia, base.config, keepEnd);
    onChange({ recurrencia: next.recurrencia, recurrencia_config: next.config });
  }

  function setEndDate(end: string | null) {
    const base = presetToValue(currentPreset);
    const next = withEndDate(base.recurrencia, base.config, end || null);
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
