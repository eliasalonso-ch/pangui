// Web app manifest. The icons already existed in public/icons/ but nothing
// referenced them as a manifest, so the PWA/installability checks all failed.
export default function manifest() {
  return {
    name: "Pangui · Órdenes de trabajo y mantenimiento",
    short_name: "Pangui",
    description:
      "Software de órdenes de trabajo (CMMS) para contratistas y empresas de servicios de mantención.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F8FA",
    theme_color: "#0B1220",
    lang: "es-CL",
    icons: [
      {
        src: "/icons/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icons/favicon.svg", type: "image/svg+xml", sizes: "any" },
    ],
  };
}
