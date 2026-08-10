const SITE_URL = "https://getpangui.com";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/superadmin/",
          "/invite/",
          "/confirmar-reset/",
          "/reset-contrasena/",
          "/recuperar-contrasena/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
