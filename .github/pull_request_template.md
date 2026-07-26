## Summary

## Verification

## Work-order functional freeze

Complete this section when the change touches the OT lifecycle or its data.
See `docs/work-orders/PHASE-0-FREEZE.md`.

- [ ] This does not introduce a new OT rule, or an approved emergency exception is documented.
- [ ] Web, mobile, database and installed-build behavior were considered.
- [ ] Retries are idempotent and partial failures cannot report false success.
- [ ] Permissions are enforced server-side.
- [ ] Activity and notifications are emitted exactly once.
- [ ] Photo/attachment persistence and recovery are unchanged or documented.
- [ ] Regression/characterization tests were added or a reason is provided.
- [ ] Rollback does not require deleting user data.
- [ ] If current OT behavior changed, `docs/work-orders/CURRENT-BEHAVIOR-MATRIX.md` was updated.
