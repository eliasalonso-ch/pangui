/**
 * Carga del script de Google Maps, compartida por todos los mapas de la app.
 *
 * `callback=` es obligatorio y NO se puede sustituir por el onload del <script>:
 * con loading=async el onload dispara ANTES de que exista google.maps.Map (y ni
 * siquiera importLibrary está garantizado). Con callback, Google invoca la
 * función cuando las clases ya se pueden construir.
 *
 * Los dos parámetros van JUNTOS, que es el patrón que documenta Google:
 * loading=async deja que el bootstrap no bloquee el hilo principal, y callback
 * sigue avisando cuando las clases están listas. Sin loading=async la consola
 * avisa "loaded directly without loading=async" y la carga es más lenta.
 */

declare global {
  interface Window {
    google?: any;
    __panguiMapsPromise?: Promise<void>;
  }
}

export function cargarMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (window.__panguiMapsPromise) return window.__panguiMapsPromise;

  window.__panguiMapsPromise = new Promise<void>((resolve, reject) => {
    const CALLBACK = "__panguiMapsListo";
    (window as any)[CALLBACK] = () => {
      if (window.google?.maps?.Map) resolve();
      else reject(new Error("Google Maps se cargó de forma inesperada."));
      delete (window as any)[CALLBACK];
    };

    // Fast Refresh puede dejar el <script> de un intento fallido.
    document.querySelectorAll("script[data-pangui-maps]").forEach(el => el.remove());

    const s = document.createElement("script");
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${apiKey}` +
      `&language=es&region=CL&v=weekly&loading=async&callback=${CALLBACK}`;
    s.async = true;
    s.dataset.panguiMaps = "1";
    s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(s);
  });
  return window.__panguiMapsPromise;
}

/**
 * Estilo base: mapa limpio, sin puntos de interes de Google.
 *
 * Se apagan TODOS los POI de Google (cafés, tiendas, parques, escuelas…) y las
 * etiquetas de transporte. En este mapa lo único que debe llamar la atención
 * son los pines que puso el usuario; los POI de Google compiten con ellos y
 * confunden -- un icono de cafeteria se lee como si fuera una ubicacion propia.
 */
export const ESTILO_MAPA_LIMPIO = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

/**
 * Color de marca resuelto desde el DOM.
 *
 * Google Maps dibuja los marcadores en canvas y no entiende var(--brand), así
 * que hay que pasarle un color literal. Se lee en runtime para que siga el
 * tema claro/oscuro en vez de quedar hardcodeado.
 */
export function colorMarca(fallback = "#007AFF"): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  return v || fallback;
}

/**
 * Circulo como icono SVG para un marcador.
 *
 * Se prefiere sobre SymbolPath.CIRCLE porque ese rasteriza la etiqueta a baja
 * resolucion y el numero del marcador sale pixelado. Con SVG el texto se dibuja
 * sobre vector y queda nitido en cualquier zoom o densidad de pantalla.
 */
export function iconoCirculo(
  maps: any,
  { radio, color, opacidad = 1, borde = true }: {
    radio: number; color: string; opacidad?: number;
    /** Aro blanco alrededor del circulo; sin el, el pin se funde con el mapa. */
    borde?: boolean;
  },
) {
  const d = radio * 2;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + d + '" height="' + d +
    '" viewBox="0 0 ' + d + ' ' + d + '">' +
    '<circle cx="' + radio + '" cy="' + radio + '" r="' + (radio - 1.5) +
    '" fill="' + color + '" fill-opacity="' + opacidad +
    '" stroke="' + (borde ? '#fff' : 'none') + '" stroke-width="' + (borde ? 2 : 0) + '"/></svg>';
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new maps.Size(d, d),
    anchor: new maps.Point(radio, radio),
    labelOrigin: new maps.Point(radio, radio),
  };
}
