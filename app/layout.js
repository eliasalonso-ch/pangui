import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./PostHogProvider";
import { QueryProvider } from "./QueryProvider";
import { structuredData } from "./structured-data";

const inter = Inter({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const SITE_URL = "https://getpangui.com";
const SITE_DESCRIPTION =
  "Pangui es el software de órdenes de trabajo (CMMS) para contratistas y empresas de servicios de mantención en Chile. Planifica, ejecuta y respalda OTs, activos, materiales y evidencia — desde la oficina hasta el celular del técnico. Prueba gratis 30 días.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Pangui | Software de Órdenes de Trabajo y Mantenimiento (CMMS) para Contratistas en Chile",
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
    url: SITE_URL,
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
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
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
    <html lang="es" className={`${inter.variable} ${geist.variable}`} suppressHydrationWarning>
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
            body-level script tag against them (hydration mismatch). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        <PostHogProvider>
          <QueryProvider>{children}</QueryProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
