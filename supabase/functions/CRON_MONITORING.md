# Sentry Cron Monitoring — Supabase Edge Functions

Two pg_cron jobs are monitored by Sentry so you're alerted if they stop running
or fail:

| Monitor slug | Function | pg_cron job | Schedule |
|---|---|---|---|
| `evaluar-alertas` | `evaluar-alertas` | `evaluar-alertas-cada-hora` | `0 * * * *` (hourly) |
| `export-schedules-cron` | `export-schedules-cron` | `export-schedules-tick` | `0 * * * *` (hourly) |

Both wrap their work in `withCronMonitor()` ([_shared/sentry-cron.ts](_shared/sentry-cron.ts)),
which sends an `in_progress` check-in on start and `ok`/`error` on finish, and
**upserts the monitor config** (schedule, maxRuntime) so the monitor auto-creates
in Sentry — no manual dashboard setup required.

## 1. Set the edge-function env vars

The helper is a **no-op until `SENTRY_DSN` is set** in the functions' environment.
Use the **web Sentry DSN** (`javascript-nextjs` project) — these are server-side
jobs, so they belong with the web errors, not a separate project.

```
supabase secrets set SENTRY_DSN="<your web project DSN>" --project-ref yqwsryjbmlvcghnwnzik
supabase secrets set SENTRY_ENV="production" --project-ref yqwsryjbmlvcghnwnzik
```

(Or set them in Supabase Dashboard → Edge Functions → Secrets.)

> The DSN is the same `NEXT_PUBLIC_SENTRY_DSN` value already in `.env.local`.
> It's safe to reuse.

## 2. Deploy the functions

```
supabase functions deploy evaluar-alertas --project-ref yqwsryjbmlvcghnwnzik
supabase functions deploy export-schedules-cron --project-ref yqwsryjbmlvcghnwnzik
```

## 3. First run creates the monitors

On the next hourly tick (or trigger manually), each function sends its first
check-in and the monitors appear under **Sentry → Crons** with the hourly
schedule already configured. If a job is later **missed** (didn't run) or
**fails** (errors / exceeds 10-min maxRuntime), Sentry creates an issue tagged
`monitor.slug`.

## 4. Verify

Trigger a function manually to see a check-in immediately:

```
curl -X POST "https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/evaluar-alertas" \
  -H "Content-Type: application/json" -d '{}'
```

Then check **Sentry → Crons** — the `evaluar-alertas` monitor should show a
green check-in.

## Notes

- DB-fetch failures inside the jobs now **throw** (previously returned a 500
  without surfacing), so they correctly register as cron failures + capture the
  exception with a stack trace.
- "No active rules" is still a normal success (`ok`), not a failure.
- To change a schedule, update both the pg_cron job AND the `schedule` value in
  the function's `withCronMonitor(...)` call so Sentry's expectation matches.
