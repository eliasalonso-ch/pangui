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

interface AlertLog {
  id: string;
  work_order_id: string;
  type: string;
  triggered_at: string;
  resolved_at: string | null;
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter(Boolean))] as string[];
}

function workspaceUsersByRole(users: UsuarioRow[], roles: string[]): string[] {
  return users.filter(u => u.rol && roles.includes(u.rol)).map(u => u.id);
}

function recipientsForAlert(
  tipo: AlertType,
  orden: OrdenTrabajo,
  workspaceUsers: UsuarioRow[],
): string[] {
  const assignees = orden.asignados_ids ?? [];
  const admins = workspaceUsersByRole(workspaceUsers, ["admin", "jefe", "owner"]);
  const owners = workspaceUsersByRole(workspaceUsers, ["owner"]);

  switch (tipo) {
    case "timer_inactivo_tecnico":
      return uniqueIds(assignees.length > 0 ? assignees : [orden.creado_por]);

    case "timer_inactivo_supervisor":
      return uniqueIds(admins);

    case "timer_inactivo_manager":
      return uniqueIds(owners.length > 0 ? owners : admins);

    case "ot_sin_asignar":
    case "ot_abierta_sin_asignar":
    case "ot_urgente_sin_asignar":
    case "ot_alta_prioridad_abierta":
      return uniqueIds(admins);

    case "ot_vencida":
    case "ot_bloqueada":
    case "ot_en_espera_prolongada":
      return uniqueIds([...assignees, ...admins]);

    case "ot_abierta_sin_progreso":
    case "ot_en_curso_inactiva":
    case "ot_en_curso_detenida":
    case "timer_sin_iniciar":
      return uniqueIds([...assignees, orden.creado_por]);

    default:
      return uniqueIds([...assignees, orden.creado_por]);
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
      console.error("Failed to fetch reglas:", reglaErr.message);
      return new Response("Error fetching rules", { status: 500 });
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
      console.error("Failed to fetch ordenes:", ordenErr.message);
      return new Response("Error fetching orders", { status: 500 });
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
      console.error("Failed to fetch usuarios:", usuariosErr.message);
      return new Response("Error fetching users", { status: 500 });
    }

    const usuariosByWorkspace = new Map<string, UsuarioRow[]>();
    for (const u of (usuarios ?? []) as UsuarioRow[]) {
      const list = usuariosByWorkspace.get(u.workspace_id) ?? [];
      list.push(u);
      usuariosByWorkspace.set(u.workspace_id, list);
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

        const recipients = recipientsForAlert(
          regla.tipo,
          orden,
          usuariosByWorkspace.get(regla.workspace_id) ?? [],
        );

        if (recipients.length === 0) {
          skipped++;
          continue;
        }

        const { titulo, mensaje } = buildNotificationContent(
          regla.tipo,
          orden,
          regla.umbral_minutos
        );

        const notifRows = recipients.map((uid) => ({
          usuario_id: uid,
          titulo,
          mensaje,
          tipo: regla.tipo,
          url: `/orden/${orden.id}`,
        }));

        const { error: notifErr } = await supabase
          .from("notifications")
          .insert(notifRows);

        if (notifErr) {
          console.error(`Notification insert error [${orden.id}]:`, notifErr.message);
        } else {
          sent++;
          console.log(`Alert sent: ${regla.tipo} → OT ${orden.id} (${recipients.length} recipients)`);
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
  } catch (err) {
    console.error("Unhandled error:", String(err));
    return new Response(String(err), { status: 500 });
  }
});
