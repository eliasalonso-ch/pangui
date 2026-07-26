# Work Orders: Current Behavior Matrix

Status: **BASELINE CAPTURED**  
Captured: **2026-07-25**  
Scope: web (`pangui`), mobile (`pangui-native-stable`), and canonical Supabase (`pangui/supabase`).

This document records what the system does today. It is a characterization
baseline, not a target design. A difference listed here must not be silently
standardized: the intended behavior must first be encoded in a server contract
and regression tests.

## Current ownership

| Layer | Current responsibility | Main entry points |
| --- | --- | --- |
| Web | Reads and directly mutates OT tables, then separately writes activity and invokes notification helpers | `lib/ordenes-api.ts`, `app/(app)/ordenes/OTDetail.tsx`, `app/(app)/ordenes/OTCrearPanel.tsx` |
| Mobile | Reads and directly mutates OT tables; React Query applies optimistic state; selected operations and procedure answers still use SQLite/outbox; photos use a dedicated local queue | `features/work-orders/api.ts`, `features/work-orders/hooks.ts`, `features/foto-grupos/api.ts`, `lib/db/sync-worker.ts`, `lib/db/photo-worker.ts` |
| PostgreSQL | Enforces RLS and selected invariants; creates recurrent OTs; validates required photos; some triggers create notifications | `supabase/migrations` |
| Edge/functions | Sends or schedules selected notifications and performs specialized automation | `supabase/functions` |

There is currently no single work-order command boundary. A complete user
action can span an OT update, activity insert, notification insert/push, R2
operation, and local cache update, each with an independent failure boundary.

## Capability matrix

Legend: **D** direct table mutation, **RPC** database function, **Q** local
queue/outbox, **DB** trigger or database-owned behavior.

| Capability | Web today | Mobile today | Database today | Parity/risk |
| --- | --- | --- | --- | --- |
| List/search | Direct PostgREST reads, 300-row page/search limits; list UI also subscribes/polls | Server reads merged with SQLite/cache and pending local state | RLS limits visible rows | Different cache and refresh semantics |
| Read OT detail | Direct joined select through `ORDEN_SELECT` plus lazy section reads | `fetchOTCore` plus section queries and local merge | RLS | Select shapes and load timing are independent |
| Create OT | **D** insert; derives recurrence; reads workspace defaults; activity rows; client notification helper | **D** insert; derives recurrence; reads workspace defaults; activity rows; always inserts a default material sheet | Defaults/constraints/RLS only | **Critical divergence and partial-write risk** |
| Edit OT | **D** update; recalculates next recurrence when recurrence changes; logs priority, location, assignment, and basic edits | **D** update; caller must supply recurrence-derived fields; logs a smaller set of edits | RLS | Derived values and audit coverage differ |
| Change state | **D** update then activity, optionally client notification | **D** update then activity; optimistic hooks/local cache | Required-photo and recurrence triggers may run | No atomic state command; allowed states differ in client types |
| Start | Sets running, start timestamp, `en_curso`; then activity | Same server fields; then activity and local reminder behavior | RLS | Similar outcome, non-atomic activity |
| Pause | Sets stopped, pause timestamp, elapsed time, `en_espera`; then activity | Same | RLS | Similar outcome, non-atomic activity |
| Resume | Sets running, clears pause timestamp, resets start timestamp; then activity | Same | RLS | Similar outcome, non-atomic activity |
| Complete | Sets stopped, completion date, elapsed time, completed; does **not** set `completado_por` or clear `pausado_at`; then activity and optional notification helper | Sets stopped, clears pause timestamp, completion date, elapsed time, completed, and `completado_por`; then activity | Required-photo trigger rejects invalid close; recurrence trigger creates next OT | **Critical terminal-state divergence** |
| Create sub-OT | Copies a limited parent subset; blank description; inherits only procedures flagged for children; procedure copy is best-effort | Copies a broader parent subset and description; optional copy-all procedures; creates sheet when parent requires one | RLS | **Critical data divergence** |
| Soft delete/restore | Updates `deleted_at/deleted_by`; restore clears them | Same | RLS | Mostly aligned |
| Permanent delete | Deletes row only | Fetches legacy photo URLs, deletes row, then best-effort R2 cleanup | Cascades depend on schema | Web can leave R2 objects; neither path is transactional with storage |
| Legacy OT photos | Upload R2 then read/append `fotos_urls` | Queue/upload R2 then read/append `fotos_urls` | Completion accepts `fotos_urls` | Read-modify-write can lose concurrent additions |
| Photo folders | Direct `foto_grupos`/`foto_grupo_items` and R2 operations | SQLite-backed optimistic folder/items plus photo worker and server reconciliation | Completion counts evidence items; RLS | Mobile has recovery semantics web does not; DB row and R2 object are not atomic |
| Attachments | Stored through OT `links` and R2-related UI flows | Stored through OT `links` and execution upload flows | JSON/RLS only | No shared attachment command or authoritative metadata model |
| Activity/comments | Direct `actividad_ot` writes | Direct writes plus local activity cache for some optimistic flows | Constraints and selected notification triggers | Activity can fail after successful OT mutation |
| Procedures | Direct attach/start/save/complete calls in `lib/procedimientos-api.ts` | API plus SQLite/outbox for procedure answers | History trigger and corrective RPC | Execution and retry semantics differ materially |
| Materials/sheets | Detail component directly mutates `orden_partes`; stock changes through RPC | Feature APIs and sheets, with some cached/offline behavior | Stock RPCs enforce selected inventory invariants | Multi-step material operations remain distributed |
| Recurrence | Client calculates initial `proxima_ejecucion` | Separate client implementation calculates it | DB trigger creates next parent/sub-OT and notifications | Three implementations must agree on dates |
| Notifications | Client helper calls notification endpoint while DB triggers also cover selected events | Primarily consumes DB notifications/push; some screens create notifications directly | Multiple triggers/functions insert notifications | Duplicate emitters have already produced duplicate notifications |

## Confirmed behavioral divergences

### P0 — must be resolved before broad refactoring

1. **Completion writes different terminal records.** Web completion does not
   clear `pausado_at` or set `completado_por`; mobile does both. Reports and
   audit views can therefore depend on which client completed the OT.
2. **OT creation is a sequence of non-atomic writes.** The OT can be inserted
   while activity, notification, procedure attachment, sheet creation, or
   attachment updates fail. Retrying a client flow can duplicate side effects.
3. **Sub-OT contents depend on the client.** Web starts with an empty description
   and copies a narrower field set. Mobile copies a broader parent snapshot,
   optionally every procedure, and may create a material sheet.
4. **Notifications have more than one producer.** Client helpers, screen-level
   inserts, database triggers, recurrent database logic, and edge functions
   overlap. Exactly-once delivery is not guaranteed.
5. **Photo persistence crosses three systems without one commit.** Mobile
   coordinates filesystem/SQLite, R2, and PostgreSQL. Web coordinates R2 and
   PostgreSQL. Interruptions require reconciliation.

### P1 — resolve while centralizing the core flow

1. Web includes `fotos_obligatorias_todas` when seeding `requiere_fotos`; mobile
   only reads `requiere_fotos_global`. The database close trigger still checks
   the workspace mandate, so UI state and close behavior can disagree.
2. Mobile always creates a default `hojas_inventario` row for a new OT. Web
   creation does not do this in the shared API.
3. Web recalculates `proxima_ejecucion` inside `updateOrden`; mobile's generic
   update accepts the derived field from its caller.
4. Web's API state type exposes four states while mobile also handles
   `en_revision` and `cancelado`.
5. Generic edit audit conditions differ between clients.
6. Permanent deletion and storage cleanup are asymmetric.
7. Legacy photo arrays use read-modify-write instead of atomic append/remove.

### P2 — standardize after mutations are server-owned

1. List pagination, realtime/polling, cache freshness, and section prefetching differ.
2. Select projections and null/default normalization are maintained twice.
3. Error messages and optimistic rollback behavior are client-specific.
4. Some SQLite/outbox branches still describe broader offline OT mutation
   behavior even though the desired direction is server-first.

## Existing source-of-truth protections

- `trg_enforce_ot_photo_completion` blocks an invalid transition to completed.
- `trg_generar_siguiente_ot_recurrente` creates the next recurrence and uses
  `(recurrencia_origen_id, recurrencia_iteracion)` as its duplicate guard.
- RLS protects the main tables, but authorization is distributed across table
  policies rather than domain commands.
- Inventory adjustments and corrective generation already use RPCs.

## Existing test coverage observed

| Area | Current coverage | Main gap |
| --- | --- | --- |
| Web OT API | Unit tests for parsing, reads, state/priority changes, deletion, activity, and timer transitions | No cross-client contracts or multi-step failure tests |
| Mobile work orders | Integration/RLS tests exercise many direct table operations | They characterize table access more than complete commands |
| RLS | Broad integration coverage in the mobile repository | No single role matrix for every domain command |
| Network/outbox | Classification and retry tests exist | Does not prove exactly-once OT side effects |
| Photos | Queue/backoff logic has tests | Missing end-to-end reconciliation across local file, R2, and DB |
| Recurrence | Date logic and migrations exist | No shared fixtures comparing web, mobile, and PostgreSQL |

## Canonicalization order derived from this baseline

1. Define versioned request/result contracts and shared fixtures.
2. Implement idempotent server-owned create OT/sub-OT commands.
3. Implement server-owned edit and assignment commands.
4. Implement state/timer commands with activity and notification outbox records
   in the same transaction.
5. Implement a photo/attachment finalize contract and reconciliation jobs.
6. Move completion validation and terminal fields into one command.
7. Replace direct client mutations incrementally behind feature flags.

## Evidence map

- Web OT behavior: `lib/ordenes-api.ts`
- Web detail direct writes: `app/(app)/ordenes/OTDetail.tsx`
- Web creation orchestration: `app/(app)/ordenes/OTCrearPanel.tsx`
- Mobile OT behavior: `features/work-orders/api.ts`
- Mobile optimistic/cache behavior: `features/work-orders/hooks.ts`
- Mobile photos: `features/foto-grupos/api.ts`, `lib/db/photo-worker.ts`
- Mobile outbox: `lib/db/sync-worker.ts`, `lib/db/repositories/pending-actions.ts`
- Completion gate: `supabase/migrations/20260722_enforce_ot_photo_completion.sql`
- Recurrence: `supabase/migrations/20260529_recurrente_notif_role_fix.sql`

## Baseline change rule

If a production bug fix changes a behavior in this matrix during the freeze,
the same pull request must update this document and add a regression test that
identifies the old and new behavior.
