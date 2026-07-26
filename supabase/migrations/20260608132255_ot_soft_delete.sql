-- Soft-delete (papelera/trash) for ordenes_trabajo.
-- A non-null deleted_at means the OT is in the trash; deleted_by records who trashed it.
ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- Partial index so the common "active OTs" filter (deleted_at IS NULL) stays fast,
-- scoped per workspace which is how lists are queried.
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_active
  ON ordenes_trabajo (workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Index to list trash quickly and to drive the 30-day auto-purge.
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_trash
  ON ordenes_trabajo (workspace_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN ordenes_trabajo.deleted_at IS 'When the OT was sent to trash (soft delete). NULL = active.';
COMMENT ON COLUMN ordenes_trabajo.deleted_by IS 'User who sent the OT to trash.';;
