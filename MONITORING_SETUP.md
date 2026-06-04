# Monitoring & Analytics Setup — pangui (web)

Sentry (errors/performance) and PostHog (product analytics) are wired into the
Next.js app. Code is gated on env vars: **with no keys set, both are no-ops**, so
nothing breaks locally before you add credentials.

## 1. Fill the env vars

Edit `.env.local` (already has placeholders):

```
NEXT_PUBLIC_SENTRY_DSN=        # Sentry > Project > Settings > Client Keys (DSN)
NEXT_PUBLIC_SENTRY_ENV=production
SENTRY_AUTH_TOKEN=             # Sentry > Settings > Auth Tokens (build-time only)

NEXT_PUBLIC_POSTHOG_KEY=       # PostHog > Project Settings > Project API Key
NEXT_PUBLIC_POSTHOG_HOST=https://n.getpangui.com   # managed reverse proxy (anti ad-block)
```

> **PostHog reverse proxy:** `n.getpangui.com` is a PostHog *managed* reverse proxy
> (CNAME → `*.cf-prod-us-proxy.proxyhog.com`) that routes analytics through our own
> domain so ad-blockers don't drop events. The underlying region is **US**. If the
> proxy is ever removed, fall back to `https://us.i.posthog.com`.

In your hosting provider (Vercel, etc.), add the same vars to the project's
environment. `SENTRY_AUTH_TOKEN` only needs to exist in the **build** environment.

## 2. What's wired

| Concern | Where |
|---|---|
| Sentry client init + replay-on-error | `instrumentation-client.ts` |
| Sentry server init | `sentry.server.config.ts` |
| Sentry edge init | `sentry.edge.config.ts` |
| Server/edge bootstrap + RSC error hook | `instrumentation.ts` |
| Build wrapping + source map upload | `next.config.mjs` (`withSentryConfig`) |
| Global error boundary | `app/global-error.js` |
| PostHog init + pageviews + autocapture + replay | `app/PostHogProvider.jsx` |
| identify()/setUser on auth | `app/(app)/AnalyticsIdentity.jsx` |
| `signed_in` event | `app/login/LoginForm.jsx` |

- PostHog **autocapture** (clicks/inputs) and **session replay** are ON in
  production only (disabled in dev). Inputs are masked.
- Sentry **session replay** records only on errors (to avoid double-recording
  with PostHog).
- `tunnelRoute: "/monitoring"` routes Sentry through your domain to dodge ad-blockers.

## 3. Verify

```
npm run build      # source maps upload if SENTRY_AUTH_TOKEN is set
npm run dev
```

Trigger a test error (e.g. throw in a client component) and confirm it lands in
Sentry. Confirm a `$pageview` and `signed_in` event in PostHog Live Events.
