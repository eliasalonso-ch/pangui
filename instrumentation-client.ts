// Sentry client/browser init. The filename `instrumentation-client.ts` is a
// Next.js convention — it runs before the app hydrates.
import * as Sentry from "@sentry/nextjs";
// Standalone code list — deliberately NOT imported from lib/work-orders, which
// pulls in the Supabase client and would land it in the pre-hydration bundle.
import { isExpectedCommandCode } from "@/lib/work-orders/expected-codes";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // See sentry.server.config.ts — NODE_ENV guard keeps `next dev` noise out of
  // the production issue stream.
  enabled:
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    process.env.NODE_ENV !== "development",

  environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Session Replay — record sessions to debug visually.
  // We rely on PostHog for product-analytics replay; keep Sentry replay only
  // on errors to avoid double-recording overhead.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // NOTE: replayIntegration is deliberately NOT listed here. Importing it
  // statically pulls the rrweb recorder into the main framework chunk, which
  // measured 571KB / ~3.0s of JS execution on the critical path of EVERY route
  // — including the marketing pages — even though replaysSessionSampleRate is
  // 0 and replay therefore only ever fires on an error. It is loaded lazily
  // after the page settles instead (see below).
  integrations: [],

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
    const err = hint?.originalException as
      | { name?: string; message?: string; code?: string }
      | undefined;
    if (
      err?.name === "AbortError" &&
      typeof err.message === "string" &&
      err.message.includes("Lock broken by another request with the 'steal' option")
    ) {
      return null; // benign auth-lock recovery — don't report
    }

    // Work-order commands reject unmet business rules the only way PL/pgSQL
    // can: RAISE EXCEPTION. So "you must finish the required procedures first"
    // reaches us as a P0001 error even though it is the rule working correctly.
    // Keep these visible — they show which requisitos users actually hit — but
    // as warnings, so they don't page anyone. Unrecognised codes stay errors.
    if (isExpectedCommandCode(err?.code)) {
      event.level = "warning";
      event.fingerprint = ["work-order-command", err!.code!];
      event.tags = { ...event.tags, work_order_command_code: err!.code! };
    }

    return event;
  },

  debug: false,
});

/**
 * Load Session Replay off the critical path.
 *
 * Timing matters: `replaysOnErrorSampleRate` replays the buffered moments
 * BEFORE the error, so the integration has to be recording by the time one
 * happens — loading it in response to an error would capture nothing. So we
 * load it as soon as the browser is idle, rather than on demand.
 *
 * `lazyLoadIntegration` fetches the bundle from Sentry's CDN. This app
 * deliberately tunnels Sentry through /monitoring to survive ad-blockers, and
 * that tunnel does NOT cover this CDN fetch — so a blocked or failed load is
 * an expected outcome, not an error. It is swallowed: losing replay is
 * acceptable, breaking the page is not. Error and trace reporting are
 * unaffected either way, since those go through the tunnel.
 */
if (
  typeof window !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
  process.env.NODE_ENV !== "development"
) {
  const loadReplay = () => {
    Sentry.lazyLoadIntegration("replayIntegration")
      .then((replayIntegration) => {
        const client = Sentry.getClient();
        if (!client) return;
        client.addIntegration(
          replayIntegration({ maskAllText: true, blockAllMedia: true }),
        );
      })
      .catch(() => {
        // CDN blocked or offline — carry on without replay.
      });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(loadReplay, { timeout: 5000 });
  } else {
    window.setTimeout(loadReplay, 3000);
  }
}

// Instruments client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
