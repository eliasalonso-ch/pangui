import { DM_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata = {
  title: "Pangui",
  description: "Gestión de órdenes de trabajo",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pangui",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#273D88",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={dmSans.variable}>
      <head>
        <link rel="preconnect" href="https://yqwsryjbmlvcghnwnzik.supabase.co" />
        <link rel="dns-prefetch" href="https://yqwsryjbmlvcghnwnzik.supabase.co" />
        <link rel="preload" as="image" href="/pangui-logo.svg" />
      </head>
      <body>
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
