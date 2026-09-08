#!/usr/bin/env node
/**
 * Geocodifica ubicaciones (campus / edificios) con la Google Geocoding API.
 *
 * NO escribe en la base de datos. Genera un archivo de revisión JSON para que
 * revises cada coordenada antes de aplicarla con --aplicar.
 *
 * Uso:
 *   node scripts/geocodificar-ubicaciones.mjs --workspace <uuid>          # geocodifica -> archivo
 *   node scripts/geocodificar-ubicaciones.mjs --workspace <uuid> --limit 5
 *   node scripts/geocodificar-ubicaciones.mjs --aplicar <archivo.json>    # escribe las aprobadas
 *
 * Variables de entorno (.env.local):
 *   GOOGLE_GEOCODING_API_KEY   clave SERVIDOR, restringida a Geocoding API.
 *                              NO usar la clave del navegador.
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Reglas:
 *   - Nunca sobrescribe filas con geo_origen = 'manual'.
 *   - Sesga la búsqueda a Concepción para que los fallos caigan cerca y no en otro país.
 *   - Marca como 'revisar' todo lo que no sea preciso (ROOFTOP / GEOMETRIC_CENTER).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Carga .env.local sin dependencias extra.
try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const linea of env.split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // .env.local opcional si las variables ya están en el entorno.
}

const API_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Caja de Concepción: descarta cualquier resultado fuera de aquí.
const CAJA_CONCEPCION = { latMin: -37.0, latMax: -36.7, lngMin: -73.2, lngMax: -72.9 };
// Sesgo de búsqueda (region + bounds) para no traer resultados de otros países.
const BOUNDS = '-37.0,-73.2|-36.7,-72.9';

// Centro del campus (Barrio Universitario). Todo edificio real de la UdeC cae
// dentro de ~1.5 km de aquí; más lejos es casi seguro un falso positivo.
const CAMPUS = { lat: -36.8299341, lng: -73.0357019 };
const RADIO_CAMPUS_M = 1500;

// Centroide de la ciudad que Google devuelve cuando NO encuentra nada.
// Hay que detectarlo explícitamente: llega con status OK y parece un resultado válido.
const CENTROIDE_CIUDAD = { lat: -36.8201352, lng: -73.0443904 };

/** Distancia en metros entre dos coordenadas (haversine). */
function distanciaM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const args = process.argv.slice(2);
const flag = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : null;
};

const dentroDeConcepcion = (lat, lng) =>
  lat >= CAJA_CONCEPCION.latMin && lat <= CAJA_CONCEPCION.latMax &&
  lng >= CAJA_CONCEPCION.lngMin && lng <= CAJA_CONCEPCION.lngMax;

/**
 * Limpia nombres de edificio que vienen del sistema antiguo:
 *   "FAC.CS.BIOLOG BIO.MOLECULAR_AMPL.4º PISO" -> "FAC CS BIOLOG BIO MOLECULAR AMPL"
 * Quita pisos, saltos de línea y abreviaturas pegadas que confunden al geocodificador.
 */
function limpiarNombre(edificio) {
  return String(edificio)
    .replace(/\s+/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\d+[ºo°]?\s*PISO\b/gi, '')
    .replace(/\bAMPL(IACION)?\b/gi, '')
    .replace(/\bREMODELACION\b/gi, '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function geocodificar(consulta) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', consulta);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('region', 'cl');
  url.searchParams.set('bounds', BOUNDS);
  url.searchParams.set('language', 'es');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} de Google Geocoding`);
  const data = await res.json();

  if (data.status === 'ZERO_RESULTS') return null;
  if (data.status !== 'OK') {
    // OVER_QUERY_LIMIT / REQUEST_DENIED deben detener el proceso, no ignorarse.
    throw new Error(`Google Geocoding: ${data.status} ${data.error_message ?? ''}`);
  }
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    precision: r.geometry.location_type, // ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE
    direccion_formateada: r.formatted_address,
  };
}

async function ejecutarGeocodificacion(supabase, workspaceId, limite) {
  let q = supabase
    .from('ubicaciones')
    .select('id, edificio, detalle, direccion, sociedad_id, lat, geo_origen')
    .eq('workspace_id', workspaceId)
    .is('lat', null)
    .order('edificio');
  if (limite) q = q.limit(Number(limite));

  const { data: ubicaciones, error } = await q;
  if (error) throw error;

  console.log(`${ubicaciones.length} ubicaciones sin coordenada en el workspace.\n`);

  const resultados = [];
  for (const [i, u] of ubicaciones.entries()) {
    // geo_origen 'manual' nunca se toca (defensa extra; el filtro lat null ya lo cubre).
    if (u.geo_origen === 'manual') continue;

    const base = u.direccion?.trim() || limpiarNombre(u.edificio);
    const consulta = `${base}, Universidad de Concepción, Concepción, Chile`;

    let hit = null;
    let error_msg = null;
    try {
      hit = await geocodificar(consulta);
    } catch (e) {
      // Un error de cuota/clave detiene todo; lo demás se registra y sigue.
      if (/OVER_QUERY_LIMIT|REQUEST_DENIED|INVALID_REQUEST/.test(e.message)) throw e;
      error_msg = e.message;
    }

    // La precisión que reporta Google NO basta: 'AMPLIACION ACERO EDIF. Nº 3'
    // devolvió GEOMETRIC_CENTER apuntando a "Puente Nº 3", a 12 km del campus.
    // Lo que discrimina de verdad es la distancia al campus.
    let estado;
    let distancia_m = null;
    if (hit) {
      distancia_m = Math.round(distanciaM(CAMPUS, hit));
    }

    if (error_msg) estado = 'error';
    else if (!hit) estado = 'sin_resultado';
    else if (!dentroDeConcepcion(hit.lat, hit.lng)) estado = 'fuera_de_rango';
    // Google devuelve el centroide de la ciudad cuando no encuentra nada, con status OK.
    else if (distanciaM(CENTROIDE_CIUDAD, hit) < 30) estado = 'sin_resultado';
    else if (distancia_m > RADIO_CAMPUS_M) estado = 'fuera_del_campus';
    else if (hit.precision === 'ROOFTOP') estado = 'ok';
    else estado = 'revisar';

    resultados.push({
      id: u.id,
      edificio: u.edificio,
      consulta,
      estado,
      // aprobado: solo true si estado === 'ok'. Edítalo a mano para aceptar un 'revisar'.
      aprobado: estado === 'ok',
      distancia_campus_m: distancia_m,
      ...(hit ?? {}),
      ...(error_msg ? { error: error_msg } : {}),
    });

    console.log(
      `[${i + 1}/${ubicaciones.length}] ${estado.padEnd(14)} ${u.edificio.slice(0, 50)}`,
    );
  }

  const archivo = `geocoding-revision-${Date.now()}.json`;
  writeFileSync(archivo, JSON.stringify(resultados, null, 2), 'utf8');

  const conteo = resultados.reduce((a, r) => ({ ...a, [r.estado]: (a[r.estado] ?? 0) + 1 }), {});
  console.log('\nResumen:', conteo);
  console.log(`\nArchivo de revisión: ${archivo}`);
  console.log('Revisa las coordenadas, ajusta "aprobado": true/false, y luego:');
  console.log(`  node scripts/geocodificar-ubicaciones.mjs --aplicar ${archivo}`);
}

async function aplicar(supabase, archivo) {
  const filas = JSON.parse(readFileSync(archivo, 'utf8'));
  const aprobadas = filas.filter((r) => r.aprobado && r.lat != null && r.lng != null);

  console.log(`${aprobadas.length} de ${filas.length} aprobadas para escribir.`);
  if (!aprobadas.length) return;

  let escritas = 0;
  for (const r of aprobadas) {
    const { error } = await supabase
      .from('ubicaciones')
      .update({
        lat: r.lat,
        lng: r.lng,
        geo_origen: 'google',
        geo_actualizado_at: new Date().toISOString(),
      })
      .eq('id', r.id)
      .neq('geo_origen', 'manual'); // nunca pisar una corrección a mano
    if (error) console.error(`  fallo ${r.edificio}: ${error.message}`);
    else escritas++;
  }
  console.log(`${escritas} ubicaciones actualizadas.`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const archivoAplicar = flag('--aplicar');
  if (archivoAplicar) return aplicar(supabase, archivoAplicar);

  if (!API_KEY) {
    console.error('Falta GOOGLE_GEOCODING_API_KEY (clave de servidor, restringida a Geocoding API).');
    process.exit(1);
  }
  const workspace = flag('--workspace');
  if (!workspace) {
    console.error('Falta --workspace <uuid>. Electrilam: f1b64714-6de2-4d49-b6e4-5959553e94d7');
    process.exit(1);
  }
  return ejecutarGeocodificacion(supabase, workspace, flag('--limit'));
}

main().catch((e) => {
  console.error('\nError:', e.message);
  process.exit(1);
});
