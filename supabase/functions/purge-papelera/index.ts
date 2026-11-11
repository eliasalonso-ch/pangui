// Supabase Edge Function — corre a diario por pg_cron (04:00 UTC).
//
// 1. Borra definitivamente las OTs que llevan más de 30 días en la papelera.
// 2. Vacía la cola `r2_borrados_pendientes`: borra de R2 la carpeta de cada OT
//    eliminada.
//
// La cola la llena un trigger AFTER DELETE en ordenes_trabajo, así que cubre
// TODOS los caminos que borran una OT (esta purga, "Eliminar definitivamente"
// en web y móvil, el borrado de workspace), no solo este.
//
// Antes esta función borraba solo imagen_url y fotos_urls llamando a r2-delete
// con la service key, que respondía 401; el error se tragaba y las fotos
// quedaban huérfanas en el bucket (158 OTs, 175 MB al 2026-11-11).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { borrarCarpetaDeOrden, esPrefijoDeOrden } from "../_shared/r2.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RETENTION_DAYS = 30;
// ponytail: tope por corrida para no pasarse del límite de tiempo de la
// función. Lo que sobre sale al día siguiente; si la cola crece más rápido que
// esto, subir el tope o correr el cron más seguido.
const MAX_CARPETAS_POR_CORRIDA = 100;

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // El trigger encola la carpeta de cada fila borrada.
  const { data: purgadas, error: delErr } = await supabase
    .from("ordenes_trabajo")
    .delete()
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .select("id");

  if (delErr) {
    console.error("[purge-papelera] delete error:", delErr);
    return new Response(JSON.stringify({ error: delErr.message }), { status: 500 });
  }

  const { data: cola, error: colaErr } = await supabase
    .from("r2_borrados_pendientes")
    .select("id, prefijo")
    .order("id")
    .limit(MAX_CARPETAS_POR_CORRIDA);

  if (colaErr) {
    console.error("[purge-papelera] cola error:", colaErr);
    return new Response(JSON.stringify({ error: colaErr.message }), { status: 500 });
  }

  let objetos = 0;
  let fallidas = 0;
  for (const item of cola ?? []) {
    try {
      // Un prefijo inválido no va a servir nunca: se saca de la cola sin tocar R2.
      if (esPrefijoDeOrden(item.prefijo)) objetos += await borrarCarpetaDeOrden(item.prefijo);
      else console.error("[purge-papelera] prefijo descartado:", item.prefijo);
      await supabase.from("r2_borrados_pendientes").delete().eq("id", item.id);
    } catch (err) {
      // Queda en la cola y se reintenta mañana.
      fallidas++;
      console.error("[purge-papelera] R2 falló para", item.prefijo, err);
    }
  }

  const resumen = { purged: purgadas?.length ?? 0, carpetas: (cola?.length ?? 0) - fallidas, objetos, fallidas };
  console.log("[purge-papelera]", JSON.stringify(resumen));
  return new Response(JSON.stringify(resumen), { status: 200 });
});
