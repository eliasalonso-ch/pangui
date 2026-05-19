// Schedule manager — embedded inside the Excel export dialog.
//
// Admin/owner only. Lets a workspace admin set up recurring email reports
// (weekly / monthly / yearly) that send the same .xlsx + a CSV companion
// to a list of recipients. The cron job builds and sends the files;
// recipients have a permanent inbox-resident copy independent of Pangui
// infrastructure (failsafe-by-design).
//
// This component owns: form state, API calls. It does NOT generate any
// Excel itself — that runs server-side in the Edge Function.

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Mail, AlertCircle, CheckCircle2, Loader2, X, ChevronDown, ChevronRight } from "lucide-react";

type Frequency = "weekly" | "monthly" | "yearly";
type Preset    = "todas" | "pendientes" | "sin_asignar" | "en_curso" | "urgentes" | "completadas" | "levantamientos";

interface Schedule {
  id: string;
  nombre: string;
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  hour_local: number;
  timezone: string;
  filter_preset: Preset;
  columns_json: Record<string, boolean>;
  recipients: string[];
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_ok: boolean | null;
  last_error: string | null;
}

interface ScheduleRun {
  id: string;
  schedule_id: string;
  started_at: string;
  ok: boolean | null;
  error_message: string | null;
  num_emails_sent: number;
  ordenes_count: number;
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "todas",          label: "Todas las órdenes" },
  { key: "pendientes",     label: "Pendientes y en espera" },
  { key: "sin_asignar",    label: "Sin asignar" },
  { key: "en_curso",       label: "En curso" },
  { key: "urgentes",       label: "Urgentes" },
  { key: "completadas",    label: "Completadas" },
  { key: "levantamientos", label: "Levantamientos" },
];

const DOW_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MES_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface Props {
  // Inherits the column selections from the parent dialog. New schedules
  // copy these as their "snapshot" of what to export.
  defaultColumns: Record<string, boolean>;
  // Caller's role — used to gate the form. Members see read-only list.
  canManage: boolean;
}

export function ExportScheduler({ defaultColumns, canManage }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runsBy, setRunsBy]       = useState<Record<string, ScheduleRun[]>>({});
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<Schedule | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/export-schedules", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error al cargar");
      setSchedules(j.schedules ?? []);
      setRunsBy(j.runs_by_schedule ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (expanded) void refresh(); }, [expanded]);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta programación? Los correos dejarán de enviarse.")) return;
    const res = await fetch(`/api/export-schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) void refresh();
    else { const j = await res.json(); alert(j.error ?? "No se pudo eliminar"); }
  }

  async function handleToggleActive(s: Schedule) {
    const res = await fetch("/api/export-schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    });
    if (res.ok) void refresh();
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "12px 20px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", color: "var(--fg-1)",
          fontSize: 13, fontWeight: 600, textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Mail size={14} style={{ color: "var(--brand-fg)" }} />
        Programar envíos automáticos
        {schedules.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--fg-4)", fontWeight: 400, marginLeft: "auto" }}>
            {schedules.filter(s => s.active).length} activas
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ padding: "0 20px 14px" }}>
          {!canManage && (
            <div style={{ fontSize: 12, color: "var(--fg-4)", padding: "8px 0" }}>
              Solo los administradores del workspace pueden crear o editar programaciones.
            </div>
          )}

          {error && (
            <div style={{
              padding: "8px 10px", background: "#FEE2E2", color: "#991B1B",
              borderRadius: 6, fontSize: 12, marginBottom: 8,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-4)", padding: "8px 0" }}>
              <Loader2 size={12} className="animate-spin" /> Cargando…
            </div>
          )}

          {!loading && schedules.length === 0 && !formOpen && (
            <div style={{ fontSize: 12, color: "var(--fg-4)", padding: "6px 0 8px" }}>
              No hay programaciones aún. Las programaciones envían el reporte por correo automáticamente; los archivos
              quedan en la bandeja de los destinatarios y no dependen de que Pangui esté en línea.
            </div>
          )}

          {/* Existing schedules */}
          {schedules.map(s => (
            <ScheduleRow
              key={s.id}
              s={s}
              runs={runsBy[s.id] ?? []}
              canManage={canManage}
              onEdit={() => { setEditing(s); setFormOpen(true); }}
              onDelete={() => void handleDelete(s.id)}
              onToggle={() => void handleToggleActive(s)}
            />
          ))}

          {/* Form */}
          {formOpen && canManage && (
            <ScheduleForm
              initial={editing}
              defaultColumns={defaultColumns}
              onClose={() => { setFormOpen(false); setEditing(null); }}
              onSaved={() => { setFormOpen(false); setEditing(null); void refresh(); }}
            />
          )}

          {!formOpen && canManage && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              style={{
                marginTop: 8, display: "flex", alignItems: "center", gap: 6,
                padding: "7px 12px", borderRadius: 7, border: "1px dashed var(--border)",
                background: "transparent", fontSize: 12, color: "var(--brand-fg)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={13} /> Nueva programación
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Single schedule row in the list ─────────────────────────────────────────

function ScheduleRow({ s, runs, canManage, onEdit, onDelete, onToggle }: {
  s: Schedule;
  runs: ScheduleRun[];
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const cadenceLabel = useMemo(() => {
    const hour = `${String(s.hour_local).padStart(2, "0")}:00`;
    if (s.frequency === "weekly")  return `Cada ${DOW_LABELS[s.day_of_week ?? 1].toLowerCase()} a las ${hour}`;
    if (s.frequency === "monthly") return `Día ${s.day_of_month} de cada mes a las ${hour}`;
    return `${s.day_of_month} de ${MES_LABELS[(s.month_of_year ?? 1) - 1]} a las ${hour}`;
  }, [s]);

  const presetLabel = PRESETS.find(p => p.key === s.filter_preset)?.label ?? s.filter_preset;
  const lastRun = runs[0];

  return (
    <div style={{
      padding: "12px 14px", marginBottom: 8, borderRadius: 8,
      border: "1px solid var(--border)", background: s.active ? "var(--surface-1)" : "var(--surface-2)",
      opacity: s.active ? 1 : 0.65,
    }}>
      {/* Top row: name + actions. Actions wrap below if the dialog is narrow. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)" }}>{s.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--fg-4)", marginTop: 3, lineHeight: 1.45 }}>
            {cadenceLabel} · {presetLabel} · {s.recipients.length} destinatario{s.recipients.length !== 1 ? "s" : ""}
          </div>
          {lastRun && (
            <div style={{ fontSize: 11, color: lastRun.ok ? "#15803D" : "#B91C1C", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              {lastRun.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
              Último envío: {new Date(lastRun.started_at).toLocaleString("es-CL")}
              {lastRun.ok ? ` · ${lastRun.ordenes_count} órdenes` : ` · ${lastRun.error_message ?? "error"}`}
            </div>
          )}
        </div>

        {canManage && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            <button
              type="button" onClick={onToggle}
              title={s.active ? "Pausar" : "Activar"}
              style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--fg-2)", fontFamily: "inherit" }}
            >{s.active ? "Pausar" : "Activar"}</button>
            <button
              type="button" onClick={onEdit}
              style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--fg-2)", fontFamily: "inherit" }}
            >Editar</button>
            <button
              type="button" onClick={onDelete}
              title="Eliminar"
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "#B91C1C" }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

function ScheduleForm({ initial, defaultColumns, onClose, onSaved }: {
  initial: Schedule | null;
  defaultColumns: Record<string, boolean>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "Reporte semanal");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number>(initial?.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(initial?.day_of_month ?? 1);
  const [monthOfYear, setMonthOfYear] = useState<number>(initial?.month_of_year ?? 1);
  const [hourLocal, setHourLocal] = useState<number>(initial?.hour_local ?? 9);
  const [preset, setPreset] = useState<Preset>(initial?.filter_preset ?? "todas");
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? []);
  const [recipientInput, setRecipientInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function addRecipient() {
    const v = recipientInput.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setError("Correo inválido"); return; }
    if (recipients.includes(v)) { setRecipientInput(""); return; }
    if (recipients.length >= 20) { setError("Máximo 20 destinatarios"); return; }
    setRecipients([...recipients, v]);
    setRecipientInput("");
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nombre: nombre.trim(),
        frequency,
        day_of_week: frequency === "weekly" ? dayOfWeek : null,
        day_of_month: frequency !== "weekly" ? dayOfMonth : null,
        month_of_year: frequency === "yearly" ? monthOfYear : null,
        hour_local: hourLocal,
        filter_preset: preset,
        columns_json: initial?.columns_json ?? defaultColumns,
        recipients,
        active: true,
      };
      const url = "/api/export-schedules";
      const res = initial
        ? await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: initial.id, ...payload }) })
        : await fetch(url, { method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      marginTop: 12, padding: "16px 18px", borderRadius: 10,
      border: "1px solid var(--brand-fg)", background: "var(--surface-2, var(--surface-1))",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)" }}>
          {initial ? "Editar programación" : "Nueva programación"}
        </div>
        <button type="button" onClick={onClose}
          style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-4)", borderRadius: 6 }}>
          <X size={14} />
        </button>
      </div>

      <Field label="Nombre">
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
          style={inputStyle} placeholder="Ej. Reporte semanal de mantenimiento" />
      </Field>

      <Field label="Frecuencia">
        <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)} style={inputStyle}>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
          <option value="yearly">Anual</option>
        </select>
      </Field>

      {frequency === "weekly" && (
        <Field label="Día de la semana">
          <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={inputStyle}>
            {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
      )}

      {(frequency === "monthly" || frequency === "yearly") && (
        <Field label="Día del mes (1–31)">
          <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} style={inputStyle} />
        </Field>
      )}

      {frequency === "yearly" && (
        <Field label="Mes">
          <select value={monthOfYear} onChange={e => setMonthOfYear(Number(e.target.value))} style={inputStyle}>
            {MES_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </Field>
      )}

      <Field label="Hora (Chile, 0–23)">
        <input type="number" min={0} max={23} value={hourLocal} onChange={e => setHourLocal(Number(e.target.value))} style={inputStyle} />
      </Field>

      <Field label="Qué incluir">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map(p => (
            <button
              key={p.key} type="button" onClick={() => setPreset(p.key)}
              style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 999,
                border: preset === p.key ? "1px solid var(--brand)" : "1px solid var(--border)",
                background: preset === p.key ? "var(--brand)" : "transparent",
                color: preset === p.key ? "var(--surface-1)" : "var(--fg-2)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >{p.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Destinatarios (correos)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
          {recipients.map(r => (
            <span key={r} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "var(--surface-hover)", color: "var(--fg-2)", display: "flex", alignItems: "center", gap: 4 }}>
              {r}
              <button type="button" onClick={() => setRecipients(recipients.filter(x => x !== r))}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, color: "var(--fg-4)" }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            type="email" value={recipientInput} onChange={e => setRecipientInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
            placeholder="correo@ejemplo.cl  (Enter para agregar)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={addRecipient}
            style={{ fontSize: 11, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--fg-2)" }}>
            Agregar
          </button>
        </div>
      </Field>

      {error && (
        <div style={{ padding: "6px 8px", marginTop: 6, background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertCircle size={11} /> {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
        <button type="button" onClick={onClose}
          style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--fg-2)" }}>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={saving || recipients.length === 0 || !nombre.trim()}
          style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "none",
            background: saving || recipients.length === 0 || !nombre.trim() ? "var(--border-strong)" : "var(--brand)",
            color: "var(--surface-1)", fontWeight: 600,
            cursor: saving || recipients.length === 0 || !nombre.trim() ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>
          {saving ? <><Loader2 size={11} className="animate-spin" />Guardando…</> : (initial ? "Guardar cambios" : "Crear")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, padding: "0 10px",
  fontSize: 13, fontFamily: "inherit",
  borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--surface-1)", color: "var(--fg-1)",
};
