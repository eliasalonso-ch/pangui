/**
 * Cloudflare Image Resizing helper.
 *
 * R2 stores originals — full-size camera photos, often several MB. Rendering
 * those directly into a thumbnail grid downloads the whole file for every tile.
 * Routing through `/cdn-cgi/image/...` makes Cloudflare serve a resized,
 * re-encoded variant instead, so a grid of thumbnails costs a fraction of the
 * bandwidth and decodes far faster.
 *
 * Left untouched (returned as-is):
 * - data:/blob: URLs — local, nothing to fetch.
 * - non-http(s) URLs and unparseable strings.
 * - *.r2.dev hosts — the dev bucket domain does not run the image pipeline,
 *   and rewriting those would produce a 404.
 *
 * DESACTIVADO (2026-08-10): la zona de cdn.getpangui.com no tiene habilitado
 * Cloudflare Image Resizing, así que /cdn-cgi/image/... responde 404 y TODAS
 * las miniaturas de la app salían rotas. Se devuelve el original hasta activar
 * el producto en Cloudflare (Speed → Optimization → Image Resizing); al
 * hacerlo basta con poner ENABLED en true para recuperar el ahorro de ancho
 * de banda.
 */
const ENABLED = false;
export function optimizedImageUrl(url: string, width: number): string {
  if (!ENABLED) return url;
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || parsed.hostname.endsWith("r2.dev")) return url;
    return `${parsed.origin}/cdn-cgi/image/width=${width},quality=72,format=auto${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
