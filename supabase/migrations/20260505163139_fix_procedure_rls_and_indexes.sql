
-- Composite index so the paso_respuestas RLS JOIN
-- (pe.id = paso_respuestas.ejecucion_id AND ot.workspace_id = ...)
-- can resolve in one seek instead of two.
CREATE INDEX IF NOT EXISTS idx_proc_ejec_orden_proc
  ON procedimiento_ejecuciones(orden_id, procedimiento_id);

-- The upsert conflict target (ejecucion_id, paso_id) already has a unique index,
-- but we need ejecucion_id leading for the RLS EXISTS scan.
-- Already exists as paso_respuestas_ejecucion_id_paso_id_key — no-op needed.

-- Tighten the paso_respuestas RLS policies.
-- Before: every row check joins pe → ot → calls my_workspace_id() (queries usuarios).
-- After:  same join but my_workspace_id() is now STABLE+SECURITY DEFINER so Postgres
--         evaluates it once per statement, not once per row.
-- These policies are already using my_workspace_id() which was fixed in the earlier
-- migration. The remaining gain is adding a workspace_id column to procedimiento_ejecuciones
-- so the RLS check becomes a single-table filter. Do that now.

ALTER TABLE procedimiento_ejecuciones
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);

-- Backfill from ordenes_trabajo
UPDATE procedimiento_ejecuciones pe
SET workspace_id = ot.workspace_id
FROM ordenes_trabajo ot
WHERE ot.id = pe.orden_id
  AND pe.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_proc_ejec_workspace_id
  ON procedimiento_ejecuciones(workspace_id);

-- Replace the three-table-join RLS with a single-column check.
DROP POLICY IF EXISTS "ejec_insert" ON procedimiento_ejecuciones;
CREATE POLICY "ejec_insert" ON procedimiento_ejecuciones
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "ejec_select" ON procedimiento_ejecuciones;
CREATE POLICY "ejec_select" ON procedimiento_ejecuciones
  FOR SELECT USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "ejec_update" ON procedimiento_ejecuciones;
CREATE POLICY "ejec_update" ON procedimiento_ejecuciones
  FOR UPDATE USING (workspace_id = my_workspace_id());

-- paso_respuestas still needs the JOIN to get workspace_id.
-- Add workspace_id here too so we can drop the JOIN entirely.
ALTER TABLE paso_respuestas
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);

UPDATE paso_respuestas pr
SET workspace_id = pe.workspace_id
FROM procedimiento_ejecuciones pe
WHERE pe.id = pr.ejecucion_id
  AND pr.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_paso_respuestas_workspace_id
  ON paso_respuestas(workspace_id);

DROP POLICY IF EXISTS "resp_insert" ON paso_respuestas;
CREATE POLICY "resp_insert" ON paso_respuestas
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "resp_select" ON paso_respuestas;
CREATE POLICY "resp_select" ON paso_respuestas
  FOR SELECT USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "resp_update" ON paso_respuestas;
CREATE POLICY "resp_update" ON paso_respuestas
  FOR UPDATE USING (workspace_id = my_workspace_id());
;
