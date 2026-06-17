// Sentry client/browser init. The filename `instrumentation-client.ts` is a
// Next.js convention — it runs before the app hydrates.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Session Replay — record sessions to debug visually.
  // We rely on PostHog for product-analytics replay; keep Sentry replay only
  // on errors to avoid double-recording overhead.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Drop noise from Supabase auth-js's Web Locks self-recovery. When an auth
  // token lock is orphaned (React Strict Mode double-mount / a component
  // unmounting mid-refresh under Next 16 + React 19 canary), auth-js re-acquires
  // it with `{ steal: true }`. Stealing rejects the previous holder's
  // navigator.locks promise with "AbortError: Lock broken by another request
  // with the 'steal' option." — an unhandled rejection that is by design and
  // benign (auth keeps working). Match this exact message so we still surface
  // real AbortErrors (e.g. genuinely aborted fetches).
  ignoreErrors: [/Lock broken by another request with the 'steal' option/i],

  beforeSend(event, hint) {
    const err = hint?.originalException as { name?: string; message?: string } | undefined;
    if (
      err?.name === "AbortError" &&
      typeof err.message === "string" &&
      err.message.includes("Lock broken by another request with the 'steal' option")
    ) {
      return null; // benign auth-lock recovery — don't report
    }
    return event;
  },

  debug: false,
});

// Instruments client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
