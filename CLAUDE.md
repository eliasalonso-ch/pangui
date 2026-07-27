# pangui (web)

> **Read `ENGINEERING_STANDARDS.md` before changing anything that touches the database,
> work-order state, notifications, or uploads.** It is the canonical rulebook for this
> repo *and* `pangui-native-stable` (mobile). Both apps share one Supabase project.

Stack: Next.js (App Router) + Supabase + TypeScript.

## Non-negotiables

- **The server decides, the client explains.** Never `UPDATE ordenes_trabajo SET estado`
  from app code — go through `transition_work_order_v1`. Closure rules (materials,
  sheets, photos, blocking procedures) are enforced in Postgres; client checks exist only
  to grey out a button early.
- **`supabase/migrations` in THIS repo is canonical.** Mobile's directory is frozen.
  Until the two histories are reconciled (41 mobile files are missing here, and prod is
  ahead of both), **additive DDL only** — no `DROP`, no new `NOT NULL`, no type narrowing.
- **Migrations are idempotent** (`IF NOT EXISTS` / `CREATE OR REPLACE` / guarded `DO $$`)
  and never edited after being applied. Fix forward.
- **Regenerate types in both repos** in the same PR as a migration:
  `npx supabase gen types typescript --project-id yqwsryjbmlvcghnwnzik > types/supabase.ts`
- **One user action = one server call.** A client-side sequence of writes has no rollback.
- **Every mutating command carries an idempotency key**; side effects go through the
  notification outbox, never fired inline from a callback.
- **Ship both apps together.** A rule that lands in one client first is a rule the other
  is already violating.
- **Never break a published mobile build** — old builds run for months. Version commands
  (`_v2`), don't mutate them.

## Testing

Every feature ships with a test. Extract decisions into pure, dependency-free modules and
test those directly — if a test needs heavy Supabase/DOM mocking, the logic is in the
wrong place. Run the suite on a clean tree first and report the baseline
("3 failures, same 3 as before"), never a bare "tests pass".

Known pre-existing failures (2026-07-27): `tests/components/sidebar.test.tsx`,
`login.test.tsx`, `AppSidebar.test.tsx` — 3 files / 15 tests, unrelated to domain logic.
Pre-existing lint: 1 error + 1 warning in `components/HojaSpreadsheet.tsx`
(props mutation at the column-add path, exhaustive-deps on the export effect).

## Conventions

- Supabase access goes through `lib/*-api.ts`, not inline in components.
- CSS custom properties for theming (`var(--fg-1)`, `var(--brand)`, `var(--surface-1)`) —
  no hardcoded colors.
- Deep link to an OT: `/ordenes?id=<ordenId>`. `panel` only accepts `crear`; there is no
  tab deep-link.

## Practice

Read the whole flow before editing; reuse before building; prefer no new dependency and
no new schema. Verify (typecheck, lint, tests) before reporting done, and say what you
ran. Never commit, push, or deploy unless asked.
