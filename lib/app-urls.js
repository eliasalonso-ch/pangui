/**
 * Absolute URLs for the app host, used from the marketing pages.
 *
 * The app moved to app.getpangui.com while marketing stayed on the apex, so a
 * relative "/registro" from a marketing page now hits a 308 in proxy.js. That
 * works, but it costs a redirect hop on the single most important conversion
 * path and Ahrefs flags every one of those links as "link to redirect" — link
 * equity is diluted and the crawl budget is spent on hops.
 *
 * Marketing pages must link here directly. Anything inside app/(app)/ should
 * keep using relative paths: it is already on this host, and an absolute URL
 * would force a full page load instead of a client-side navigation.
 */
const APP_HOST = "https://app.getpangui.com";

export const LOGIN_URL = `${APP_HOST}/login`;
export const REGISTRO_URL = `${APP_HOST}/registro`;

/** Signup deep-linked to a plan, e.g. planUrl("pro"). */
export function planUrl(plan) {
  return `${REGISTRO_URL}?plan=${encodeURIComponent(plan)}`;
}

/**
 * The marketing site root.
 *
 * Auth pages live on app.getpangui.com, where a relative href="/" resolves to
 * the app host's root — which proxy.js sends to /inicio, the dashboard. So the
 * logo and "Inicio" links on /login and /registro landed signed-in users in the
 * app instead of taking them back to the landing page.
 */
export const MARKETING_URL = "https://getpangui.com";
