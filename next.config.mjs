import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  async redirects() {
    return [
      // Canonical host is the apex. Vercel's project settings already redirect
      // www -> apex (308), but that lives in the dashboard, outside the repo,
      // and was in fact inverted until 2026-08-20 — the apex 307'd to www while
      // every canonical, og:url, sitemap <loc> and JSON-LD url in the code said
      // https://getpangui.com. Keeping the rule here too means the decision is
      // version-controlled and cannot silently regress.
      //
      // Must stay FIRST: host normalization before any path rewriting.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.getpangui.com" }],
        destination: "https://getpangui.com/:path*",
        permanent: true,
      },
      {
        source: "/activos",
        destination: "/activos/activos",
        permanent: false,
      },
      {
        source: "/activos/:vista(todos|criticos|semi-criticos|no-criticos)",
        destination: "/activos/activos",
        permanent: true,
      },
      {
        source: "/partes",
        destination: "/partes/materiales",
        permanent: false,
      },
      {
        source: "/ordenes",
        destination: "/ordenes/lista",
        permanent: false,
      },
      {
        source: "/ubicaciones",
        destination: "/ubicaciones/ubicaciones",
        permanent: false,
      },
      {
        source: "/notificaciones",
        destination: "/notificaciones/bandeja",
        permanent: false,
      },
      {
        source: "/notificaciones/avisos",
        destination: "/notificaciones/bandeja",
        permanent: true,
      },
      {
        source: "/reglas-alerta",
        destination: "/notificaciones/reglas-alerta",
        permanent: true,
      },
      {
        source: "/preferencias-notificaciones",
        destination: "/notificaciones/preferencias",
        permanent: true,
      },
      {
        source: "/preferencias-notificaciones/reglas-alerta",
        destination: "/notificaciones/reglas-alerta",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Vercel already sends max-age=63072000; this adds subdomain coverage.
          // n.getpangui.com (the PostHog reverse proxy) already serves HTTPS,
          // so includeSubDomains is safe. `preload` is deliberately omitted —
          // submitting to the preload list is effectively irreversible.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // camera and microphone are NOT denied: OTDetail records audio notes
          // (getUserMedia) and uses capture="environment" for photo evidence.
          // geolocation is unused by the web app.
          {
            key: "Permissions-Policy",
            value: "geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
          },
        ],
      },
    ];
  },
  experimental: {
    viewTransition: true,
  },
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project for source map upload (runs at build time).
  org: "alonso-technologies-spa",
  project: "javascript-nextjs",

  // Auth token for uploading source maps. Set SENTRY_AUTH_TOKEN in CI / .env.local.
  // Without it, the build still works but source maps won't upload.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI.
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time).
  widenClientFileUpload: true,

  // Route browser Sentry requests through /monitoring to bypass ad-blockers.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry debug logging to reduce bundle size.
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },

  // Skip source map upload when no auth token is present (e.g. local dev builds).
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
