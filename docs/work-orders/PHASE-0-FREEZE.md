# Work Orders Phase 0: Functional Freeze

Status: **ACTIVE**  
Effective date: 2026-07-25  
Applies to: Pangui web, Pangui mobile, Supabase, Edge Functions and scheduled jobs.

## Purpose

The work-order domain is being consolidated so web and mobile use the same
server-owned behavior. Until the canonical commands and contracts are ready,
new behavior in either client would increase drift and migration risk.

This is a **functional freeze**, not a stop-work order. Reliability, security,
tests, observability and behavior-preserving UI fixes remain allowed.

## Frozen domain

The freeze covers the complete lifecycle of an OT:

- creation, duplication and sub-OT creation;
- fields, defaults, requirements and recurrence configuration;
- assignment, editing and permissions;
- state transitions, timers, pause reasons and completion;
- procedures, materials, sheets and completion gates;
- photos, folders, attachments, upload queues and R2 metadata;
- activity/audit events and OT notifications;
- deletion, restoration and permanent purge;
- OT read models, filters, counters and derived status.

It also covers these shared database objects and their direct dependants:

- `ordenes_trabajo`, `actividad_ot`, `ordenes_marcadas`;
- `foto_grupos`, `foto_grupo_items` and OT upload metadata;
- `ot_procedimientos`, procedure executions and responses;
- `orden_partes`, `hojas_inventario` and their rows;
- OT-related triggers, RPCs, RLS policies, Edge Functions and cron jobs.

## Allowed changes

A change may proceed during the freeze when it does not introduce a new domain
rule and fits at least one category below:

- production bug fix that restores already-intended behavior;
- security, RLS or data-isolation correction;
- idempotency, transaction safety or backward-compatibility hardening;
- tests that characterize current behavior;
- logging, correlation IDs, metrics and non-sensitive diagnostics;
- performance work that preserves query results and side effects;
- visual/accessibility changes with no persistence or permission change;
- adapters required to move an existing flow to a canonical server command;
- emergency data repair supplied with a reviewed, reversible script.

## Prohibited changes

Until the corresponding canonical phase is complete, do not add or change:

- OT states, transitions, priorities, classifications or recurrence semantics;
- required fields, defaults or completion requirements;
- client-side direct mutations that bypass a shared command;
- additional activity or notification emitters;
- new photo/upload states without the agreed upload protocol;
- schema columns or payload fields implemented in only one client;
- destructive migrations or removal of fields used by installed mobile builds;
- separate copies of an OT migration in the mobile repository;
- silent fallback behavior that reports success after a required step failed.

## Emergency exception

An exception is permitted only for an active production incident or security
issue. The change description must include:

1. incident and affected users;
2. current web, mobile and database behavior;
3. compatibility with installed mobile builds;
4. data and notification side effects;
5. rollback procedure;
6. regression test or a written reason it cannot be added immediately.

Emergency changes must be the smallest safe correction. Any temporary branch
of business logic is recorded as consolidation debt before release.

## Required review checklist

Every change touching the frozen domain must answer:

- [ ] Does this alter persisted behavior or only restore intended behavior?
- [ ] What happens on web, mobile, database and older installed builds?
- [ ] Is the operation idempotent when submitted twice?
- [ ] Can a partial failure leave inconsistent data?
- [ ] Are permissions enforced by the server rather than only the UI?
- [ ] Are activity and notifications emitted exactly once?
- [ ] Does it change photo/attachment ownership or recovery?
- [ ] Is there a regression or characterization test?
- [ ] Is rollback possible without deleting user data?

## Exit criteria

The functional freeze ends by capability, not all at once. A capability is
unfrozen only after it has:

1. a documented versioned contract;
2. a canonical server-owned operation or read model;
3. RLS and domain tests;
4. web adoption;
5. mobile adoption behind a rollout flag;
6. compatibility coverage for active older builds;
7. production monitoring and a tested rollback path.

Low-use capabilities remain frozen until the critical creation, editing,
execution, upload and completion flows have completed their rollout.
