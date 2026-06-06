/**
 * evaluar-alertas — Cron-triggered edge function
 *
 * Evaluates all active alert rules across workspaces and sends push
 * notifications exactly once per (OT, alert-type) condition.
 *
 * Duplicate prevention:
 *   - Before sending, we attempt to INSERT into notifications_alertas_log
 *     with a UNIQUE partial index on (work_order_id, type) WHERE resolved_at IS NULL.
 *   - If the row already exists (conflict) the notification is skipped.
 *   - When a condition clears, we set resolved_at = now() so the next
 *     occurrence can fire again.
 *
 * Intended invocation: Supabase cron every 60 minutes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withCronMonitor } from "../_shared/sentry-cron.ts";

const ACTIVE_ALERT_TYPES = new Set<AlertType>([
  "ot_vencida",
  "ot_sin_asignar",
  "ot_abierta_sin_asignar",
  "ot_urgente_sin_asignar",
  "ot_alta_prioridad_abierta",
  "ot_abierta_sin_progreso",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertType =
  | "ot_abierta_sin_asignar"
  | "ot_en_curso_detenida"
  | "ot_vencida"
  | "ot_en_espera_prolongada"
  | "ot_alta_prioridad_abierta"
  | "timer_sin_iniciar"
  | "ot_sin_asignar"
  | "ot_urgente_sin_asignar"
  | "ot_bloqueada"
  | "ot_abierta_sin_progreso"
  | "ot_en_curso_inactiva"
  | "timer_inactivo_tecnico"
  | "timer_inactivo_supervisor"
  | "timer_inactivo_manager";

interface ReglaAlerta {
  id: string;
  workspace_id: string;
  tipo: AlertType;
  activa: boolean;
  umbral_minutos: number;
  rol_destino: string | null;
}

interface OrdenTrabajo {
  id: string;
  titulo: string;
  estado: string;
  prioridad: string | null;
  asignados_ids: string[] | null;
  en_ejecucion: boolean;
  iniciado_at: string | null;
  fecha_termino: string | null;
  created_at: string;
  workspace_id: string;
  creado_por: string;
}

interface UsuarioRow {
  id: string;
  workspace_id: string;
  rol: string | null;
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter(Boolean))] as string[];
}

function workspaceUsersByRole(users: UsuarioRow[], roles: string[]): string[] {
  return users.filter(u => u.rol && roles.includes(u.rol)).map(u => u.id);
}

function recipientsForAggregateAlert(
  tipo: AlertType,
  workspaceUsers: UsuarioRow[],
): string[] {
  const admins = workspaceUsersByRole(workspaceUsers, ["admin", "jefe", "owner"]);
  const owners = workspaceUsersByRole(workspaceUsers, ["owner"]);

  switch (tipo) {
    case "ot_urgente_sin_asignar":
    case "ot_alta_prioridad_abierta":
    case "ot_vencida":
      return uniqueIds(owners.length > 0 ? owners : admins);

    case "ot_sin_asignar":
    case "ot_abierta_sin_asignar":
    case "ot_abierta_sin_progreso":
    default:
      return uniqueIds(admins);
  }
}

function todayYmdInSantiago(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function evaluateCondition(
  orden: OrdenTrabajo,
  tipo: AlertType,
  umbralMinutos: number,
  now: Date
): boolean {
  const age = (date: string) =>
    (now.getTime() - new Date(date).getTime()) / 60000; // minutes

  switch (tipo) {
    case "ot_sin_asignar":
    case "ot_abierta_sin_asignar":
      return (
        orden.estado === "pendiente" &&
        (!orden.asignados_ids || orden.asignados_ids.length === 0) &&
        age(orden.created_at) >= umbralMinutos
      );

    case "ot_en_curso_inactiva":
    case "ot_en_curso_detenida":
      // In-progress (en_ejecucion=true) and hasn't advanced — use iniciado_at as proxy
      return (
        (orden.estado === "en_curso" || orden.en_ejecucion === true) &&
        orden.iniciado_at != null &&
        age(orden.iniciado_at) >= umbralMinutos
      );

    case "ot_vencida":
      return (
        orden.fecha_termino != null &&
        !["completado", "cancelado"].includes(orden.estado) &&
        orden.fecha_termino.slice(0, 10) < todayYmdInSantiago(now)
      );

    case "ot_bloqueada":
    case "ot_en_espera_prolongada":
      return (
        orden.estado === "en_espera" &&
        age(orden.created_at) >= umbralMinutos
      );

    case "ot_urgente_sin_asignar":
    case "ot_alta_prioridad_abierta":
      return (
        orden.estado === "pendiente" &&
        orden.prioridad === "urgente" &&
        (!orden.asignados_ids || orden.asignados_ids.length === 0) &&
        age(orden.created_at) >= umbralMinutos
      );

    case "ot_abierta_sin_progreso":
      return (
        orden.estado === "pendiente" &&
        orden.en_ejecucion === false &&
        age(orden.created_at) >= umbralMinutos
      );

    case "timer_inactivo_tecnico":
    case "timer_inactivo_supervisor":
    case "timer_inactivo_manager":
    case "timer_sin_iniciar":
      return (
        ["pendiente", "en_curso"].includes(orden.estado) &&
        orden.en_ejecucion === false &&
        age(orden.created_at) >= umbralMinutos
      );

    default:
      return false;
  }
}

function buildNotificationContent(
  tipo: AlertType,
  orden: OrdenTrabajo,
  umbralMinutos: number
): { titulo: string; mensaje: string } {
  const horas = Math.round(umbralMinutos / 60);
  switch (tipo) {
    case "ot_sin_asignar":
    case "ot_abierta_sin_asignar":
      return {
        titulo: "OT sin asignar",
        mensaje: `"${orden.titulo}" lleva más de ${horas}h abierta sin técnico asignado.`,
      };
    case "ot_en_curso_inactiva":
    case "ot_en_curso_detenida":
      return {
        titulo: "OT en curso demasiado tiempo",
        mensaje: `"${orden.titulo}" lleva más de ${horas}h en ejecución sin cerrarse.`,
      };
    case "ot_vencida":
      return {
        titulo: "OT vencida",
        mensaje: `"${orden.titulo}" superó su fecha de término y sigue abierta.`,
      };
    case "ot_bloqueada":
    case "ot_en_espera_prolongada":
      return {
        titulo: "OT en espera prolongada",
        mensaje: `"${orden.titulo}" lleva más de ${horas}h bloqueada.`,
      };
    case "ot_urgente_sin_asignar":
    case "ot_alta_prioridad_abierta":
      return {
        titulo: "OT urgente sin asignar",
        mensaje: `"${orden.titulo}" es urgente y lleva más de ${horas}h sin asignarse.`,
      };
    case "ot_abierta_sin_progreso":
      return {
        titulo: "OT abierta sin progreso",
        mensaje: `"${orden.titulo}" lleva mÃ¡s de ${horas}h sin iniciar progreso.`,
      };
    case "timer_inactivo_tecnico":
    case "timer_inactivo_supervisor":
    case "timer_inactivo_manager":
    case "timer_sin_iniciar":
      return {
        titulo: "OT no iniciada",
        mensaje: `"${orden.titulo}" lleva más de ${horas}h creada sin iniciar.`,
      };
  }
}

function buildAggregateNotificationContent(
  tipo: AlertType,
  ordenes: OrdenTrabajo[],
): { titulo: string; mensaje: string } {
  const count = ordenes.length;
  const plural = count === 1 ? "OT" : "OTs";
  const sample = ordenes
    .slice(0, 3)
    .map(o => o.titulo || "Sin título")
    .join(", ");
  const suffix = count > 3 ? ` y ${count - 3} más` : "";

  switch (tipo) {
    case "ot_sin_asignar":
    case "ot_abierta_sin_asignar":
      return {
        titulo: `${count} ${plural} sin asignar`,
        mensaje: count === 1
          ? `"${sample}" sigue sin técnico asignado.`
          : `${sample}${suffix} siguen sin técnico asignado.`,
      };

    case "ot_urgente_sin_asignar":
    case "ot_alta_prioridad_abierta":
      return {
        titulo: `${count} ${plural} urgentes sin asignar`,
        mensaje: count === 1
          ? `"${sample}" es urgente y sigue sin responsable.`
          : `${sample}${suffix} son urgentes y siguen sin responsable.`,
      };

    case "ot_abierta_sin_progreso":
      return {
        titulo: `${count} ${plural} sin progreso`,
        mensaje: count === 1
          ? `"${sample}" no registra avance después del umbral configurado.`
          : `${sample}${suffix} no registran avance después del umbral configurado.`,
      };

    case "ot_vencida":
      return {
        titulo: `${count} ${plural} vencidas`,
        mensaje: count === 1
          ? `"${sample}" superó su fecha de vencimiento y sigue abierta.`
          : `${sample}${suffix} superaron su fecha de vencimiento y siguen abiertas.`,
      };

    default:
      return {
        titulo: `${count} ${plural} requieren atención`,
        mensaje: count === 1 ? `"${sample}" requiere atención.` : `${sample}${suffix} requieren atención.`,
      };
  }
}

// ─── Log helpers ──────────────────────────────────────────────────────────────

async function shouldTriggerAlert(
  supabase: ReturnType<typeof createClient>,
  workOrderId: string,
  tipo: AlertType,
  workspaceId: string,
  now: Date
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("notifications_alertas_log")
    .select("id, triggered_at")
    .eq("work_order_id", workOrderId)
    .eq("type", tipo)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing) return false;

  const { error } = await supabase.from("notifications_alertas_log").insert({
    work_order_id: workOrderId,
    type: tipo,
    workspace_id: workspaceId,
    triggered_at: now.toISOString(),
  });

  if (error) {
    if (error.code === "23505") return false;
    console.error("Log insert error:", error.message);
    return false;
  }

  return true;
}

async function resolveStaleAlerts(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  tipo: AlertType,
  stillActiveIds: string[],
  now: Date
): Promise<void> {
  let query = supabase
    .from("notifications_alertas_log")
    .update({ resolved_at: now.toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("type", tipo)
    .is("resolved_at", null);

  if (stillActiveIds.length > 0) {
    query = query.not("work_order_id", "in", `(${stillActiveIds.join(",")})`);
  }

  const { error } = await query;
  if (error) {
    console.error(`resolveStaleAlerts [${tipo}]:`, error.message);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    return await withCronMonitor(
      "evaluar-alertas",
      { schedule: "0 * * * *", maxRuntime: 10 },
      async () => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();

    // 1. Fetch all active alert rules across all workspaces
    const { data: reglas, error: reglaErr } = await supabase
      .from("reglas_alerta_workspace")
      .select("id, workspace_id, tipo, activa, umbral_minutos, rol_destino")
      .eq("activa", true);

    if (reglaErr) {
      // Throw so the cron monitor records a failure (the outer catch still
      // returns a 500 Response).
      throw new Error(`Error fetching rules: ${reglaErr.message}`);
    }

    if (!reglas || reglas.length === 0) {
      return new Response("No active rules", { status: 200 });
    }

    // 2. Fetch all active OTs across relevant workspaces
    const workspaceIds = [...new Set(reglas.map((r: ReglaAlerta) => r.workspace_id))];

    const { data: ordenes, error: ordenErr } = await supabase
      .from("ordenes_trabajo")
      .select(
        "id, titulo, estado, prioridad, asignados_ids, en_ejecucion, iniciado_at, fecha_termino, created_at, workspace_id, creado_por"
      )
      .in("workspace_id", workspaceIds)
      .not("estado", "in", "(completado,cancelado)");

    if (ordenErr) {
      throw new Error(`Error fetching orders: ${ordenErr.message}`);
    }

    const ordenesByWorkspace = new Map<string, OrdenTrabajo[]>();
    for (const o of ordenes ?? []) {
      const list = ordenesByWorkspace.get(o.workspace_id) ?? [];
      list.push(o);
      ordenesByWorkspace.set(o.workspace_id, list);
    }

    const { data: usuarios, error: usuariosErr } = await supabase
      .from("usuarios")
      .select("id, workspace_id, rol")
      .in("workspace_id", workspaceIds);

    if (usuariosErr) {
      throw new Error(`Error fetching users: ${usuariosErr.message}`);
    }

    const usuariosByWorkspace = new Map<string, UsuarioRow[]>();
    const validUserIds = new Set<string>();
    for (const u of (usuarios ?? []) as UsuarioRow[]) {
      const list = usuariosByWorkspace.get(u.workspace_id) ?? [];
      list.push(u);
      usuariosByWorkspace.set(u.workspace_id, list);
      validUserIds.add(u.id);
    }

    let sent = 0;
    let skipped = 0;

    // 3. For each rule, evaluate each OT in that workspace
    for (const regla of reglas as ReglaAlerta[]) {
      if (!ACTIVE_ALERT_TYPES.has(regla.tipo)) {
        skipped++;
        continue;
      }

      const wsOrdenes = ordenesByWorkspace.get(regla.workspace_id) ?? [];
      const activeIds: string[] = [];
      const newlyTriggered: OrdenTrabajo[] = [];

      for (const orden of wsOrdenes) {
        const conditionMet = evaluateCondition(orden, regla.tipo, regla.umbral_minutos, now);
        if (!conditionMet) continue;

        activeIds.push(orden.id);

        const trigger = await shouldTriggerAlert(
          supabase,
          orden.id,
          regla.tipo,
          regla.workspace_id,
          now
        );

        if (!trigger) {
          skipped++;
          continue;
        }

        newlyTriggered.push(orden);
      }

      if (newlyTriggered.length > 0) {
        const recipients = recipientsForAggregateAlert(
          regla.tipo,
          usuariosByWorkspace.get(regla.workspace_id) ?? [],
        ).filter((uid) => validUserIds.has(uid)); // guard against stale/deleted user ids → avoids FK 23503 tanking the batch

        if (recipients.length === 0) {
          skipped++;
        } else {
          const { titulo, mensaje } = buildAggregateNotificationContent(regla.tipo, newlyTriggered);
          const notifRows = recipients.map((uid) => ({
            usuario_id: uid,
            titulo,
            mensaje,
            tipo: regla.tipo,
            url: "/ordenes?vista=kanban",
          }));

          const { error: notifErr } = await supabase
            .from("notifications")
            .insert(notifRows);

          if (notifErr) {
            console.error(`Aggregate notification insert error [${regla.tipo}]:`, notifErr.message);
          } else {
            sent++;
            console.log(`Aggregate alert sent: ${regla.tipo} -> ${newlyTriggered.length} OTs (${recipients.length} recipients)`);
          }
        }
      }

      // 4. Resolve logs for OTs that no longer meet this condition
      await resolveStaleAlerts(supabase, regla.workspace_id, regla.tipo, activeIds, now);
    }

    const summary = { sent, skipped, evaluated: (ordenes ?? []).length };
    console.log("evaluar-alertas complete:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
      },
    );
  } catch (err) {
    console.error("Unhandled error:", String(err));
    return new Response(String(err), { status: 500 });
  }
});
