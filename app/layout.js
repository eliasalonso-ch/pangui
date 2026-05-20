import { Inter, Geist } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Pangui",
  description: "Gestión de órdenes de trabajo",
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
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
