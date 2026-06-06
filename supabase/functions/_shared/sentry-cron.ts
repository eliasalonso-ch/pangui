// Sentry Cron Monitoring helper for Supabase (Deno) edge functions.
//
// These jobs are triggered by pg_cron (not Vercel/node-cron), so we use the
// two-step check-in API directly: an "in_progress" check-in when the job
// starts, then "ok" or "error" when it finishes. Sentry alerts if a job is
// missed (didn't start) or fails (errored / exceeded maxRuntime).
//
// The monitor config is upserted from code, so the monitor auto-creates in
// Sentry with the right schedule — no manual dashboard setup needed.
//
// No-op when SENTRY_DSN isn't set in the function's env, so it's safe to deploy
// before configuring the DSN.
import * as Sentry from "https://esm.sh/@sentry/deno@8.47.0";

let initialized = false;

function ensureInit(): boolean {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return false;
  if (!initialized) {
    Sentry.init({
      dsn,
      environment: Deno.env.get("SENTRY_ENV") ?? "production",
      tracesSampleRate: 0,
    });
    initialized = true;
  }
  return true;
}

interface MonitorOptions {
  // Cron expression matching the pg_cron schedule (e.g. "0 * * * *").
  schedule: string;
  // Grace period before a missing check-in counts as "missed" (minutes).
  checkinMargin?: number;
  // Max runtime before the job is considered failed (minutes).
  maxRuntime?: number;
  timezone?: string;
}

/**
 * Wraps a cron job body with Sentry check-ins. Reports in_progress on start,
 * ok on success, error on throw — then re-throws so the function still returns
 * its normal error response. Returns the job's result.
 */
export async function withCronMonitor<T>(
  monitorSlug: string,
  options: MonitorOptions,
  job: () => Promise<T>,
): Promise<T> {
  if (!ensureInit()) {
    // Sentry not configured — run the job unmonitored.
    return job();
  }

  const monitorConfig = {
    schedule: { type: "crontab" as const, value: options.schedule },
    checkinMargin: options.checkinMargin ?? 5,
    maxRuntime: options.maxRuntime ?? 10,
    timezone: options.timezone ?? "America/Santiago",
  };

  const checkInId = Sentry.captureCheckIn(
    { monitorSlug, status: "in_progress" },
    monitorConfig,
  );

  try {
    const result = await job();
    Sentry.captureCheckIn({ checkInId, monitorSlug, status: "ok" }, monitorConfig);
    return result;
  } catch (err) {
    Sentry.captureCheckIn({ checkInId, monitorSlug, status: "error" }, monitorConfig);
    Sentry.captureException(err);
    await Sentry.flush(2000);
    throw err;
  }
}
