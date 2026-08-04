"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  Boxes,
  Check,
  ClipboardCheck,
  Flame,
  Loader2,
  PauseCircle,
  Search,
  Timer,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { esAdmin } from "@/lib/roles";
import AppLoadingState from "@/components/AppLoadingState";

// Las unidades espejan las de la app móvil (regla-alerta/[id].tsx) para que el
// mismo umbral se lea igual en los dos clientes.
type UnitKey = "horas" | "diaria" | "semanal" | "mensual" | "anual";

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

interface UsuarioOption {
  id: string;
  nombre: string | null;
  cargo: string | null;
}

const UNITS: { key: UnitKey; label: string; singular: string; plural: string; multiplier: number }[] = [
  { key: "horas",   label: "Horas",   singular: "hora",   plural: "horas",   multiplier: 60 },
  { key: "diaria",  label: "Diaria",  singular: "día",    plural: "días",    multiplier: 1440 },
  { key: "semanal", label: "Semanal", singular: "semana", plural: "semanas", multiplier: 10080 },
  { key: "mensual", label: "Mensual", singular: "mes",    plural: "meses",   multiplier: 43200 },
  { key: "anual",   label: "Anual",   singular: "año",    plural: "años",    multiplier: 525600 },
];

const unitByKey = (key: UnitKey) => UNITS.find(u => u.key === key)!;

// Espejo de features/notifications/alert-rules.ts en la app móvil. Los dos
// clientes muestran las mismas reglas con el mismo texto.
//
// `condicion` marca las reglas por evento: se disparan cuando ocurre algo, no
// después de un plazo, así que no tienen umbral configurable. Móvil las trata
// igual (regla-alerta/[id].tsx no escribe umbral_minutos para estos tipos).
type RuleMeta = {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  preferredUnit: UnitKey;
  /** Solo en reglas por evento: resumen corto, espejo de thresholdLabel() en móvil. */
  resumen?: string;
  condicion?: { titulo: string; nota: string };
};

const RULE_META: Record<string, RuleMeta> = {
  procedimiento_completado: {
    label: "Procedimiento completado",
    description: "Avisa cuando un usuario completa un procedimiento que tiene activada esta notificación.",
    icon: ClipboardCheck,
    color: "var(--brand)",
    preferredUnit: "horas",
    resumen: "Al completar",
    condicion: {
      titulo: "Un usuario completa el procedimiento",
      nota: "Se activa solamente en los procedimientos que tengan habilitado Avisar al completar.",
    },
  },
  inventario_stock_bajo: {
    label: "Stock bajo en inventario",
    description: "Avisa cuando un material alcanza o baja de su stock mínimo configurado.",
    icon: Boxes,
    color: "var(--warning)",
    preferredUnit: "diaria",
    resumen: "Según stock mínimo",
    condicion: {
      titulo: "Stock actual igual o menor al mínimo",
      nota: "El límite se configura individualmente en la información de cada material.",
    },
  },
  ot_abierta_sin_progreso: {
    label: "OT abierta sin progreso",
    description: "Avisa cuando una OT asignada no registra cambios después del umbral.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_bloqueada: {
    label: "OT en espera demasiado",
    description: "Avisa cuando una OT permanece en espera más tiempo del permitido.",
    icon: PauseCircle,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_en_curso_inactiva: {
    label: "OT en curso sin avance",
    description: "Avisa cuando una OT en ejecución no registra actividad reciente.",
    icon: Zap,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
  ot_sin_asignar: {
    label: "OT sin asignar",
    description: "Avisa cuando una OT abierta sigue sin responsable.",
    icon: UserPlus,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  ot_urgente_sin_asignar: {
    label: "OT urgente sin asignar",
    description: "Escala una OT urgente que todavía no tiene responsable.",
    icon: Flame,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
  ot_vencida: {
    label: "OT vencida sin cerrar",
    description: "Avisa cuando pasó la fecha de término y la OT continúa abierta.",
    icon: AlertCircle,
    color: "var(--danger)",
    preferredUnit: "diaria",
  },
  timer_inactivo_tecnico: {
    label: "Timer inactivo técnico",
    description: "Recuerda al técnico iniciar el timer de una OT asignada.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  timer_inactivo_supervisor: {
    label: "Timer inactivo supervisor",
    description: "Escala timers inactivos hacia supervisión.",
    icon: Timer,
    color: "var(--warning)",
    preferredUnit: "horas",
  },
  timer_inactivo_manager: {
    label: "Timer inactivo manager",
    description: "Escala timers inactivos hacia administración.",
    icon: Timer,
    color: "var(--danger)",
    preferredUnit: "horas",
  },
};

function ruleMeta(tipo: string): RuleMeta {
  return RULE_META[tipo] ?? {
    label: tipo,
    description: "Configura el momento en que se enviará esta alerta.",
    icon: BellRing,
    color: "var(--brand)",
    preferredUnit: "horas" as UnitKey,
  };
}

// Misma heurística que initialFrequency() en móvil: elige la unidad más grande
// que divida exacto, para que 1440 se lea "1 día" y no "24 horas".
function initialUnit(minutes: number | null, preferred: UnitKey): UnitKey {
  const value = minutes ?? 0;
  if (value <= 0) return preferred;
  for (const unit of [...UNITS].reverse()) {
    if (value >= unit.multiplier && value % unit.multiplier === 0) return unit.key;
  }
  return "horas";
}

function displayThreshold(minutes: number | null, preferred: UnitKey) {
  if (!minutes || minutes <= 0) return "Inmediata";
  const unit = unitByKey(initialUnit(minutes, preferred));
  const value = Math.round(minutes / unit.multiplier);
  return `${value} ${value === 1 ? unit.singular : unit.plural}`;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
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
        flexShrink: 0,
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--surface-1)", boxShadow: "0 1px 3px rgba(15,23,42,.22)" }} />
    </button>
  );
}

function Notice({ kind, onClose, children }: { kind: "ok" | "err"; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: "var(--r-md)",
      background: kind === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
      border: `1px solid ${kind === "ok" ? "var(--success)" : "var(--danger)"}`,
      color: kind === "ok" ? "var(--st-done-fg)" : "var(--danger)",
      fontSize: 13,
      fontWeight: 500,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      {kind === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}
      {children}
      {onClose && (
        <button type="button" onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Selector de destinatarios. Sin filas en reglas_alerta_usuarios la alerta va a
 *  todo el equipo; con filas, solo a los usuarios elegidos. Misma semántica que
 *  la pantalla `regla-alerta/usuarios` en móvil. */
function RecipientsPicker({
  reglaId,
  workspaceId,
  usuarios,
  selected,
  onChange,
  onError,
}: {
  reglaId: string;
  workspaceId: string;
  usuarios: UsuarioOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    if (!needle) return usuarios;
    return usuarios.filter(u =>
      (u.nombre ?? "").toLocaleLowerCase("es").includes(needle) ||
      (u.cargo ?? "").toLocaleLowerCase("es").includes(needle)
    );
  }, [query, usuarios]);

  async function selectAll() {
    const previous = new Set(selected);
    setBusy(true);
    onChange(new Set());
    const sb = createClient();
    const { error } = await sb.from("reglas_alerta_usuarios").delete().eq("regla_id", reglaId);
    setBusy(false);
    if (error) {
      onChange(previous);
      onError("No se pudo guardar el cambio de destinatarios.");
    }
  }

  async function toggle(usuarioId: string) {
    const previous = new Set(selected);
    const next = new Set(selected);
    const removing = next.has(usuarioId);
    if (removing) next.delete(usuarioId);
    else next.add(usuarioId);

    setBusy(true);
    onChange(next);
    const sb = createClient();
    const { error } = removing
      ? await sb.from("reglas_alerta_usuarios").delete().eq("regla_id", reglaId).eq("usuario_id", usuarioId)
      : await sb.from("reglas_alerta_usuarios").insert({ regla_id: reglaId, usuario_id: usuarioId, workspace_id: workspaceId });
    setBusy(false);
    if (error) {
      onChange(previous);
      onError("No se pudo guardar el cambio de destinatarios.");
    }
  }

  const todos = selected.size === 0;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Users size={13} style={{ color: "var(--fg-3)" }} />
        <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 650 }}>Destinatarios</span>
        <span style={{ fontSize: 12, color: "var(--fg-4)" }}>
          {todos ? "Todo el equipo" : `${selected.size} ${selected.size === 1 ? "usuario" : "usuarios"}`}
        </span>
        {!todos && (
          <button
            type="button"
            onClick={selectAll}
            disabled={busy}
            style={{
              marginLeft: "auto",
              height: 26,
              padding: "0 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-2)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Enviar a todos
          </button>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)" }} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar usuarios"
          style={{
            width: "100%",
            height: 32,
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            background: "var(--surface-1)",
            color: "var(--fg-1)",
            fontSize: 12.5,
            padding: "0 9px 0 26px",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ maxHeight: 168, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)" }}>
        {filtered.length === 0 ? (
          <p style={{ margin: 0, padding: "12px 11px", fontSize: 12, color: "var(--fg-4)" }}>Sin resultados.</p>
        ) : filtered.map((u, idx) => {
          const checked = selected.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              disabled={busy}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                width: "100%",
                textAlign: "left",
                padding: "8px 11px",
                background: "transparent",
                border: "none",
                borderBottom: idx === filtered.length - 1 ? "none" : "1px solid var(--border)",
                cursor: busy ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: checked ? "none" : "1px solid var(--border-strong)",
                background: checked ? "var(--brand)" : "transparent",
                color: "var(--surface-1)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {checked && <Check size={11} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.nombre ?? "Sin nombre"}
                {u.cargo && <span style={{ color: "var(--fg-4)" }}> · {u.cargo}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: "var(--fg-4)", lineHeight: 1.45 }}>
        Sin usuarios seleccionados la alerta llega a todo el equipo.
      </p>
    </div>
  );
}

function RuleCard({
  regla,
  saving,
  usuarios,
  workspaceId,
  recipients,
  onRecipientsChange,
  onPatch,
  onError,
}: {
  regla: ReglaAlerta;
  saving: boolean;
  usuarios: UsuarioOption[];
  workspaceId: string;
  recipients: Set<string>;
  onRecipientsChange: (reglaId: string, next: Set<string>) => void;
  onPatch: (id: string, patch: Partial<ReglaAlerta>) => void;
  onError: (message: string) => void;
}) {
  const meta = ruleMeta(regla.tipo);
  const Icon = meta.icon;
  const currentUnit = initialUnit(regla.umbral_minutos, meta.preferredUnit);
  const [draftValue, setDraftValue] = useState(() =>
    String(Math.max(1, Math.round((regla.umbral_minutos ?? 0) / unitByKey(currentUnit).multiplier)))
  );
  const [draftUnit, setDraftUnit] = useState<UnitKey>(currentUnit);
  const [expanded, setExpanded] = useState(false);

  function commitThreshold() {
    const n = Number.parseInt(draftValue, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onPatch(regla.id, { umbral_minutos: n * unitByKey(draftUnit).multiplier });
  }

  return (
    <div style={{
      background: "var(--surface-1)",
      borderBottom: "1px solid var(--border)",
      overflow: "hidden",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(250px, 1fr) minmax(220px, 1.15fr) minmax(130px, .65fr) auto", alignItems: "center", gap: 14, padding: "13px 22px", opacity: regla.activa ? 1 : 0.58 }}>
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "var(--brand-tint)",
            color: "var(--brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: "var(--fg-1)", fontSize: 13.5, fontWeight: 600 }}>{meta.label}</h2>
            <p style={{ display: "none", margin: "4px 0 0", color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.45 }}>{meta.description}</p>
            <p style={{ display: "none", margin: "8px 0 0", color: "var(--fg-4)", fontSize: 11.5 }}>
              {meta.condicion ? (
                // Reglas por evento: mismo resumen que la lista en móvil.
                <>Se activa: <strong style={{ color: "var(--fg-2)" }}>{meta.resumen}</strong></>
              ) : (
                <>Umbral actual: <strong style={{ color: "var(--fg-2)" }}>{displayThreshold(regla.umbral_minutos, meta.preferredUnit)}</strong></>
              )}
            </p>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, color: "var(--fg-2)" }}>
            {meta.condicion ? meta.resumen : displayThreshold(regla.umbral_minutos, meta.preferredUnit)}
          </span>
          <button type="button" onClick={() => setExpanded(value => !value)} style={{ marginTop: 3, padding: 0, border: 0, background: "transparent", color: "var(--brand)", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
            {expanded ? "Cerrar configuración" : "Configurar"}
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
          {recipients.size === 0 ? "Todo el equipo" : `${recipients.size} ${recipients.size === 1 ? "usuario" : "usuarios"}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <Toggle checked={regla.activa} disabled={saving} onChange={activa => onPatch(regla.id, { activa })} />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 22px 18px 66px", background: "var(--surface-2)", display: "grid", gap: 14 }}>
          {meta.condicion ? (
            // Regla por evento: no hay umbral que configurar. Igual que en móvil,
            // se muestra la condición en solo lectura.
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 650 }}>Condición</span>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Check size={15} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: "var(--fg-1)" }}>{meta.condicion.titulo}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--fg-4)", lineHeight: 1.45 }}>{meta.condicion.nota}</p>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 650 }}>Alertar después de</span>
              <input
                type="number"
                min={1}
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                onBlur={commitThreshold}
                onKeyDown={e => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                style={{
                  width: 76,
                  height: 32,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface-1)",
                  color: "var(--fg-1)",
                  fontSize: 13,
                  fontWeight: 650,
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
                  if (Number.isFinite(n) && n >= 0) onPatch(regla.id, { umbral_minutos: n * unitByKey(nextUnit).multiplier });
                }}
                style={{
                  height: 32,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface-1)",
                  color: "var(--fg-1)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "0 9px",
                  fontFamily: "inherit",
                }}
              >
                {UNITS.map(unit => (
                  <option key={unit.key} value={unit.key}>{unit.label}</option>
                ))}
              </select>
            </div>
          )}

          <RecipientsPicker
            reglaId={regla.id}
            workspaceId={workspaceId}
            usuarios={usuarios}
            selected={recipients}
            onChange={next => onRecipientsChange(regla.id, next)}
            onError={onError}
          />
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
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [recipients, setRecipients] = useState<Record<string, Set<string>>>({});
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

      const canManage = esAdmin(profile?.rol ?? "");
      setIsAdmin(canManage);
      setWorkspaceId(profile?.workspace_id ?? null);

      if (!profile?.workspace_id || !canManage) {
        setLoading(false);
        return;
      }

      const [reglasRes, usuariosRes] = await Promise.all([
        sb.from("reglas_alerta_workspace")
          .select("id, tipo, activa, umbral_minutos, es_obligatoria")
          .eq("workspace_id", profile.workspace_id)
          .order("tipo"),
        sb.from("usuarios")
          .select("id, nombre, cargo")
          .eq("workspace_id", profile.workspace_id)
          .order("nombre"),
      ]);

      if (reglasRes.error) setError("No se pudieron cargar las reglas de alerta.");
      const rules = (reglasRes.data ?? []) as ReglaAlerta[];
      setReglas(rules);
      setUsuarios((usuariosRes.data ?? []) as UsuarioOption[]);

      // Destinatarios por regla. Una regla sin filas notifica a todo el equipo.
      if (rules.length > 0) {
        const { data: links } = await sb
          .from("reglas_alerta_usuarios")
          .select("regla_id, usuario_id")
          .in("regla_id", rules.map(r => r.id));
        const grouped: Record<string, Set<string>> = {};
        for (const row of (links ?? []) as { regla_id: string; usuario_id: string }[]) {
          (grouped[row.regla_id] ??= new Set()).add(row.usuario_id);
        }
        setRecipients(grouped);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  const handleRecipientsChange = useCallback((reglaId: string, next: Set<string>) => {
    setRecipients(prev => ({ ...prev, [reglaId]: next }));
  }, []);

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
    return <AppLoadingState label="Cargando reglas de alerta…" minHeight="60dvh" />;
  }

  return (
    <div style={{ minHeight: "100%", background: "var(--surface-canvas)" }}>
      <div style={{ padding: "28px 32px 64px", maxWidth: 1280, margin: "0 auto" }}>
          {!isAdmin ? (
            <div style={{
              margin: 20,
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: 20,
              color: "var(--fg-2)",
              fontSize: 14,
            }}>
              Solo administradores y propietarios pueden configurar reglas de alerta.
            </div>
          ) : (
            <>
              <section style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
                <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}><BellRing size={17} /></span>
                <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Alertas operacionales</h2>
                <p style={{ margin: 0, maxWidth: 800, color: "var(--fg-3)", fontSize: 12, lineHeight: 1.5 }}>
                  Configura cuándo se crean alertas operacionales automáticas para tu equipo y quién las recibe.
                  Los cambios se aplican en la próxima ejecución del cron horario.
                </p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(250px, 1fr) minmax(220px, 1.15fr) minmax(130px, .65fr) auto", gap: 14, padding: "10px 22px", background: "var(--surface-2)", color: "var(--fg-4)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>Nombre</span><span>Condición</span><span>Destinatarios</span><span style={{ textAlign: "right" }}>Activo</span>
              </div>

              {error && <div style={{ margin: "12px 20px 0" }}><Notice kind="err" onClose={() => setError(null)}>{error}</Notice></div>}

              <div>
                <p style={{ display: "none", fontSize: 11, fontWeight: 700, color: "var(--fg-4)", margin: 0, padding: "10px 20px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>
                  Activas ({activas.length})
                </p>
                <div>
                  {activas.length === 0 ? (
                    <div style={{ padding: 20, background: "var(--surface-1)", borderBottom: "1px solid var(--border)", color: "var(--fg-4)", fontSize: 13 }}>
                      No hay reglas activas.
                    </div>
                  ) : activas.map(regla => (
                    <RuleCard
                      key={regla.id}
                      regla={regla}
                      saving={savingId === regla.id}
                      usuarios={usuarios}
                      workspaceId={workspaceId ?? ""}
                      recipients={recipients[regla.id] ?? new Set()}
                      onRecipientsChange={handleRecipientsChange}
                      onPatch={patchRegla}
                      onError={setError}
                    />
                  ))}
                </div>
              </div>

              {inactivas.length > 0 && (
                <div>
                  <p style={{ display: "none", fontSize: 11, fontWeight: 700, color: "var(--fg-4)", margin: 0, padding: "10px 20px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>
                    Inactivas ({inactivas.length})
                  </p>
                  <div>
                    {inactivas.map(regla => (
                      <RuleCard
                        key={regla.id}
                        regla={regla}
                        saving={savingId === regla.id}
                        usuarios={usuarios}
                        workspaceId={workspaceId ?? ""}
                        recipients={recipients[regla.id] ?? new Set()}
                        onRecipientsChange={handleRecipientsChange}
                        onPatch={patchRegla}
                        onError={setError}
                      />
                    ))}
                  </div>
                </div>
              )}
              </section>
              <div style={{ marginTop: 10, minHeight: 20, display: "flex", justifyContent: "flex-end" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, color: saved ? "var(--success)" : "var(--fg-4)", fontSize: 12 }}>
                  {savingId ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
                  {savingId ? "Guardando..." : saved ? "Guardado" : "Se evalúan cada hora"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
  );
}
