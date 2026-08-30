/**
 * evaluar-alertas — Cron-triggered edge function
 *
 * Evaluates all active alert rules across workspaces and sends push
 * notifications exactly once per (OT, alert-type) condition.
 *
 * Duplicate prevention:
 *   - Before sending, we attempt to INSERT into notifications_alertas_log,
 *     guarded by uq_alert_log_resource_open — a UNIQUE partial index on
 *     (workspace_id, resource_type, resource_id, type) WHERE resolved_at IS NULL.
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
  // Timers nobody stops: an OT is started and then left running for days. The
  // condition and the UI copy for this existed all along, but the type was
  // missing here, so the rule was evaluated for exactly no one.
  "ot_en_curso_inactiva",
  "ot_en_curso_detenida",
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

/**
 * Alert types whose notification also goes to the OT's assignees, not just to
 * supervision. Only makes sense where a specific person can act: a runaway
 * timer is fixed by the technician who started it. Unassigned-OT alerts have
 * nobody to notify by definition, so they stay supervisor-only.
 */
const NOTIFY_ASSIGNEES_TOO = new Set<AlertType>([
  "ot_en_curso_inactiva",
  "ot_en_curso_detenida",
]);

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
  now: Date,
  lastActivityByOrden: Map<string, string>,
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
    case "ot_en_curso_detenida": {
      // Measured from the last ACTIVITY, not from iniciado_at. A multi-day job
      // that logs progress daily is working as intended and must stay quiet;
      // what we want to catch is a timer left running with nothing happening.
      //
      // Falling back to iniciado_at covers OTs with no actividad rows at all —
      // started and immediately abandoned, which is the exact shape of every
      // runaway timer found in this database.
      // estado is authoritative, NOT en_ejecucion. Completing or pausing an OT
      // does not always clear that flag — three completed OTs in this database
      // still carry en_ejecucion=true — so trusting it would alert about work
      // that is already finished.
      if (orden.estado !== "en_curso") return false;
      const reference = lastActivityByOrden.get(orden.id) ?? orden.iniciado_at;
      return reference != null && age(reference) >= umbralMinutos;
    }

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
        titulo: "OT en curso sin avance",
        mensaje: `"${orden.titulo}" lleva más de ${horas}h con el timer corriendo y sin actividad. Si ya terminaste, ciérrala; si no, pausala.`,
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
        mensaje: `"${orden.titulo}" lleva más de ${horas}h sin iniciar progreso.`,
      };
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

    case "ot_en_curso_inactiva":
    case "ot_en_curso_detenida":
      return {
        titulo: `${count} ${plural} con el timer corriendo`,
        mensaje: count === 1
          ? `"${sample}" lleva horas en ejecución sin registrar actividad.`
          : `${sample}${suffix} llevan horas en ejecución sin registrar actividad.`,
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
  // Matches uq_alert_log_resource_open, the partial unique index that actually
  // enforces this: (workspace_id, resource_type, resource_id, type) WHERE
  // resolved_at IS NULL. Querying by work_order_id alone would miss the
  // workspace and resource columns the constraint is keyed on.
  const { data: existing } = await supabase
    .from("notifications_alertas_log")
    .select("id, triggered_at")
    .eq("workspace_id", workspaceId)
    .eq("resource_type", "orden")
    .eq("resource_id", workOrderId)
    .eq("type", tipo)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing) return false;

  // resource_type / resource_id are NOT NULL and have no default. They were
  // added to generalise the log beyond work orders (an alert about a material
  // or a location would set a different resource_type), but this function was
  // never updated, so every insert failed with 23502 and no alert has fired
  // since 2026-07-14 — the whole alerting system was silently dead, not just
  // the timer rule. Every existing row uses 'orden'; these alerts are all about
  // work orders, so resource_id mirrors work_order_id.
  const { error } = await supabase.from("notifications_alertas_log").insert({
    work_order_id: workOrderId,
    resource_type: "orden",
    resource_id: workOrderId,
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
  // Scoped to resource_type='orden' so this never resolves a future alert about
  // a different kind of resource that happens to share a type and workspace.
  let query = supabase
    .from("notifications_alertas_log")
    .update({ resolved_at: now.toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("resource_type", "orden")
    .eq("type", tipo)
    .is("resolved_at", null);

  if (stillActiveIds.length > 0) {
    query = query.not("resource_id", "in", `(${stillActiveIds.join(",")})`);
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

    // deleted_at IS NULL matters: soft-deleting an OT does NOT reset estado or
    // en_ejecucion, so OTs sitting in the papelera stay 'en_curso' forever and
    // would otherwise be alerted on. Two of the longest-"running" OTs in this
    // database (1213h and 1515h) turned out to be trashed months ago.
    const { data: ordenes, error: ordenErr } = await supabase
      .from("ordenes_trabajo")
      .select(
        "id, titulo, estado, prioridad, asignados_ids, en_ejecucion, iniciado_at, fecha_termino, created_at, workspace_id, creado_por"
      )
      .in("workspace_id", workspaceIds)
      .is("deleted_at", null)
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

    // Last activity per OT, for the inactivity conditions. Only in-progress OTs
    // need it, which keeps this to a handful of rows rather than the whole
    // actividad_ot history. Ordered ascending so the last write per orden_id
    // wins and the map ends up holding the most recent timestamp.
    const enCursoIds = (ordenes ?? [])
      .filter((o: OrdenTrabajo) => o.estado === "en_curso")
      .map((o: OrdenTrabajo) => o.id);

    const lastActivityByOrden = new Map<string, string>();
    if (enCursoIds.length > 0) {
      const { data: actividades, error: actividadErr } = await supabase
        .from("actividad_ot")
        .select("orden_id, created_at")
        .in("orden_id", enCursoIds)
        .order("created_at", { ascending: true });

      if (actividadErr) {
        // Non-fatal: without this map the conditions fall back to iniciado_at,
        // which is the old behaviour — noisier, but never silently missing.
        console.error("actividad_ot fetch failed:", actividadErr.message);
      } else {
        for (const a of actividades ?? []) {
          lastActivityByOrden.set(a.orden_id, a.created_at);
        }
      }
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
        const conditionMet = evaluateCondition(
          orden,
          regla.tipo,
          regla.umbral_minutos,
          now,
          lastActivityByOrden,
        );
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
            // Carry the exact OT ids the alert fired for. "4 OTs vencidas"
            // previously linked to the whole kanban, so the reader had to hunt
            // for which four -- and the body only names three ("y 1 mas").
            // Both clients filter on ?ids= and show just these.
            url: `/ordenes?ids=${newlyTriggered.map((o) => o.id).join(",")}`,
          }));

          // Assignees get their own OT named and linked, rather than the
          // workspace-wide roll-up supervision receives — "your OT has been
          // running 340h" is actionable in a way that "4 OTs need attention"
          // is not. Deep-links straight to the OT so pausing it is one tap.
          if (NOTIFY_ASSIGNEES_TOO.has(regla.tipo)) {
            for (const orden of newlyTriggered) {
              const asignados = (orden.asignados_ids ?? []).filter(
                (uid) => validUserIds.has(uid) && !recipients.includes(uid),
              );
              const perOt = buildNotificationContent(regla.tipo, orden, regla.umbral_minutos);
              for (const uid of new Set(asignados)) {
                notifRows.push({
                  usuario_id: uid,
                  titulo: perOt.titulo,
                  mensaje: perOt.mensaje,
                  tipo: regla.tipo,
                  url: `/ordenes/${orden.id}`,
                });
              }
            }
          }

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
