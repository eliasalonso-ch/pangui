# OT upload intents v1

This contract removes the unsafe gap between uploading bytes to R2 and making
those bytes visible in PostgreSQL. It covers OT photo-group items, legacy OT
photos, and execution attachments.

## Lifecycle

1. The authenticated client creates a stable command UUID and calls the
   `prepare` action of `ot-upload-v1`.
2. `prepare_ot_upload_v1` validates the actor, workspace, OT, target group,
   extension, and exact byte size. It persists a deterministic object key.
3. The Edge Function returns a five-minute signed PUT URL. Retrying the same
   command returns the same intent and key, but a fresh signed URL.
4. The client uploads bytes directly to R2. On mobile, the existing SQLite
   delivery queue may retain and retry this transport task; it is not the
   canonical metadata store.
5. The client calls `finalize` with only the intent ID. The Edge Function
   authenticates the actor and verifies the object with a signed HEAD request.
6. `finalize_ot_upload_v1` atomically writes the photo/attachment metadata,
   activity event, and notification outbox records. Repeated finalization is
   idempotent.

## Recovery and cleanup

- An app termination after PUT but before finalization is recoverable by
  retrying `finalize` with the same intent ID.
- An app termination before PUT is recoverable by calling `prepare` with the
  same command and uploading again.
- Expired, unfinalized intents enter `cleanup_pending`. The reconciliation
  action deletes their deterministic R2 keys and only then marks them expired.
  Failed deletions remain pending and are retried on the next run.

## Rollout guard

The adapters are intentionally inactive until the canonical migrations and
Edge Function are deployed and verified:

- Web: `NEXT_PUBLIC_WORK_ORDER_UPLOAD_INTENTS_V1=true`
- Mobile: `EXPO_PUBLIC_WORK_ORDER_UPLOAD_INTENTS_V1=true`

No screen currently switches behavior merely because these files exist.
