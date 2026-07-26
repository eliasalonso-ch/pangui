-- Activity log for assets — mirrors actividad_ot. Captures asset edits, status
-- changes, and OT milestones (linked / completed) as a clean timeline.
CREATE TABLE IF NOT EXISTS actividad_activo (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activo_id   uuid        NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
  usuario_id  uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo        text        NOT NULL,
  comentario  text,
  meta        jsonb,      -- structured detail, e.g. {"de":"operativo","a":"mantencion"}
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividad_activo_activo
  ON actividad_activo (activo_id, created_at DESC);

ALTER TABLE actividad_activo ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user of the activo's workspace.
DROP POLICY IF EXISTS "actividad_activo_select" ON actividad_activo;
CREATE POLICY "actividad_activo_select"
  ON actividad_activo FOR SELECT
  USING (activo_id IN (SELECT id FROM activos WHERE workspace_id = my_workspace_id()));

-- INSERT: same scope (app-side inserts allowed; triggers run SECURITY DEFINER).
DROP POLICY IF EXISTS "actividad_activo_insert" ON actividad_activo;
CREATE POLICY "actividad_activo_insert"
  ON actividad_activo FOR INSERT
  WITH CHECK (activo_id IN (SELECT id FROM activos WHERE workspace_id = my_workspace_id()));;
