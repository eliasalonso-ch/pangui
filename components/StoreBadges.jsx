/**
 * Botones oficiales de App Store y Google Play.
 *
 * Ambas tiendas exigen su propio arte (no un botón dibujado a mano) y fijan
 * proporciones y márgenes mínimos. Se dibujan como SVG inline en vez de
 * enlazar imágenes externas: la CSP de la app bloquea hosts de terceros y así
 * el badge no depende de una descarga que puede fallar.
 *
 * Directrices: developer.apple.com/app-store/marketing/guidelines
 *              partnermarketinghub.withgoogle.com/brands/google-play
 */

export const APP_STORE_URL = "https://apps.apple.com/us/app/pangui/id6778224520";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.pangui.app&hl=es_419";

/** Altura estándar del badge; el ancho se deriva de la proporción oficial. */
const DEFAULT_HEIGHT = 44;

export function AppStoreBadge({ height = DEFAULT_HEIGHT }) {
  // Proporción oficial 120x40.
  const width = Math.round((height * 120) / 40);
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Descargar Pangui en el App Store"
      style={{ display: "inline-block", lineHeight: 0 }}
    >
      <svg width={width} height={height} viewBox="0 0 120 40" role="img" aria-hidden="true">
        <rect width="120" height="40" rx="6.75" fill="#000" />
        <rect x="0.5" y="0.5" width="119" height="39" rx="6.25" fill="none" stroke="#A6A6A6" strokeWidth="1" />
        {/* Manzana */}
        <path
          fill="#fff"
          d="M24.77 20.3c-.02-2.4 1.96-3.56 2.05-3.62-1.12-1.64-2.86-1.86-3.48-1.89-1.48-.15-2.9.87-3.65.87-.75 0-1.92-.85-3.16-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.91-.43 7.22 1.2 9.58.8 1.16 1.75 2.45 3 2.4 1.21-.05 1.67-.78 3.13-.78s1.87.78 3.14.75c1.3-.02 2.12-1.17 2.91-2.33.92-1.34 1.3-2.63 1.32-2.7-.03-.01-2.53-.97-2.55-3.84zM22.36 13.24c.66-.8 1.11-1.91.99-3.02-.95.04-2.11.64-2.8 1.42-.61.7-1.15 1.83-1.01 2.91 1.07.08 2.16-.54 2.82-1.31z"
        />
        {/* Texto */}
        <text x="34" y="16" fill="#fff" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="7.5">
          Descárgalo en el
        </text>
        <text x="34" y="30" fill="#fff" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="16" fontWeight="500">
          App Store
        </text>
      </svg>
    </a>
  );
}

export function GooglePlayBadge({ height = DEFAULT_HEIGHT }) {
  // Proporción oficial 155x46.
  const width = Math.round((height * 155) / 46);
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Descargar Pangui en Google Play"
      style={{ display: "inline-block", lineHeight: 0 }}
    >
      <svg width={width} height={height} viewBox="0 0 155 46" role="img" aria-hidden="true">
        <rect width="155" height="46" rx="7" fill="#000" />
        <rect x="0.5" y="0.5" width="154" height="45" rx="6.5" fill="none" stroke="#A6A6A6" strokeWidth="1" />
        {/* Triángulo de Play, en sus cuatro colores */}
        <g transform="translate(11 11)">
          <path fill="#00D3FF" d="M.42.42A1.5 1.5 0 0 0 0 1.47v21.06c0 .42.15.79.42 1.05l.07.07L12.3 12.06v-.12L.49.35z" />
          <path fill="#FFCE00" d="M16.23 15.99l-3.93-3.93v-.12l3.93-3.93.09.05 4.66 2.65c1.33.75 1.33 1.99 0 2.75l-4.66 2.65z" />
          <path fill="#FF3A44" d="M16.32 15.94L12.3 12 .42 23.88c.44.46 1.16.52 1.98.06l13.92-7.9" />
          <path fill="#00C400" d="M16.32 8.06L2.4 .16C1.58-.3.86-.24.42.22L12.3 12z" />
        </g>
        <text x="42" y="19" fill="#fff" fontFamily="Roboto, Arial, sans-serif" fontSize="8" letterSpacing="0.6">
          DISPONIBLE EN
        </text>
        <text x="42" y="35" fill="#fff" fontFamily="Roboto, Arial, sans-serif" fontSize="17" fontWeight="500">
          Google Play
        </text>
      </svg>
    </a>
  );
}

/** Los dos badges juntos, con la separación mínima que piden las tiendas. */
export function StoreBadges({ height = DEFAULT_HEIGHT, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", ...style }}>
      <AppStoreBadge height={height} />
      <GooglePlayBadge height={height} />
    </div>
  );
}
