const SITE_URL = "https://getpangui.com";

/**
 * lastModified is a hardcoded date per entry, updated by hand when the page's
 * content actually changes.
 *
 * It used to be `new Date()` for every URL, which told crawlers that the whole
 * site was modified on every single crawl — destroying the freshness signal
 * rather than providing one. A slightly stale honest date is worth far more
 * than a always-now lie.
 */
export default function sitemap() {
  return [
    { url: `${SITE_URL}/`, lastModified: "2026-08-20", changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/industrias`, lastModified: "2026-08-10", changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/casos-de-exito`, lastModified: "2026-08-10", changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/casos-de-exito/electrilam`, lastModified: "2026-08-10", changeFrequency: "yearly", priority: 0.7 },
    { url: `${SITE_URL}/precios`, lastModified: "2026-08-20", changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/demo`, lastModified: "2026-08-10", changeFrequency: "monthly", priority: 0.8 },
    // /registro is deliberately absent. It moved to app.getpangui.com, so the
    // apex URL now 308s and a sitemap must only list final, indexable URLs.
    // Listing the app host instead would be worse: it is a signup form with no
    // content to rank and is noindex behind the app layout.
    { url: `${SITE_URL}/privacidad`, lastModified: "2026-08-10", changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terminos`, lastModified: "2026-08-17", changeFrequency: "yearly", priority: 0.2 },
  ];
}
