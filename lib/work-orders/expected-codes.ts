/**
 * Work-order command codes that mean "the user has not satisfied a business
 * rule yet", as opposed to "something broke".
 *
 * The server has no way to reject a command politely — PL/pgSQL can only abort
 * a transaction with RAISE EXCEPTION — so these arrive as Postgres P0001 errors
 * and surface at ERROR severity even though hitting one is the rule working as
 * designed. See work_order_command_error() in the command migrations.
 *
 * WHY ITS OWN MODULE: instrumentation-client.ts (Sentry init, runs before
 * hydration) reads this to downgrade these to warnings. Importing it from
 * commands-v1.ts instead would pull the Supabase client into that critical-path
 * bundle. Keep this file free of imports.
 *
 * Keep the set to codes the user can resolve by doing something differently.
 * Genuine faults — OT_NOT_FOUND, WORKSPACE_MISMATCH, COMMAND_PAYLOAD_MISMATCH —
 * stay errors so they keep paging.
 */
export const EXPECTED_COMMAND_CODES = new Set([
  "PROCEDURES_INCOMPLETE",
  "MATERIALS_REQUIRED",
  "SHEET_REQUIRED",
  "PHOTOS_REQUIRED",
  "FORCE_CLOSE_FORBIDDEN",
  "FORCE_CLOSE_REASON_REQUIRED",
  "CONFLICT",
  "INVALID_STATE_TRANSITION",
  "FORBIDDEN",
]);

export function isExpectedCommandCode(code: unknown): boolean {
  return typeof code === "string" && EXPECTED_COMMAND_CODES.has(code);
}
