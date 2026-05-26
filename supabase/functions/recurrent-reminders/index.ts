// Supabase Edge Function — run daily from Supabase cron.
// Creates in-app reminders for recurring OTs before their next scheduled run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type OrdenRecurrente = {
  id: string;
  titulo: string | null;
  proxima_ejecucion: string | null;
  asignados_ids: string[] | null;
};

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = dateOnly(new Date());
  const inOneDay = addDays(today, 1);
  const inTwoDays = addDays(today, 2);
  const minDate = toDateKey(inOneDay);
  const maxDate = toDateKey(inTwoDays);

  const { data, error } = await supabase
    .from("ordenes_trabajo")
    .select("id,titulo,proxima_ejecucion,asignados_ids")
    .is("parent_id", null)
    .neq("recurrencia", "ninguna")
    .not("proxima_ejecucion", "is", null)
    .gte("proxima_ejecucion", minDate)
    .lt("proxima_ejecucion", addDays(inTwoDays, 1).toISOString());

  if (error) {
    console.error("[recurrent-reminders] fetch failed", error);
    return json({ error: error.message }, 500);
  }

  let inserted = 0;
  let skipped = 0;

  for (const orden of (data ?? []) as OrdenRecurrente[]) {
    const nextDate = orden.proxima_ejecucion ? toDateKey(new Date(orden.proxima_ejecucion)) : null;
    if (!nextDate || (nextDate !== minDate && nextDate !== maxDate)) continue;

    const daysBefore = nextDate === minDate ? 1 : 2;
    const userIds = orden.asignados_ids ?? [];
    if (userIds.length === 0) continue;

    const tipo = `ot_recurrente_recordatorio_${daysBefore}d`;
    const url = `/ordenes?id=${orden.id}&vista=calendario`;
    const titulo = daysBefore === 1
      ? "OT recurrente programada para mañana"
      : "OT recurrente programada en 2 días";
    const mensaje = `${orden.titulo ?? "Orden recurrente"} se creará automáticamente el ${formatDateEs(nextDate)}.`;

    for (const usuarioId of userIds) {
      const { data: existing, error: existingError } = await supabase
        .from("notifications")
        .select("id")
        .eq("usuario_id", usuarioId)
        .eq("url", url)
        .eq("tipo", tipo)
        .maybeSingle();

      if (existingError) {
        console.error("[recurrent-reminders] duplicate check failed", existingError);
        continue;
      }
      if (existing) {
        skipped += 1;
        continue;
      }

      const { error: insertError } = await supabase.from("notifications").insert({
        usuario_id: usuarioId,
        titulo,
        mensaje,
        url,
        tipo,
      });

      if (insertError) {
        console.error("[recurrent-reminders] insert failed", insertError);
      } else {
        inserted += 1;
      }
    }
  }

  return json({ ok: true, inserted, skipped });
});

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateEs(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${day} de ${months[month - 1]} ${year}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
