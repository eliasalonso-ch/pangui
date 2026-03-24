// Supabase Edge Function — runs daily via pg_cron or Supabase cron dashboard
// Schedule: every day at 06:00 UTC
// Creates OTs from active preventivo templates whose proxima_fecha <= today

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  // Simple auth: only allow from cron (no external calls needed)
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Get all active preventivos due today or overdue
  const { data: preventivos, error: fetchErr } = await supabase
    .from("preventivos")
    .select("*")
    .eq("activo", true)
    .lte("proxima_fecha", todayStr);

  if (fetchErr) {
    console.error("Error fetching preventivos:", fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!preventivos || preventivos.length === 0) {
    return new Response(JSON.stringify({ created: 0 }), { status: 200 });
  }

  let created = 0;
  const errors = [];

  for (const p of preventivos) {
    try {
      // Create the work order
      const { data: newOrden, error: insErr } = await supabase
        .from("ordenes_trabajo")
        .insert({
          workspace_id: p.workspace_id,
          cliente_id:   p.cliente_id  ?? null,
          ubicacion_id: p.ubicacion_id ?? null,
          tipo:         "solicitud",
          descripcion:  `[PREVENTIVO] ${p.descripcion}`,
          estado:       "pendiente",
          prioridad:    "normal",
        })
        .select("id")
        .single();

      if (insErr) {
        errors.push({ preventivo_id: p.id, error: insErr.message });
        continue;
      }

      // Advance proxima_fecha by frecuencia_dias
      const nextDate = new Date(p.proxima_fecha + "T00:00:00");
      nextDate.setDate(nextDate.getDate() + p.frecuencia_dias);
      const nextStr = nextDate.toISOString().slice(0, 10);

      await supabase
        .from("preventivos")
        .update({ proxima_fecha: nextStr })
        .eq("id", p.id);

      created++;
    } catch (err) {
      errors.push({ preventivo_id: p.id, error: String(err) });
    }
  }

  return new Response(
    JSON.stringify({ created, errors: errors.length > 0 ? errors : undefined }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
