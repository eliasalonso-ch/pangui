import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
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
