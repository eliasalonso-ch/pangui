# Create command implementation v1

Status: **IMPLEMENTED, NOT DEPLOYED, NOT ENABLED**  
Canonical migration: `20260725170000_work_order_create_commands_v1.sql`

## What is now centralized

Both clients have adapters for the same two server operations:

- `create_work_order_v1`
- `create_sub_work_order_v1`

Editing and state transitions are documented separately in
`EDIT-TRANSITIONS-V1.md`.

The PostgreSQL transaction owns:

- authentication and workspace authorization;
- validation of tenant-owned references;
- idempotency by `(workspace_id, command_id)`;
- workspace defaults and recurrence normalization;
- serialized OT-number allocation;
- root/sub-OT insertion;
- activity insertion;
- default material-sheet policy;
- sub-OT procedure inheritance;
- notification-outbox insertion.

## Safety state

No production screen calls these operations yet. The client adapters are guarded
by variables that default to disabled:

- web: `NEXT_PUBLIC_WORK_ORDER_COMMANDS_V1`
- mobile: `EXPO_PUBLIC_WORK_ORDER_COMMANDS_V1`

The existing direct-table flows remain unchanged for installed builds.

## Why it is not deployed yet

The canonical repository and linked production database still have divergent
migration histories. Applying a new migration before reconciling that history
would make rollback and incident diagnosis unsafe.

The outbox is deliberately storage-only in this step. It must not be dispatched
until the old notification producers are catalogued and disabled for these
events, otherwise assignment notifications could be duplicated.

## Activation sequence

1. Reconcile and baseline migration history.
2. Apply the migration to an isolated database and regenerate Supabase types.
3. Run replay, payload-mismatch, authorization and forced-rollback integration
   tests against PostgreSQL.
4. Add an outbox worker while suppressing legacy notification producers for
   command-created events.
5. Wire one internal web workspace to the adapter with a retained command ID.
6. Compare results and side effects against the legacy path.
7. Enable mobile only after an OTA/build compatibility review.

Do not enable either environment variable before steps 1-4 pass.
