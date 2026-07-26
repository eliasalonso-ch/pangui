# Work Order Command Contract v1

Status: **CREATE, EDIT AND TRANSITION COMMANDS IMPLEMENTED — NOT DEPLOYED**  
Contract version: `1`

This is the target boundary for replacing direct web and mobile mutations. It
does not authorize a production schema change by itself.

## Common command envelope

Every mutating command must accept:

```ts
type CommandEnvelope<T> = {
  contract_version: 1;
  command_id: string;
  workspace_id: string;
  actor_id: string;
  payload: T;
};
```

Rules:

- `(workspace_id, command_id)` is unique.
- Replaying the same command returns the original result and emits no new
  activity or notification.
- Reusing a command ID with a different payload returns
  `COMMAND_PAYLOAD_MISMATCH`.
- `actor_id` must equal `auth.uid()` server-side.
- Authorization, current-state validation, OT mutation, activity, and
  notification-outbox insertion occur in one PostgreSQL transaction.
- R2 upload bytes are finalized separately because PostgreSQL cannot transact
  with object storage.

## Common result

```ts
type CommandResult<T> = {
  contract_version: 1;
  command_id: string;
  replayed: boolean;
  data: T;
};
```

## Stable error codes

| Code | Meaning |
| --- | --- |
| `UNAUTHENTICATED` | There is no valid authenticated actor |
| `FORBIDDEN` | Actor lacks permission for the command |
| `WORKSPACE_MISMATCH` | Resource does not belong to the envelope workspace |
| `OT_NOT_FOUND` | OT is absent or not visible |
| `INVALID_STATE_TRANSITION` | Requested state change is not permitted |
| `PHOTOS_REQUIRED` | Completion requires server-backed evidence |
| `PROCEDURES_INCOMPLETE` | A blocking procedure is incomplete |
| `MATERIALS_REQUIRED` | Required material data is absent |
| `SHEET_REQUIRED` | Required sheet data is absent |
| `COMMAND_PAYLOAD_MISMATCH` | Idempotency key was reused incorrectly |
| `CONFLICT` | Expected resource version no longer matches |

Clients may localize messages, but must not infer business meaning from raw
Postgres text.

## Critical commands

### `create_work_order_v1`

Server owns defaults and derived values:

- `tipo`, initial `estado`, and `estado_cobro`;
- workspace requirement flags;
- recurrence normalization and `proxima_ejecucion`;
- OT number;
- default sheet creation policy;
- created/assigned activity;
- notification outbox records.

The result returns the canonical OT snapshot and IDs of side effects created.

### `create_sub_work_order_v1`

Payload must explicitly select an inheritance policy. The server, not the
client, defines the fields associated with each policy.

```ts
type SubOtInheritance = "operational" | "minimal";
```

`operational` is the migration target for the broader mobile behavior;
`minimal` remains available only if a reviewed product decision requires it.

### `edit_work_order_v1`

Requires an `expected_updated_at` value. The command recalculates recurrence
fields and records assignment, priority, location, and content changes from the
actual before/after values rather than client-supplied audit text.

### `transition_work_order_v1`

Payload actions:

```ts
type WorkOrderAction =
  | "assign"
  | "wait"
  | "start"
  | "pause"
  | "resume"
  | "request_review"
  | "complete"
  | "cancel";
```

On completion the canonical terminal record includes:

- `estado = 'completado'`;
- `en_ejecucion = false`;
- `pausado_at = null`;
- `fecha_termino` from the server clock;
- non-negative `tiempo_total_segundos`;
- `completado_por = auth.uid()`.

Completion requirements are evaluated inside the same transaction.

### Delete and restore

`soft_delete_work_order_v1` remains reversible. Permanent purge is an
asynchronous server job that records object-storage cleanup attempts; it is not
a client command.

## Photo/attachment boundary

Upload uses three operations:

1. `prepare_ot_upload_v1` creates an upload intent and object key.
2. Client uploads bytes directly to R2 using the intent.
3. `finalize_ot_upload_v1` verifies the object and atomically creates metadata,
   activity, and notification-outbox rows.

Finalization is idempotent. A reconciliation job expires abandoned intents and
removes orphan objects.

## Required verification

- Web and mobile creation payload/default differences.
- Web and mobile sub-OT inheritance differences.
- Web and mobile terminal completion payloads.
- Required-photo database rejection.
- Role matrix for owner/admin/member/requester.
- Replay of every command with the same command ID.
- Failure after every internal step produces no partial domain state.
- Exactly one activity and notification-outbox record per successful command.

## Adoption rule

Direct table APIs remain until each client passes the same contract fixtures
against the server command behind a feature flag. Removing a legacy path
requires evidence that installed mobile builds remain compatible.
