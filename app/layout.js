import { DM_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata = {
  title: "Pangi",
  description: "Gestión de órdenes de trabajo",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pangi",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2C2418",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={dmSans.variable}>
      <body>
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
