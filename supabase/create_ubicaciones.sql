-- ============================================================
-- PANGUI — Recreate ubicaciones table with workspace_id
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS ubicaciones (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  edificio     text        NOT NULL,
  piso         text,
  detalle      text,
  activa       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ubicaciones_workspace
  ON ubicaciones (workspace_id);

ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ubicaciones_select" ON ubicaciones FOR SELECT
  USING (workspace_id = my_workspace_id());

CREATE POLICY "ubicaciones_insert" ON ubicaciones FOR INSERT
  WITH CHECK (workspace_id = my_workspace_id());

CREATE POLICY "ubicaciones_update" ON ubicaciones FOR UPDATE
  USING (workspace_id = my_workspace_id());

CREATE POLICY "ubicaciones_delete" ON ubicaciones FOR DELETE
  USING (workspace_id = my_workspace_id());
