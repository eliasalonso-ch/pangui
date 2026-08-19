#!/usr/bin/env node
/**
 * Respalda a disco las firmas base64 que viven en paso_respuesta_historial
 * antes de limpiarlas.
 *
 * POR QUE
 * -------
 * El historial guarda `valor_anterior` y `valor_nuevo` completos en cada
 * edicion. Cuando la firma era un data URI, ambos traen el PNG entero: 281
 * filas, ~38 MB. Limpiar eso es irreversible, asi que primero se baja.
 *
 * Lee en lotes chicos con pausas: la tabla es TOAST puro y leerla de corrido
 * es exactamente lo que ahogo la instancia el 2026-08-19.
 *
 * Uso:
 *   node scripts/respaldar-firmas-historial.mjs [--out <dir>]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// --- env ---------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter(l => l.trim() && !l.trimStart().startsWith("#") && l.includes("="))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY    = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const args   = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : "respaldos";

const LOTE   = 10;    // filas por vuelta: cada una puede traer 2 PNG de ~117 KB
const PAUSA  = 1200;  // ms entre lotes, para no monopolizar el IO

const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } });

async function main() {
  mkdirSync(outDir, { recursive: true });
  const sello   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archivo = join(outDir, `firmas-historial-${sello}.jsonl`);
  const indice  = join(outDir, `firmas-historial-${sello}.indice.json`);

  // Primero solo los ids: barato, no toca TOAST.
  //
  // OJO: PostgREST corta en 1000 filas por defecto, y la primera version de
  // este script se comio ese limite en silencio -- listaba 1000 de 1861 y
  // respaldaba 9 firmas de 281. Se pagina explicitamente hasta agotar.
  const ids = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    const { data: filas, error } = await sb
      .from("paso_respuesta_historial")
      .select("id")
      .order("editado_at")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`listando ids: ${error.message}`);
    const lote = filas ?? [];
    ids.push(...lote.map(f => f.id));
    if (lote.length < PAGINA) break;
  }
  console.log(`Filas en el historial: ${ids.length}`);

  // Contraste contra el total real: si no calzan, algo se esta perdiendo y es
  // mejor abortar que producir un respaldo incompleto.
  const { count: totalReal, error: errCount } = await sb
    .from("paso_respuesta_historial")
    .select("id", { count: "exact", head: true });
  if (errCount) throw new Error(`contando: ${errCount.message}`);
  if (totalReal !== ids.length) {
    throw new Error(`listadas ${ids.length} filas pero la tabla tiene ${totalReal}; abortando para no respaldar a medias`);
  }

  writeFileSync(archivo, "");
  let guardadas = 0, revisadas = 0, bytes = 0;

  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const { data, error: errLote } = await sb
      .from("paso_respuesta_historial")
      .select("id, respuesta_id, workspace_id, editado_por, editado_at, valor_anterior, valor_nuevo")
      .in("id", lote);
    if (errLote) throw new Error(`leyendo lote ${i}: ${errLote.message}`);

    for (const fila of data ?? []) {
      revisadas++;
      const texto = JSON.stringify(fila.valor_anterior) + JSON.stringify(fila.valor_nuevo);
      // Solo interesa respaldar lo que se va a borrar.
      if (!texto.includes("data:image")) continue;
      const linea = JSON.stringify(fila) + "\n";
      appendFileSync(archivo, linea);
      bytes += Buffer.byteLength(linea);
      guardadas++;
    }

    process.stdout.write(`\r  ${revisadas}/${ids.length} revisadas, ${guardadas} con firma (${(bytes / 1024 / 1024).toFixed(1)} MB)   `);
    if (i + LOTE < ids.length) await new Promise(r => setTimeout(r, PAUSA));
  }

  writeFileSync(indice, JSON.stringify({
    creado: new Date().toISOString(),
    tabla: "public.paso_respuesta_historial",
    filas_revisadas: revisadas,
    filas_con_firma: guardadas,
    bytes,
    archivo,
    nota: "Respaldo previo a reemplazar los data URI por un marcador. Cada linea es una fila completa en JSON.",
  }, null, 2));

  console.log(`\n\nRespaldo listo: ${archivo}`);
  console.log(`  ${guardadas} filas con firma, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Indice: ${indice}`);
  console.log(`  Revisadas: ${revisadas} de ${ids.length}`);
  if (revisadas !== ids.length) {
    console.error(`
  AVISO: se revisaron ${revisadas} de ${ids.length}. El respaldo esta incompleto.`);
    process.exit(1);
  }
}

main().catch(e => { console.error("\nFallo:", e.message); process.exit(1); });
