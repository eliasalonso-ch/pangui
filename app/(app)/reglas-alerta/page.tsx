"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  Check,
  Flame,
  Loader2,
  PauseCircle,
  Timer,
  UserPlus,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase";

type UnitKey = "minutos" | "horas" | "dias";

interface ReglaAlerta {
  id: string;
  tipo: string;
  activa: boolean;
  umbral_minutos: number | null;
  es_obligatoria: boolean;
}

interface UsuarioWorkspace {
  workspace_id: string | null;
  rol: string | null;
}

const UNITS: Record<UnitKey, { label: string; toMinutes: (n: number) => number; fromMinutes: (m: number) => number }> = {
  minutos: { label: "min",   toMinutes: n => n,        fromMinutes: m => m },
  horas:   { label: "horas", toMinutes: n => n * 60,   fromMinutes: m => m / 60 },
  dias:    { label: "días",  toMinutes: n => n * 1440, fromMinutes: m => m / 1440 },
};

const RULE_META: Record<string, { label: string; description: string; icon: React.ElementType; color: string; preferredUnit: UnitKey }> = {
  ot_sin_asignar: {
    label: "OT sin asignar",
    description: "Alerta cuando una OT abierta sigue sin técnico asignado.",
    icon: UserPlus,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_abierta_sin_asignar: {
    label: "OT sin asignar",
    description: "Alerta cuando una OT abierta sigue sin técnico asignado.",
    icon: UserPlus,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_urgente_sin_asignar: {
    label: "OT urgente sin asignar",
    description: "Escala OTs urgentes que siguen sin responsable.",
    icon: Flame,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
  ot_alta_prioridad_abierta: {
    label: "OT urgente sin asignar",
    description: "Escala OTs urgentes que siguen sin responsable.",
    icon: Flame,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
  ot_vencida: {
    label: "OT vencida sin cerrar",
    description: "Alerta cuando la fecha de vencimiento ya pasó y la OT no está completada.",
    icon: AlertCircle,
    color: "var(--danger)",
    preferredUnit: "dias",
  },
  ot_bloqueada: {
    label: "OT bloqueada demasiado",
    description: "Detecta órdenes en espera por más tiempo del permitido.",
    icon: PauseCircle,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_en_espera_prolongada: {
    label: "OT bloqueada demasiado",
    description: "Detecta órdenes en espera por más tiempo del permitido.",
    icon: PauseCircle,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_en_curso_inactiva: {
    label: "OT en curso sin avance",
    description: "Alerta cuando una OT queda en ejecución demasiado tiempo.",
    icon: Zap,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
  ot_en_curso_detenida: {
    label: "OT en curso sin avance",
    description: "Alerta cuando una OT queda en ejecución demasiado tiempo.",
    icon: Zap,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
  ot_abierta_sin_progreso: {
    label: "OT abierta sin progreso",
    description: "Alerta cuando una OT abierta no registra avance después del umbral.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  timer_sin_iniciar: {
    label: "Timer no iniciado",
    description: "Recuerda iniciar el timer cuando una OT sigue sin ejecución.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "minutos",
  },
  timer_inactivo_tecnico: {
    label: "Timer inactivo técnico",
    description: "Alerta operacional por timer inactivo a nivel técnico.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "minutos",
  },
  timer_inactivo_supervisor: {
    label: "Timer inactivo supervisor",
    description: "Escala timers inactivos hacia supervisión.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "minutos",
  },
  timer_inactivo_manager: {
    label: "Timer inactivo manager",
    description: "Escala timers inactivos hacia administración.",
    icon: Timer,
    color: "var(--danger)",
    preferredUnit: "minutos",
  },
};

const SUPPORTED_RULE_TYPES = new Set([
  "ot_vencida",
  "ot_sin_asignar",
  "ot_abierta_sin_asignar",
  "ot_urgente_sin_asignar",
  "ot_alta_prioridad_abierta",
  "ot_abierta_sin_progreso",
]);

function bestUnit(minutes: number | null, preferred: UnitKey): UnitKey {
  const value = minutes ?? 0;
  if (value <= 0) return preferred;
  if (value >= 1440 && value % 1440 === 0) return "dias";
  if (value >= 60 && value % 60 === 0) return "horas";
  return "minutos";
}

function displayThreshold(minutes: number | null, preferred: UnitKey) {
  if (!minutes || minutes <= 0) return "Inmediata";
  const unit = bestUnit(minutes, preferred);
  const value = UNITS[unit].fromMinutes(minutes);
  return `${value} ${UNITS[unit].label}`;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        border: "none",
        borderRadius: 999,
        padding: 2,
        background: checked ? "var(--brand)" : "var(--border-strong)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--surface-1)", boxShadow: "0 1px 3px rgba(15,23,42,.22)" }} />
    </button>
  );
}

function RuleCard({
  regla,
  saving,
  onPatch,
}: {
  regla: ReglaAlerta;
  saving: boolean;
  onPatch: (id: string, patch: Partial<ReglaAlerta>) => void;
}) {
  const meta = RULE_META[regla.tipo] ?? {
    label: regla.tipo,
    description: "Regla operacional configurada para este workspace.",
    icon: BellRing,
    color: "var(--brand)",
    preferredUnit: "horas" as UnitKey,
  };
  const Icon = meta.icon;
  const currentUnit = bestUnit(regla.umbral_minutos, meta.preferredUnit);
  const [draftValue, setDraftValue] = useState(() => String(UNITS[currentUnit].fromMinutes(regla.umbral_minutos ?? 0)));
  const [draftUnit, setDraftUnit] = useState<UnitKey>(currentUnit);

  function commitThreshold() {
    const n = Number.parseInt(draftValue, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onPatch(regla.id, { umbral_minutos: UNITS[draftUnit].toMinutes(n) });
  }

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--surface-1)",
      opacity: regla.activa ? 1 : 0.62,
      overflow: "hidden",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            background: `${meta.color}18`,
            color: meta.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, color: "var(--fg-1)", fontSize: 14, fontWeight: 750 }}>{meta.label}</h2>
              {regla.es_obligatoria && (
                <span style={{ padding: "2px 7px", borderRadius: 999, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 10.5, fontWeight: 750 }}>
                  Obligatoria
                </span>
              )}
            </div>
            <p style={{ margin: "4px 0 0", color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.4 }}>{meta.description}</p>
            <p style={{ margin: "8px 0 0", color: "var(--fg-4)", fontSize: 11.5 }}>
              Umbral actual: <strong style={{ color: "var(--fg-2)" }}>{displayThreshold(regla.umbral_minutos, meta.preferredUnit)}</strong>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 12, color: regla.activa ? "var(--success)" : "var(--fg-4)", fontWeight: 700, paddingTop: 4 }}>
            {regla.activa ? "Activa" : "Inactiva"}
          </span>
          <Toggle checked={regla.activa} disabled={saving} onChange={activa => onPatch(regla.id, { activa })} />
        </div>
      </div>

      {regla.activa && (
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          background: "var(--surface-2)",
        }}>
          <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 650 }}>Alertar después de</span>
          <input
            type="number"
            min={0}
            value={draftValue}
            onChange={e => setDraftValue(e.target.value)}
            onBlur={commitThreshold}
            onKeyDown={e => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            style={{
              width: 76,
              height: 32,
              border: "1px solid var(--border)",
              borderRadius: 7,
              background: "var(--surface-1)",
              color: "var(--fg-1)",
              fontSize: 13,
              fontWeight: 700,
              padding: "0 9px",
              fontFamily: "inherit",
            }}
          />
          <select
            value={draftUnit}
            onChange={e => {
              const nextUnit = e.target.value as UnitKey;
              setDraftUnit(nextUnit);
              const n = Number.parseInt(draftValue, 10);
              if (Number.isFinite(n) && n >= 0) onPatch(regla.id, { umbral_minutos: UNITS[nextUnit].toMinutes(n) });
            }}
            style={{
              height: 32,
              border: "1px solid var(--border)",
              borderRadius: 7,
              background: "var(--surface-1)",
              color: "var(--fg-1)",
              fontSize: 13,
              fontWeight: 650,
              padding: "0 9px",
              fontFamily: "inherit",
            }}
          >
            {(Object.keys(UNITS) as UnitKey[]).map(unit => (
              <option key={unit} value={unit}>{UNITS[unit].label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function ReglasAlertaPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reglas, setReglas] = useState<ReglaAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await sb
        .from("usuarios")
        .select("workspace_id, rol")
        .eq("id", user.id)
        .maybeSingle<UsuarioWorkspace>();

      const canManage = ["admin", "jefe", "owner"].includes(profile?.rol ?? "");
      setIsAdmin(canManage);
      setWorkspaceId(profile?.workspace_id ?? null);

      if (!profile?.workspace_id || !canManage) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await sb
        .from("reglas_alerta_workspace")
        .select("id, tipo, activa, umbral_minutos, es_obligatoria")
        .eq("workspace_id", profile.workspace_id)
        .order("tipo");

      if (fetchError) setError("No se pudieron cargar las reglas de alerta.");
      setReglas(((data ?? []) as ReglaAlerta[]).filter(r => SUPPORTED_RULE_TYPES.has(r.tipo)));
      setLoading(false);
    }

    load();
  }, [router]);

  async function patchRegla(id: string, patch: Partial<ReglaAlerta>) {
    if (!workspaceId) return;
    const previous = reglas;
    setSavingId(id);
    setSaved(false);
    setError(null);
    setReglas(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

    const sb = createClient();
    const { error: updateError } = await sb
      .from("reglas_alerta_workspace")
      .update(patch)
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    setSavingId(null);
    if (updateError) {
      setReglas(previous);
      setError("No se pudo guardar el cambio.");
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  const { activas, inactivas } = useMemo(() => ({
    activas: reglas.filter(r => r.activa),
    inactivas: reglas.filter(r => !r.activa),
  }), [reglas]);

  if (loading) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--fg-4)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando reglas...</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", background: "var(--surface-0)" }}>
      <header style={{
        height: 56,
        padding: "0 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BellRing size={20} style={{ color: "var(--brand)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: saved ? "var(--success)" : "var(--fg-4)", fontSize: 12 }}>
          {savingId ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
          {savingId ? "Guardando..." : saved ? "Guardado" : "Se evalúan cada hora"}
        </div>
      </header>

      <main style={{ maxWidth: 1060, padding: "20px 24px 44px" }}>
        {!isAdmin ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", padding: 18, color: "var(--fg-2)", fontSize: 14 }}>
            Solo administradores y jefes pueden configurar reglas de alerta.
          </div>
        ) : (
          <>
            <p style={{ margin: "0 0 16px", maxWidth: 760, color: "var(--fg-3)", fontSize: 13, lineHeight: 1.55 }}>
              Configura cuándo se crean alertas operacionales automáticas para tu equipo.
              Los cambios se aplican en la próxima ejecución del cron horario.
            </p>

            {error && (
              <div style={{ marginBottom: 14, padding: "10px 12px", border: "1px solid var(--danger)", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, fontWeight: 650 }}>
                {error}
              </div>
            )}

            <section>
              <h2 style={{ margin: "0 0 10px", color: "var(--fg-3)", fontSize: 11, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0 }}>
                Activas ({activas.length})
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
                {activas.length === 0 ? (
                  <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 18, color: "var(--fg-4)", fontSize: 13 }}>No hay reglas activas.</div>
                ) : activas.map(regla => (
                  <RuleCard key={regla.id} regla={regla} saving={savingId === regla.id} onPatch={patchRegla} />
                ))}
              </div>
            </section>

            {inactivas.length > 0 && (
              <section style={{ marginTop: 26 }}>
                <h2 style={{ margin: "0 0 10px", color: "var(--fg-3)", fontSize: 11, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0 }}>
                  Inactivas ({inactivas.length})
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
                  {inactivas.map(regla => (
                    <RuleCard key={regla.id} regla={regla} saving={savingId === regla.id} onPatch={patchRegla} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
