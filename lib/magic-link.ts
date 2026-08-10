/**
 * Pure helpers for the magic-link sign-in flow.
 *
 * Kept free of React and Supabase so the rules can be tested directly, per the
 * repo's testing convention.
 */

/**
 * Supabase enforces a minimum interval between auth emails to the same address
 * (Authentication → Emails → "Minimum interval per user", currently 60s).
 *
 * Asking again inside that window fails server-side, so the UI has to hold the
 * button and show the wait rather than letting someone tap into an error.
 */
export const RESEND_INTERVAL_MS = 60_000;

/** Seconds left before another link may be requested for the same address. */
export function resendCooldownSeconds(
  nowMs: number,
  lastSentMs: number | null,
  intervalMs: number = RESEND_INTERVAL_MS,
): number {
  if (lastSentMs == null) return 0;
  const remaining = intervalMs - (nowMs - lastSentMs);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Normalizes an address the way the auth call should receive it: trimmed and
 * lowercased, matching what signInWithPassword did before.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Deliberately permissive: the server is the authority on whether an address
 * exists and can receive mail. This only catches obvious typos before spending
 * a request and starting a 60s cooldown on a malformed address.
 */
export function isPlausibleEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (email.length < 5 || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * Digits in the emailed code.
 *
 * MUST match Supabase's "Email OTP Length" (Authentication → Providers →
 * Email). If the two disagree the boxes silently truncate — or never complete —
 * a perfectly valid code, and every login fails with "código incorrecto".
 * The project briefly ran 8 here; it is 6 now.
 */
export const OTP_LENGTH = 6;

export function normalizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function isCompleteOtpCode(raw: string): boolean {
  return normalizeOtpCode(raw).length === OTP_LENGTH;
}
