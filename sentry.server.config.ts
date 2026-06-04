// Sentry server-side init (Node.js runtime). Loaded via instrumentation.ts.
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring. Lower this in high-traffic production if needed.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Only send events when a DSN is configured.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,

  // Set to true temporarily to debug Sentry itself.
  debug: false,
});
