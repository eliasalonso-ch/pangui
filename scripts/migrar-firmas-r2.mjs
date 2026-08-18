#!/usr/bin/env node
/**
 * Migra las firmas guardadas en paso_respuestas.firma_svg a R2.
 *
 * POR QUE
 * -------
 * paso_respuestas es la tabla mas grande de la base: 52 MB, de los cuales
 * ~48 MB son PNG de firmas guardados como texto en la columna. Eso pesa en
 * disco tres veces: van a TOAST, pasan antes por WAL, y el upsert de la tabla
 * (ON CONFLICT DO UPDATE) reescribe la fila entera -- imagen incluida --
 * cada vez que se guarda cualquier campo de esa respuesta.
 *
 * Web y mobile ya suben las firmas nuevas a R2 y guardan la URL. Este script
 * hace lo mismo con las que quedaron escritas antes de ese cambio.
 *
 * COMO
 * ----
 * Sube via la Edge Function `r2-presign`, igual que los clientes. Las llaves
 * de R2 solo existen dentro de esa funcion (a proposito: no estan en .env ni
 * en el bundle), asi que no hay forma de subir directo desde aca.
 *
 * `r2-presign` exige un JWT de usuario real -- rechaza service_role -- y
 * ademas valida que la carpeta sea `ordenes/<id de una OT existente>`. Por eso
 * el script pide credenciales de un usuario con acceso a las OTs a migrar.
 *
 * Las lecturas y escrituras a Postgres van con SERVICE_ROLE_KEY para saltarse
 * RLS: hay firmas de varios workspaces y un solo usuario no las ve todas.
 *
 * USO
 * ---
 *   node scripts/migrar-firmas-r2.mjs --dry-run          # no escribe nada
 *   node scripts/migrar-firmas-r2.mjs --limit 10         # prueba corta
 *   node scripts/migrar-firmas-r2.mjs                    # migracion completa
 *
 * Variables requeridas (además de las de .env.local):
 *   MIGRACION_EMAIL / MIGRACION_PASSWORD  -> usuario para firmar los presign
 *
 * SEGURIDAD DEL PROCESO
 * ---------------------
 * - Reanudable: solo toca filas con firma_svg tipo 'data:%', asi que volver a
 *   correrlo salta lo ya migrado. Cortarlo a la mitad no deja nada corrupto.
 * - Verifica cada subida con un HEAD antes de tocar la fila. Si el objeto no
 *   quedo accesible, la fila se deja intacta y se cuenta como fallo.
 * - Nunca borra el PNG sin haber confirmado la URL.
 * - Concurrencia limitada: r2-presign tarda 1.8-4.5s por llamada, asi que en
 *   serie esto son ~30 min; de a 4 baja a minutos sin saturar la funcion.
 *
 * DESPUES DE CORRER
 * -----------------
 * El espacio no vuelve solo: Postgres marca las paginas como reutilizables
 * pero no las devuelve al disco. Para recuperarlas de verdad hay que correr
 * VACUUM FULL public.paso_respuestas; -- toma un lock exclusivo, asi que va
 * fuera de horario.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────

function cargarEnv() {
  const ruta = join(__dirname, "..", ".env.local");
  let texto = "";
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    return;
  }
  for (const linea of texto.split("\n")) {
    const m = /^\s*([A-Z_0-9]+)\s*=\s*(.*)$/.exec(linea);
    if (!m) continue;
    const [, clave, bruto] = m;
    if (process.env[clave] !== undefined) continue;
    process.env[clave] = bruto.trim().replace(/^["']|["']$/g, "");
  }
}
cargarEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.MIGRACION_EMAIL;
const PASSWORD = process.env.MIGRACION_PASSWORD;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMITE = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : null;
})();
const CONCURRENCIA = 2;  // Bajada de 4: con 4 la base empezo a devolver 504 en auth/v1/user.

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!DRY_RUN && (!EMAIL || !PASSWORD)) {
  console.error("Faltan MIGRACION_EMAIL / MIGRACION_PASSWORD (necesarios para firmar los presign).");
  console.error("Para ver que haria sin escribir nada: node scripts/migrar-firmas-r2.mjs --dry-run");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Decodifica un data URI a bytes + extension. Devuelve null si no es uno. */
function parsearDataUri(valor) {
  const m = /^data:image\/([a-z]+);base64,([\s\S]+)$/i.exec(valor.trim());
  if (!m) return null;
  const [, tipo, base64] = m;
  const ext = tipo.toLowerCase() === "jpeg" ? "jpg" : tipo.toLowerCase();
  return { ext, bytes: Buffer.from(base64, "base64") };
}

async function pedirPresign(token, ext, folder, size) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ ext, folder, size }),
  });
  if (!res.ok) throw new Error(`presign ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function subirYVerificar(presign, bytes) {
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": presign.contentType, "Content-Length": String(bytes.length) },
    body: bytes,
  });
  if (!put.ok) throw new Error(`PUT ${put.status}: ${(await put.text()).slice(0, 160)}`);

  // No basta con el 200 del PUT: confirmamos que el objeto quedo servible
  // antes de borrar el PNG de la fila.
  const head = await fetch(presign.publicUrl, { method: "HEAD" });
  if (!head.ok) throw new Error(`objeto no accesible tras subir (HEAD ${head.status})`);
}

/** Corre `tareas` con como maximo `limite` en vuelo a la vez. */
async function enLotes(items, limite, fn) {
  const resultados = [];
  let cursor = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      resultados[i] = await fn(items[i], i);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * Inicia sesion y devuelve el token. Se rellama cada tanto porque el JWT de
 * Supabase dura ~1 hora: la primera version del script pedia el token una sola
 * vez, la fase de lectura se comio ese margen, y las subidas empezaron a
 * fallar con `presign 401: unauthenticated` a mitad de corrida.
 */
async function nuevoToken() {
  const publico = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await publico.auth.signInWithPassword({
    email: EMAIL, password: PASSWORD,
  });
  if (error || !data?.session) throw new Error(`login fallido: ${error?.message ?? "sin sesion"}`);
  return data.session.access_token;
}

/** Lee un grupo chico de firmas, con reintentos: TOAST hace lento el SELECT. */
async function leerFirmas(ids) {
  for (let intento = 1; intento <= 4; intento++) {
    const { data, error } = await admin
      .from("paso_respuestas")
      .select("id, ejecucion_id, firma_svg")
      .in("id", ids);
    if (!error) {
      return (data ?? []).filter(f => typeof f.firma_svg === "string" && f.firma_svg.startsWith("data:"));
    }
    if (intento === 4) throw new Error(`leyendo firmas: ${error.message}`);
    await new Promise(r => setTimeout(r, 2000 * intento));
  }
  return [];
}

async function main() {
  console.log(DRY_RUN ? "== SIMULACION (no escribe nada) ==" : "== MIGRACION POR LOTES ==");

  // Solo los ids. No se filtra con LIKE 'data:%' a proposito: ese patron
  // obliga a Postgres a detoastear las ~2.900 filas para evaluarse (13,4 s
  // medidos con EXPLAIN, sobre el statement timeout). Se traen todas las que
  // tienen firma y el formato se decide al leer el contenido.
  const { data: idRows, error: errIds } = await admin
    .from("paso_respuestas")
    .select("id")
    .not("firma_svg", "is", null)
    .order("id");
  if (errIds) throw new Error(`listando ids: ${errIds.message}`);
  const todos = (idRows ?? []).map(r => r.id);
  const objetivo = LIMITE ? todos.slice(0, LIMITE) : todos;
  console.log(`Candidatas con firma: ${objetivo.length}`);

  if (DRY_RUN) {
    const muestra = await leerFirmas(objetivo.slice(0, 5));
    console.log(`\nMuestra de las que siguen inline:`);
    for (const f of muestra) {
      const parsed = parsearDataUri(f.firma_svg);
      console.log(`  ${f.id}  ${parsed ? `${parsed.ext} ${(parsed.bytes.length / 1024).toFixed(0)} KB` : "NO PARSEABLE"}`);
    }
    console.log("\nSin --dry-run se subirian a R2 y se reemplazaria la columna por la URL.");
    return;
  }

  let token = await nuevoToken();
  let tokenPedidoEn = Date.now();
  console.log(`Sesion iniciada como ${EMAIL}\n`);

  let ok = 0, fallidas = 0, saltadas = 0, bytesLiberados = 0;
  const errores = [];

  // Lotes chicos, leidos y migrados de inmediato. La version anterior leia las
  // 411 de golpe antes de subir nada: eso tardaba tanto que vencia el token, y
  // ademas mantenia a la base leyendo TOAST sin pausa hasta devolver 504 en
  // auth/v1/user. Intercalar y respirar entre lotes evita las dos cosas.
  const LOTE = 15;
  for (let i = 0; i < objetivo.length; i += LOTE) {
    const idsLote = objetivo.slice(i, i + LOTE);

    // El token se renueva por tiempo, no por lote: 45 min deja margen sobrado
    // frente a la expiracion de ~1 h.
    if (Date.now() - tokenPedidoEn > 45 * 60_000) {
      token = await nuevoToken();
      tokenPedidoEn = Date.now();
      console.log("  (token renovado)");
    }

    const filas = await leerFirmas(idsLote);
    if (!filas.length) { saltadas += idsLote.length; continue; }

    const ejecIds = [...new Set(filas.map(f => f.ejecucion_id).filter(Boolean))];
    const ordenPorEjec = new Map();
    if (ejecIds.length) {
      const { data: ejecs, error: errEjec } = await admin
        .from("procedimiento_ejecuciones")
        .select("id, orden_id")
        .in("id", ejecIds);
      if (errEjec) throw new Error(`leyendo ejecuciones: ${errEjec.message}`);
      for (const e of ejecs ?? []) ordenPorEjec.set(e.id, e.orden_id);
    }

    await enLotes(filas, CONCURRENCIA, async (fila) => {
      const etiqueta = `${fila.id.slice(0, 8)}`;
      try {
        const ordenId = ordenPorEjec.get(fila.ejecucion_id);
        if (!ordenId) throw new Error("sin OT asociada");
        const parsed = parsearDataUri(fila.firma_svg);
        if (!parsed) throw new Error("firma_svg no es un data URI reconocible");

        const presign = await pedirPresign(token, parsed.ext, `ordenes/${ordenId}/firmas`, parsed.bytes.length);
        await subirYVerificar(presign, parsed.bytes);

        // Recien aca se toca la fila: la URL ya respondio a un HEAD.
        const { error: errUpd } = await admin
          .from("paso_respuestas")
          .update({ firma_svg: presign.publicUrl })
          .eq("id", fila.id);
        if (errUpd) throw new Error(`update: ${errUpd.message}`);

        ok++;
        bytesLiberados += fila.firma_svg.length - presign.publicUrl.length;
      } catch (e) {
        fallidas++;
        errores.push(`${fila.id}: ${e.message}`);
      }
    });

    const hechas = ok + fallidas;
    console.log(`lote ${Math.floor(i / LOTE) + 1}: ${ok} ok, ${fallidas} fallidas  (${hechas} procesadas, ~${(bytesLiberados / 1024 / 1024).toFixed(1)} MB liberados)`);

    // Pausa deliberada: sin esto la base queda leyendo TOAST sin descanso y
    // termina afectando al resto del proyecto (se vieron 504 en auth/v1/user).
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n--- Resumen ---`);
  console.log(`Migradas:     ${ok}`);
  console.log(`Fallidas:     ${fallidas}`);
  console.log(`Ya migradas:  ${saltadas}  (se saltaron, no eran data URI)`);
  console.log(`Liberado:     ~${(bytesLiberados / 1024 / 1024).toFixed(1)} MB de la tabla`);
  if (errores.length) {
    console.log(`\nErrores (las filas quedaron intactas, se pueden reintentar):`);
    for (const e of errores.slice(0, 15)) console.log(`  ${e}`);
    if (errores.length > 15) console.log(`  ... y ${errores.length - 15} mas`);
  }
  console.log(`\nEl espacio se recupera recien con:  VACUUM FULL public.paso_respuestas;`);
}

main().catch(e => {
  console.error(`\nError fatal: ${e.message}`);
  process.exit(1);
});
