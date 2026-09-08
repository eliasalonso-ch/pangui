/**
 * Interpreta coordenadas pegadas por el usuario: enlaces de Google Maps o
 * pares "lat, lng" sueltos.
 *
 * Por que existe: geocodificar automaticamente los nombres de ubicacion acierta
 * ~20% de las veces (y a veces se equivoca con confianza: un "EDIF. N 3" cayo
 * sobre un puente a 12 km). El usuario que conoce el terreno pega el enlace
 * correcto en segundos. Esta funcion hace que eso sea fiable.
 */

export type GeoParseResultado =
  | { ok: true; lat: number; lng: number; fuente: 'coordenadas' | 'enlace' }
  | { ok: false; motivo: 'vacio' | 'acortado' | 'sin_coordenadas' | 'fuera_de_rango' };

/** Rango válido de coordenadas terrestres. */
function enRango(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    // 0,0 es el "null island": casi siempre un parseo fallido, no una coordenada real.
    !(lat === 0 && lng === 0)
  );
}

/**
 * Extrae lat/lng de texto pegado.
 *
 * Orden de preferencia dentro de una URL de Google Maps:
 *   1. !3d<lat>!4d<lng>  -> coordenadas REALES del marcador
 *   2. ?q= / ?query= / ll= -> coordenadas explícitas del enlace
 *   3. @<lat>,<lng>      -> SOLO el centro del viewport (último recurso)
 *
 * El orden importa: en el enlace de la Universidad de Concepción el segmento @
 * decía -73.6454431 mientras el marcador real estaba en -73.0357019, unos 50 km
 * de diferencia. Preferir @ daría una coordenada equivocada con toda confianza.
 */
export function parseCoordenadas(texto: string): GeoParseResultado {
  const t = (texto ?? '').trim();
  if (!t) return { ok: false, motivo: 'vacio' };

  // Los enlaces cortos (maps.app.goo.gl / goo.gl/maps) no contienen coordenadas:
  // hay que seguir la redirección, cosa que el navegador no puede hacer por CORS.
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(t)) {
    return { ok: false, motivo: 'acortado' };
  }

  const esUrl = /^https?:\/\//i.test(t) || t.includes('google.') || t.includes('/maps');

  if (esUrl) {
    // 1. Marcador real.
    const marcador = t.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (marcador) {
      const lat = parseFloat(marcador[1]);
      const lng = parseFloat(marcador[2]);
      if (enRango(lat, lng)) return { ok: true, lat, lng, fuente: 'enlace' };
    }

    // 2. Parámetros explícitos (?q=, ?query=, &ll=).
    const parametro = t.match(/[?&](?:q|query|ll|center|destination)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (parametro) {
      const lat = parseFloat(parametro[1]);
      const lng = parseFloat(parametro[2]);
      if (enRango(lat, lng)) return { ok: true, lat, lng, fuente: 'enlace' };
    }

    // 3. Centro del viewport: aproximado, pero mejor que nada.
    const viewport = t.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (viewport) {
      const lat = parseFloat(viewport[1]);
      const lng = parseFloat(viewport[2]);
      if (enRango(lat, lng)) return { ok: true, lat, lng, fuente: 'enlace' };
    }

    return { ok: false, motivo: 'sin_coordenadas' };
  }

  // Par suelto: "-36.8299341, -73.0357019" (coma, punto y coma o espacios).
  const par = t.match(/^(-?\d+[.,]?\d*)\s*[;,\s]\s*(-?\d+[.,]?\d*)$/);
  if (par) {
    // Ojo: no confundir el separador decimal europeo con el separador de par.
    const lat = parseFloat(par[1].replace(',', '.'));
    const lng = parseFloat(par[2].replace(',', '.'));
    if (enRango(lat, lng)) return { ok: true, lat, lng, fuente: 'coordenadas' };
    return { ok: false, motivo: 'fuera_de_rango' };
  }

  return { ok: false, motivo: 'sin_coordenadas' };
}

/** Mensaje para mostrar al usuario cuando el pegado no se pudo interpretar. */
export function mensajeError(motivo: Exclude<GeoParseResultado, { ok: true }>['motivo']): string {
  switch (motivo) {
    case 'acortado':
      return 'Ese es un enlace corto. Ábrelo en Google Maps y copia la URL completa de la barra de direcciones.';
    case 'fuera_de_rango':
      return 'Las coordenadas están fuera de rango (latitud -90 a 90, longitud -180 a 180).';
    case 'vacio':
      return '';
    default:
      return 'No encontré coordenadas. Pega un enlace de Google Maps o un par "latitud, longitud".';
  }
}

/** Formatea para mostrar; 6 decimales = ~0.1 m, suficiente para una ubicacion. */
export function formatearCoordenadas(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
