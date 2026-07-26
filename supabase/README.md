# Canonical Supabase Source

This directory is the only location where new Pangui database migrations and
Edge Functions may be created or modified.

The mobile repository contains a frozen legacy snapshot. Do not copy a new SQL
file into both repositories and do not deploy Supabase changes from the mobile
repository.

## Safety status

The local migration ledger now matches all 128 production versions. The four
pending work-order migrations have also been applied successfully to a local
Docker database bootstrapped from the production public schema, and its pgTAP
suite passes. Until `docs/work-orders/SUPABASE-CANONICALIZATION.md` reaches
**RECONCILED**:

- do not run `supabase db push`;
- do not run `supabase migration repair`;
- do not edit or rename the 128 fetched historical migrations;
- do not replay local migrations against production;
- production incident SQL must be reviewed and recorded in the reconciliation
  document before execution.

Files under `legacy-migrations-unreconciled` are forensic evidence only and
must never be moved back into `migrations` or deployed.

## Empty database bootstrap

Production's recorded migration history starts after several foundational
tables had already been created. Consequently, the 128 historical migrations
cannot initialize an empty database by themselves. For isolated staging and
disaster-recovery rehearsals, use the schema-only artifact at:

`bootstrap/20260725_production_public_schema.sql`

SHA-256:
`61C595F113E4580520EC559725F0DFF15E617D2564F9B099ED13CDFC28965BE6`

This artifact contains no table rows and is deliberately outside `migrations`.
Never pass it to `db push` and never apply it to production.

Schema types must eventually be generated from the linked project into a
shared contract artifact. The mobile-generated `types/supabase.ts` is currently
the only generated client schema, but it is not proof that the migration history
in either repository can recreate production.
