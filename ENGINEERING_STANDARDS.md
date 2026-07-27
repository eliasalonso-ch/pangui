# Pangui — Engineering Standards

Canonical rules for **both** apps: `pangui` (web, Next.js) and `pangui-native-stable`
(mobile, Expo). One Supabase project backs both.

This file is the law. When code and this file disagree, one of them is a bug —
decide which, fix it, and say so in the PR.

**Status of this document:** written 2026-07-27, after auditing the actual code.
Where it says "done", that was verified against migrations and source, not assumed.

---

## 0. The root problem we are eliminating

> Two clients each hold permission to partially execute a critical operation, and
> each decides on its own what "finished correctly" means.

Every rule below exists to remove that. The fix is not "make web and mobile match" —
it is **move the decision to one place (Postgres) so there is nothing to match**.

---

## 1. Where logic is allowed to live

| Concern | Home | Clients may |
|---|---|---|
| State transitions (start/pause/resume/complete/cancel/reopen) | `transition_work_order_v1` | Call it, render its errors |
| Closure requirements (materials, sheets, photos, procedures) | `transition_work_order_v1` + triggers | Preview why the button is disabled |
| Creating OTs / sub-OTs | `create_work_order_v1`, `create_sub_work_order_v1` | Call them |
| Editing OT fields | `edit_work_order_v1` | Call it |
| Notification fan-out | `work_order_notification_outbox` | Nothing |
| Presentation, navigation, offline queueing | Client | Everything |

**Rule 1.1 — The server decides, the client explains.**
A client may re-implement a rule *only* to grey out a button early. It must never be
the sole enforcement. If the client check and the server disagree, the server wins and
the client check is the bug.

**Rule 1.2 — No client writes `estado` directly.**
`UPDATE ordenes_trabajo SET estado = ...` from app code is forbidden. Go through the
transition command. This is what makes closure rules unskippable.

**Rule 1.3 — New business rules land in SQL first.**
Write the migration, then the two clients. Never the reverse: a rule that ships in a
client first is a rule the other client is already violating.

---

## 2. Migrations — single canonical directory

**This is the most dangerous open problem. Read this section before touching the DB.**

Today (verified 2026-07-27):
- `pangui/supabase/migrations` — 141 files
- `pangui-native-stable/supabase/migrations` — 61 files
- **41 mobile migrations do not exist in the web repo**, including schema-defining ones:
  `multi_tenant_isolation`, `orden_partes`, `orden_numero`, `rls_fixes`,
  `requiere_hoja`, `requiere_materiales`, `enforce_ot_photo_completion`.
- Production contains migrations absent from both clones, so `supabase db push` fails.

**Rule 2.1 — `pangui/supabase/migrations` is the only canonical directory.**
Mobile's directory is frozen: no new files there. It stays only until reconciliation
is done, then it is deleted.

**Rule 2.2 — Until reconciliation lands, no destructive DDL.**
No `DROP`, no `ALTER ... DROP COLUMN`, no type narrowing, no new `NOT NULL` on an
existing column. Additive only (`ADD COLUMN ... NULL`, `CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`). We cannot safely reason about a schema we cannot rebuild.

**Rule 2.3 — Every migration is idempotent and re-runnable.**
`IF NOT EXISTS` / `CREATE OR REPLACE` / guarded `DO $$` blocks. Given the split
history, assume any migration may be applied twice or out of order.

**Rule 2.4 — Migrations are never edited after being applied anywhere.**
Fix forward with a new file.

**Rule 2.5 — A feature needs a migration only if it needs one.**
Reusing existing tables and RLS is not a shortcut, it is the preferred outcome. Adding
schema "to be explicit" adds drift risk for zero gain. Justify new schema in the PR.

---

## 3. Transactions and idempotency

Already built (verified): `work_order_commands` stores an idempotency key per command;
`work_order_notification_outbox` has a uniqueness index preventing duplicate sends;
`transition_work_order_v1` enforces state, procedures, materials, sheets, and photos.

**Rule 3.1 — One user action = one server call.**
If an action needs 3 inserts, it is one `SECURITY DEFINER` function, not 3 client
round-trips. A client-side sequence of writes has no rollback, and a failure at step 3
leaves steps 1–2 committed.

**Rule 3.2 — Every mutating command carries an idempotency key.**
Retries, double-taps, and outbox replays must converge to one result. This is not
optional for anything that notifies, charges, consumes stock, or changes state.

**Rule 3.3 — Side effects go through an outbox, never inline.**
Notifications, webhooks, and pushes are rows written in the same transaction, drained
by a worker. Never fire a notification from a client callback — that is how the
four-duplicate-notification bug happened.

**Rule 3.4 — External storage (R2) is not transactional. Model it explicitly.**
Uploads follow `pending → uploading → uploaded → attached → failed`, recorded
server-side (`ot_upload_intents_v1`). Without a server row, an empty folder and a lost
upload are indistinguishable.

---

## 4. Shared contract between the apps

**Rule 4.1 — Types are generated, never hand-written.**
```
npx supabase gen types typescript --project-id yqwsryjbmlvcghnwnzik > types/supabase.ts
```
Regenerate in **both** repos in the same PR as the migration. A hand-edited enum is how
web ended up not knowing `en_revision` and `cancelado` existed.

**Rule 4.2 — Enum values live in SQL (CHECK constraint or enum type).**
The DB is the source. Both clients derive from generated types. Never a client-side
literal union that Postgres has never heard of.

**Rule 4.3 — Ship both apps in the same change.**
A server rule change lands with both clients updated, or behind a flag that keeps the
old path valid until they are. Never leave one app broken "for now".

---

## 5. Mobile client versioning

Web deploys reach everyone at once; an old mobile build can run for months.

**Rule 5.1 — Never break a published build.**
Old builds hold direct table access and old RPC signatures. Adding a required column,
a stricter constraint, or a changed RPC signature breaks them in the field.

**Rule 5.2 — Version commands, don't mutate them.**
Add `..._v2`; keep `..._v1` until telemetry shows the old builds are gone.

**Rule 5.3 — Rollout changes are server-side.**
`work_order_rollout_v1` is per-workspace with a kill switch. Prefer flipping a server
flag over shipping a build. **Never OTA-push automatically — the user pushes when ready.**

---

## 6. Offline and source of truth

**Rule 6.1 — The server is the source of truth. SQLite is a cache and a queue.**
SQLite may hold copies and pending work. It must never be what decides whether an OT is
complete.

**Rule 6.2 — All SQLite access goes through `getDb()`.**
`lib/db/client.ts` serializes every read and write. A raw connection reintroduces the
shared-object-released crash.

**Rule 6.3 — Outbox actions must be replay-safe.**
They will run more than once. See Rule 3.2.

**Rule 6.4 — Know what the outbox action actually carries.**
Example: `fila.create` carries only `orden`, not `celdas` — copying a sheet in one call
would sync empty rows. Read the sync worker before composing actions.

---

## 7. Testing — required before production

**Rule 7.1 — No new feature ships without a test.** Non-negotiable.

**Rule 7.2 — Test the decision, not the framework.**
Extract the rules into a pure, dependency-free module (see
`features/hojas/copy-plan.ts`, `features/foto-grupos/permissions.ts`) and test that
directly. Mobile's default vitest suite is an explicit include list — **add your file to
`vitest.config.ts` or it silently never runs.**

**Rule 7.3 — Do not mock your way around an import.**
If a test needs heavy mocking of Supabase/SQLite/React Native, the logic is in the wrong
place. Extract it. (ESM `vi.spyOn` does not intercept intra-module calls — a test built
that way passes while testing nothing.)

**Rule 7.4 — The test must fail if the logic breaks.**
For each rule, ask: "what does this catch?" A test asserting the happy path only is
close to worthless.

**Rule 7.5 — Establish the baseline before claiming green.**
Run the suite on a clean tree first. Report "3 failures, same 3 as before my change",
never a bare "tests pass".

**Rule 7.6 — Priority order for domain coverage:**
RPC behaviour → state transitions → idempotency (call twice, assert once) → RLS →
partial-failure/rollback → contract parity between apps.

---

## 8. Observability

**Rule 8.1 — One `operation_id` / `correlation_id` per user action**, threaded through
creation, attachments, photos, procedures, activity, and notifications. Without it you
can see that something failed but not what caused it, or tell a retry from a new action.

**Rule 8.2 — Errors must name the rule.**
`SHEET_REQUIRED` and `MATERIALS_REQUIRED` beat a generic 400. Clients map codes to
Spanish copy; the code stays stable.

**Rule 8.3 — Triage before fixing.**
Confirm the failing call and client (`okhttp/…` = Android, dev-server noise ≠ product
bug) before changing code.

---

## 9. Working practice

**Rule 9.1 — Read the whole flow before editing.**
Trace every file the change touches. The smallest diff in the wrong place is a second bug.

**Rule 9.2 — Reuse before building.**
Check for an existing helper, hook, route, or pattern first.

**Rule 9.3 — Prefer no new dependency and no new schema.**

**Rule 9.4 — Match surrounding style** (mobile: inline styles + `useColors()` + `AppText`;
never hardcoded hex, never the deprecated static `colors` export).

**Rule 9.5 — Verify before reporting done.** Typecheck, lint, tests. State what you ran.
If something is unverified, say so.

**Rule 9.6 — Never commit, push, or deploy unless asked.**

**Rule 9.7 — Document deliberate shortcuts** with a comment naming the ceiling and the
upgrade path.

---

## 10. Definition of done

- [ ] Business rule enforced server-side (or explicitly justified as presentation-only)
- [ ] Migration in `pangui/supabase/migrations`, idempotent, additive
- [ ] `types/supabase.ts` regenerated in **both** repos
- [ ] Both apps updated, or the gap is flagged and safe
- [ ] Command idempotent; side effects via outbox
- [ ] Tests written and **registered in the runner**; baseline compared
- [ ] Typecheck + lint clean (pre-existing issues identified as such)
- [ ] Old published mobile builds still work

---

## Appendix A — Remediation order

Verified status as of 2026-07-27. Several items commonly reported as "missing" are in
fact built; the real work is finishing the migration and deleting legacy paths.

| # | Item | Status | Priority |
|---|---|---|---|
| 1 | **Reconcile migrations into one directory** | **Open — 41 mobile files missing from web; prod ahead of both** | **P0 — blocks safe DDL** |
| 2 | Transactional create/transition commands | **Built** (`create_work_order_v1`, `transition_work_order_v1`) | Finish rollout |
| 3 | Closure rules server-side | **Built** (procedures, materials, sheets, photos in `transition_work_order_v1`) | Verify parity, delete client duplicates |
| 4 | Idempotency | **Built** for OT commands (`work_order_commands`) | Extend to remaining mutations |
| 5 | Notification outbox | **Built** (`work_order_notification_outbox`, unique index) | Retire scattered senders |
| 6 | Upload intents | **Built** (`ot_upload_intents_v1`) | Verify both clients use it |
| 7 | Rollout gate | **Built** (`work_order_rollout_v1`, per-workspace + kill switch) | Drive to 100%, then delete legacy branches |
| 8 | State contract shared web/mobile | Partial — web type missing `en_revision`, `cancelado` | P1 |
| 9 | Dual-path code (v1 + legacy fallback) | Open — both paths live in `features/work-orders/api.ts` | P1 after rollout completes |
| 10 | Domain/contract test coverage | Thin | P1 |
| 11 | `operation_id` correlation | Open | P2 |
| 12 | Canonical read contracts | Open | P2 |
| 13 | Verified backup/restore drill | **Never tested** | P2 — an untested backup is a guess |

**The most valuable next step is #1.** Until the migration history is reconciled, every
other fix is being built on a schema no one can reproduce.

**The second is #9.** Dual-path code means the bug you fix in the v1 path may still be
live for workspaces on the legacy path — and it doubles the surface of every change.
