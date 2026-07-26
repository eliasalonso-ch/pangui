# Edit and transition commands v1

Status: **IMPLEMENTED, NOT DEPLOYED, NOT ENABLED**

## Problems removed by the canonical contract

| Concern | Legacy web | Legacy mobile | Canonical command |
| --- | --- | --- | --- |
| Concurrent edits | Last write wins | Last write wins | `expected_updated_at`, otherwise `CONFLICT` |
| Timer | Seconds supplied by browser | Seconds supplied by phone | Calculated from PostgreSQL time |
| Completion actor | Not persisted consistently | Writes `completado_por` | Always `auth.uid()` |
| Pause cleanup | Completion can retain pause data | Clears pause data | Always clears terminal pause state |
| Blocking procedures | Not checked in web close gate | Checked in mobile | Checked transactionally in PostgreSQL |
| Required sheet | Flag alone blocks web completion | Requires a row | Requires a server-backed row |
| Required materials | Client-side check | Client-side check | Server-side check honoring `modo_registro` |
| Required photos | Trigger plus differing UI checks | Trigger plus differing UI checks | Stable `PHOTOS_REQUIRED` precondition plus trigger |
| Audit | Client decides activity text | Client decides activity text | Derived from locked before/after rows |

## `edit_work_order_v1`

- accepts only an explicit editable-field allowlist;
- validates all referenced resources against the command workspace;
- locks the OT and compares `expected_updated_at`;
- recalculates recurrence server-side;
- derives priority, location, assignment and content activity;
- enqueues only newly assigned recipients;
- is idempotent by `(workspace_id, command_id)`.

## `transition_work_order_v1`

Supported actions:

- `assign`
- `wait`
- `start`
- `pause`
- `resume`
- `request_review`
- `complete`
- `cancel`

PostgreSQL validates the current state, calculates accumulated time, writes the
terminal fields, activity and notification-outbox records in one transaction.
The client does not submit elapsed seconds.

## Remaining before activation

1. Run the migration against an isolated database after migration history is
   reconciled.
2. Add database integration fixtures for every role/state/action pair.
3. Implement the outbox dispatcher and suppress the matching legacy producers.
4. Retain `command_id` across network uncertainty and retries in each UI.
5. Enable an internal web workspace first; mobile remains disabled.

Neither web nor mobile production screens call these commands yet.
