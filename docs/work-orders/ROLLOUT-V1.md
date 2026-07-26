# Canonical OT rollout v1

The rollout is deliberately server-controlled per workspace and per user.
Deploying the schema, Edge Function, or client adapters alone does not activate
the new path. All domains default to legacy behavior.

## Preconditions

1. Reconcile the canonical web migration history with production. Do not use a
   broad repair or replay: the current local and remote histories diverge.
2. Take a production database backup and verify restoration in a separate
   project.
3. Apply the three canonical migrations in order: commands, upload intents,
   rollout controls.
4. Deploy `ot-upload-v1` with R2 credentials and a distinct
   `OT_UPLOAD_CRON_SECRET`.
5. Exercise create, edit, every transition, completion rejection/success,
   photo upload, attachment upload, replay, and cleanup in staging.
6. Regenerate Supabase types only after the schema is deployed.

## Adoption order

Each stage starts with one internal workspace at 5%, then 25%, 50%, and 100%.
Remain at each step for at least one full working day and one background/resume
cycle on both iOS and Android.

1. `create_enabled`
2. `edit_enabled`
3. `transition_enabled` except completion
4. canonical completion through the same transition flag
5. `upload_enabled`

The client must require both its build-time capability flag and the effective
server flag. The server calculates a stable user cohort; clients must not
calculate or cache their own percentage assignment permanently.

## Health gates

Before increasing a cohort, require:

- no increase in stable command error codes;
- no duplicate OTs for the same command ID;
- no duplicate activities or notification outbox records;
- notification outbox age remains within its delivery SLO;
- prepared upload intents finalize normally and stale intents are cleaned;
- web/mobile results agree for the same domain action;
- no increase in app crashes, hangs, auth refresh failures, or upload retries.

`work_order_rollout_health_v1()` exposes aggregate command, notification, and
upload state only to `service_role`. Edge logs must record action, command or
intent ID, workspace, duration, replay status, and stable error code, never
file URLs, JWTs, descriptions, or user-entered content.

## Immediate rollback

Set `kill_switch = true` for the affected workspace. Effective flags become
false immediately and clients fall back to legacy paths. Do not roll back the
schema and do not delete command ledgers or upload intents: they are required
for safe replay and reconciliation.

For upload incidents, stop issuing new intents, continue allowing finalize for
already uploaded objects, and keep reconciliation running. This avoids turning
valid R2 objects into invisible data.

## Retirement rule

Legacy mutations may be deleted only after every domain has remained at 100%
for at least two releases, all supported mobile versions understand the
contract, pending outboxes/intents are healthy, and rollback has been tested.
