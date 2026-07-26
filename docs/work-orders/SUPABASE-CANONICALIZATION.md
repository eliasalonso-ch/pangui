# Supabase Canonicalization Audit

Status: **LEDGER ALIGNED LOCALLY — DEPLOYMENT STILL BLOCKED**  
Audited: **2026-07-25**  
Canonical source: `C:\dev\pangui\supabase`

## Current result

The exact 128 SQL files recorded by production were recovered using
`supabase migration fetch` in an isolated audit directory. They are now the
historical baseline in `pangui/supabase/migrations`.

The linked migration list now reports:

- 128 matched local/remote versions, from `20260421011115` through
  `20260706142925`;
- zero remote-only historical versions;
- four reviewed local-only migrations newer than production history.

The four pending migrations are:

1. `20260725160000_enforce_ot_photo_completion_reconcile.sql`
2. `20260725170000_work_order_create_commands_v1.sql`
3. `20260725180000_ot_upload_intents_v1.sql`
4. `20260725190000_work_order_rollout_v1.sql`

A linked `db push --dry-run --include-all` confirmed these are the only files
Supabase would apply. No production SQL, repair, deployment, or ledger mutation
was performed.

## Preserved legacy evidence

The previous web migration directory contained daily timestamps, duplicate
versions, suffixes rejected by CLI, and SQL whose content differed from the
production ledger. Those files were moved without deletion to:

`supabase/legacy-migrations-unreconciled`

The mobile repository remains a frozen legacy snapshot. Neither archive is an
executable migration source.

## Production precondition audit

`scripts/audit-work-order-schema.mjs` reads only the PostgREST OpenAPI schema;
it never selects table rows. It verified every production table and column
required by commands v1:

- users, workspaces and tenant references;
- OT fields, states, recurrence, timers and requirements;
- procedures and executions;
- materials and spreadsheet rows;
- photo groups, items and activity records.

The audit passed completely on 2026-07-25.

## Ownership decision

1. `pangui/supabase` owns every future migration and Edge Function.
2. `pangui-native-stable/supabase` must remain unchanged.
3. Historical fetched migrations are immutable.
4. New migrations require unique 14-digit UTC timestamps.
5. Production state and its fetched ledger are the historical authority.

## Remaining deployment gates

### Local schema rebuild — completed 2026-07-25

Docker Desktop was used to prove the database changes in isolation. Applying
the fetched ledger directly to an empty database correctly exposed that the
production history begins after foundational tables such as `orden_partes`
were created. Therefore, the 128 migrations are an exact ledger but are not a
self-contained baseline.

A schema-only production dump (no table rows) was saved outside the executable
migration directory at `supabase/bootstrap/20260725_production_public_schema.sql`.
Its SHA-256 is
`61C595F113E4580520EC559725F0DFF15E617D2564F9B099ED13CDFC28965BE6`.
An isolated local Supabase project successfully applied this baseline followed
by all four pending migrations.

### Local command tests — completed 2026-07-25

The two SQL suites under `supabase/tests` pass 57/57 assertions against the
rebuilt Docker database. They cover:

- authenticated root-OT creation and tenant isolation;
- exactly-once activity and notification intent creation;
- command replay and payload-mismatch protection;
- state transitions and optimistic edit conflicts;
- assignment, start, pause, resume, review, wait, cancellation and rejection
  after a terminal state;
- specialized edit activity events;
- mandatory-photo completion blocking;
- upload preparation, service finalization and replay idempotency;
- PDF attachment metadata and execution-origin preservation;
- expired-intent claiming, cleanup acknowledgement and terminal expiry;
- successful completion after verified photo metadata exists;
- rollout flags disabled by default.

The Supabase schema linter invokes protected functions without JWT claims and
therefore reports their intentional `UNAUTHENTICATED`/`FORBIDDEN` guards as
errors. Authenticated pgTAP execution is the authoritative functional check for
those functions; this linter limitation is not a migration failure.

### Client and Edge compatibility — completed 2026-07-25

- critical web command/rollout/upload/auth-retry tests plus OT metrics and row
  behavior: 142/142;
- complete mobile test suite: 130/130;
- web TypeScript: clean;
- mobile TypeScript: clean;
- local `ot-upload-v1` HTTP boundary: CORS/OPTIONS 200, unsupported method 405,
  invalid JSON/action 400, missing user authentication 401 and missing cron
  secret 403.

The complete web UI suite still contains 15 pre-existing failures in sidebar
and login tests that describe older UI behavior or lack API mocks.
They are recorded test-debt and are not failures of the command contract. They
must be repaired before the repository-wide suite can become a deployment gate.

### Continuous contract gate — completed 2026-07-25

`.github/workflows/work-order-contract.yml` now reconstructs an isolated
Supabase instance from the checked-in schema-only baseline, applies exactly the
four pending migrations and executes all SQL contract tests. A second job runs
web TypeScript plus the critical command adapters. The workflow was reproduced
locally with its reduced container set and passed 57/57 database assertions.

### Object-storage E2E rehearsal — completed 2026-07-25

`ot-upload-v1` now accepts an optional `R2_ENDPOINT` for isolated
S3-compatible staging while retaining Cloudflare R2 as the production default.
Using an ephemeral MinIO bucket, `scripts/test-ot-upload-e2e.mjs` successfully:

- created an authenticated temporary user, workspace and OT;
- prepared a deterministic PDF upload intent;
- uploaded the exact declared bytes through the signed PUT URL;
- verified the object through signed HEAD before metadata finalization;
- attached the original filename and `ejecucion` origin to the OT;
- claimed and deleted an expired upload through the cron reconciliation path;
- removed its temporary database and authentication records.

No production Supabase project, R2 bucket or credentials were used. A real
external staging project and dedicated R2 staging bucket remain required before
production rollout.

### Equivalence tests

The remaining staging environment must pass:

- generated schema comparison against production;
- RLS and workspace-isolation tests;
- every state transition beyond the start/complete paths already covered;
- attachment upload, expiry and cleanup paths beyond photo finalization;
- activity and notification exactly-once tests;
- compatibility tests for installed mobile builds.

### Recovery readiness

Take a production backup and restore it into an isolated target. A backup that
has not been restored successfully is not considered verified.

### Edge Functions

Inventory deployed Edge Function names and versions and compare them to the
canonical web folder. Resolve divergent legacy functions before removing any
deployed function.

## Commands still prohibited

```text
supabase db push
supabase migration repair
supabase db reset --linked
```

Read-only `migration list`, `migration fetch`, schema inspection and
`db push --dry-run` remain allowed.

## Exit criteria

Change this document to **RECONCILED** only when:

- an isolated environment builds from the checked-in schema-only bootstrap and
  then exclusively from `pangui/supabase/migrations`;
- generated schema contracts match production;
- OT and RLS integration suites pass against staging;
- deployed Edge Functions are canonically represented;
- mobile CI continues rejecting database-source changes;
- backup restoration and rollout rollback have been rehearsed;
- the four pending migrations have been reviewed and proven in staging.
