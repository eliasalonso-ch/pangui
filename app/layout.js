import { Inter, Geist, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./PostHogProvider";
import { siteStructuredData } from "./structured-data";

// display:"swap" on every family. Without it next/font defaults to "optional",
// which hides text for up to 100ms and then gives up on the webfont — on slow
// 4G that shows as a blank hero and pushes both FCP and LCP out. swap paints
// the fallback immediately and upgrades when the font lands.
const inter = Inter({
  variable: "--font-heading",
  subsets: ["latin"],
  // All four weights stay: landing.css sets --font-body from this variable on
  // body, and the landing uses font-semibold/font-bold in 36 places.
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// The landing used to pull these from a blocking @import in landing.css, which
// cost ~1.36s of render-blocking time and re-downloaded Inter a second time.
// Self-hosting via next/font removes the blocking request entirely.
const interTight = Inter_Tight({
  variable: "--font-display-src",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = "https://getpangui.com";
// 152 chars. Google renders roughly 155-160 before truncating, and the previous
// 255-char version lost its last third — including "Prueba gratis 30 días",
// which is the line that actually converts.
const SITE_DESCRIPTION =
  "Software de órdenes de trabajo (CMMS) para contratistas de mantención en Chile. Planifica OTs, activos y evidencia desde terreno. Prueba gratis 30 días.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      // 55 chars. Google truncates around 60, and the old 89-char title was
      // cut mid-phrase in results — "para Contratistas en Chile" never showed.
      // CMMS and Chile stay because both are search terms; "Mantenimiento" is
      // dropped as the near-duplicate of "Órdenes de Trabajo".
      "Pangui | Software de Órdenes de Trabajo (CMMS) en Chile",
    template: "%s | Pangui",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "software de mantenimiento",
    "órdenes de trabajo",
    "CMMS",
    "GMAO",
    "software mantención Chile",
    "mantenimiento preventivo",
    "gestión de activos",
    "software para contratistas",
    "OT mantención",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    // No `url` here. A root-level og:url is inherited by every page that does
    // not set its own, so /privacidad and /terminos both advertised og:url =
    // the homepage while their canonical pointed at themselves — Ahrefs flags
    // that as "Open Graph URL not matching canonical", and a shared og:url
    // makes social shares of any subpage resolve to the landing. Pages that
    // want one set it explicitly; the rest simply omit it.
    siteName: "Pangui",
    locale: "es_CL",
    title: "Pangui | Software de Órdenes de Trabajo y Mantenimiento (CMMS)",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Pangui | Software de Órdenes de Trabajo y Mantenimiento (CMMS)",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
  icons: {
    // NOTE: /icons/favicon.svg is deliberately NOT listed. Despite the .svg
    // extension it is a 1912x1912 PNG base64-embedded in an SVG wrapper —
    // 218KB on disk, ~110KB over the wire. Browsers prefer the SVG icon when
    // offered, so listing it shipped 110KB on every page load for a favicon.
    // The real PNGs below are 3-25KB.
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${geist.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint theme: runs before any CSS-styled body content paints. MUST stay in <head> as the first script. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pangui_theme")||"auto";var resolved=t==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var d=document.documentElement;d.setAttribute("data-theme",resolved);d.setAttribute("data-theme-pref",t);d.style.colorScheme=resolved;d.style.backgroundColor=resolved==="dark"?"#0B1220":"#F7F8FA";}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://yqwsryjbmlvcghnwnzik.supabase.co" />
        <link rel="dns-prefetch" href="https://yqwsryjbmlvcghnwnzik.supabase.co" />
        {/* JSON-LD belongs in <head>: PostHog injects loader <script>s into
            <body> before hydration, and React would try to reconcile a
            body-level script tag against them (hydration mismatch).
            Only the site-wide nodes go here — FAQPage and Article are emitted
            by the pages they actually describe. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData) }}
        />
      </head>
      {/*
        QueryProvider is NOT here: it is app-only, and mounting it at the root
        shipped TanStack Query to every marketing visitor reading /precios. It
        now wraps the (app) route group instead — see app/(app)/layout.js.

        PostHog stays: it tracks marketing pageviews, which is conversion data.
      */}
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
