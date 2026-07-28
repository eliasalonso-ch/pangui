// Sentry edge-runtime init (middleware, edge routes). Loaded via instrumentation.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // See sentry.server.config.ts — NODE_ENV guard keeps `next dev` noise out of
  // the production issue stream.
  enabled:
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    process.env.NODE_ENV !== "development",

  environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,

  debug: false,
});
