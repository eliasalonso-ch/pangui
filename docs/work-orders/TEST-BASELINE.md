# Work Order Test Baseline

Captured: **2026-07-25**

## Added characterization coverage

### Web

`tests/lib/ordenes-api.test.ts` now verifies:

- creation is currently separate OT/activity/notification writes;
- web applies the workspace-wide mandatory-photo flag at creation;
- web does not create the mobile default material sheet;
- web sub-OT inheritance is the narrower legacy variant;
- web completion currently omits `pausado_at` and `completado_por`.

Targeted result: **32 passed**.

### Mobile

`tests/work-orders-api-contract.test.ts` now verifies:

- creation writes OT, activity, and the default material sheet separately;
- mobile completion writes all current terminal fields;
- mobile sub-OT creation uses its broader inheritance behavior.

Full hermetic mobile result: **18 files passed, 122 tests passed**.

### PostgreSQL integration

`tests/work-orders.test.ts` now includes a required-photo invariant: attempting
to complete an OT that requires photos without server-backed evidence must fail
and leave the state unchanged.

This live integration test was not executed locally during this phase because
the current integration environment targets an external Supabase project and
the canonical migration history is under reconciliation. It remains part of
the existing integration suite/CI configuration.

## Existing unrelated web failures

The complete web suite currently reports **19 failures** outside the newly added
OT characterization coverage. The failures are in existing login, sidebar,
row-component, and metric tests, plus unhandled subscription-status fetches.
They are not caused by the OT contract tests and must be repaired separately so
the full web suite can become a reliable merge gate.

Until then, the work-order gate is:

```text
npm test -- --run tests/lib/ordenes-api.test.ts
```

This is a temporary exception, not the desired final CI state.
