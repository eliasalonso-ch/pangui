
-- Drop all broken policies
DROP POLICY IF EXISTS "workspace members can read procedimientos" ON procedimientos;
DROP POLICY IF EXISTS "workspace members can insert procedimientos" ON procedimientos;
DROP POLICY IF EXISTS "workspace members can update procedimientos" ON procedimientos;

DROP POLICY IF EXISTS "workspace members can read pasos" ON procedimiento_pasos;
DROP POLICY IF EXISTS "workspace members can insert pasos" ON procedimiento_pasos;
DROP POLICY IF EXISTS "workspace members can update pasos" ON procedimiento_pasos;
DROP POLICY IF EXISTS "workspace members can delete pasos" ON procedimiento_pasos;

DROP POLICY IF EXISTS "workspace members can read ejecuciones" ON procedimiento_ejecuciones;
DROP POLICY IF EXISTS "workspace members can insert ejecuciones" ON procedimiento_ejecuciones;
DROP POLICY IF EXISTS "workspace members can update ejecuciones" ON procedimiento_ejecuciones;

DROP POLICY IF EXISTS "workspace members can read paso_respuestas" ON paso_respuestas;
DROP POLICY IF EXISTS "workspace members can insert paso_respuestas" ON paso_respuestas;
DROP POLICY IF EXISTS "workspace members can update paso_respuestas" ON paso_respuestas;

DROP POLICY IF EXISTS "workspace members can read ot_procedimientos" ON ot_procedimientos;
DROP POLICY IF EXISTS "workspace members can insert ot_procedimientos" ON ot_procedimientos;
DROP POLICY IF EXISTS "workspace members can delete ot_procedimientos" ON ot_procedimientos;

-- procedimientos
CREATE POLICY "proc_select" ON procedimientos FOR SELECT
  USING (workspace_id = my_workspace_id());

CREATE POLICY "proc_insert" ON procedimientos FOR INSERT
  WITH CHECK (workspace_id = my_workspace_id());

CREATE POLICY "proc_update" ON procedimientos FOR UPDATE
  USING (workspace_id = my_workspace_id())
  WITH CHECK (workspace_id = my_workspace_id());

-- procedimiento_pasos (scoped via parent procedimiento)
CREATE POLICY "pasos_select" ON procedimiento_pasos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "pasos_insert" ON procedimiento_pasos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "pasos_update" ON procedimiento_pasos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "pasos_delete" ON procedimiento_pasos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id = my_workspace_id()
    )
  );

-- procedimiento_ejecuciones (scoped via ordenes_trabajo)
CREATE POLICY "ejec_select" ON procedimiento_ejecuciones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = procedimiento_ejecuciones.orden_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "ejec_insert" ON procedimiento_ejecuciones FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = procedimiento_ejecuciones.orden_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "ejec_update" ON procedimiento_ejecuciones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = procedimiento_ejecuciones.orden_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

-- paso_respuestas (scoped via ejecucion -> ordenes_trabajo)
CREATE POLICY "resp_select" ON paso_respuestas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM procedimiento_ejecuciones pe
      JOIN ordenes_trabajo ot ON ot.id = pe.orden_id
      WHERE pe.id = paso_respuestas.ejecucion_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "resp_insert" ON paso_respuestas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procedimiento_ejecuciones pe
      JOIN ordenes_trabajo ot ON ot.id = pe.orden_id
      WHERE pe.id = paso_respuestas.ejecucion_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "resp_update" ON paso_respuestas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procedimiento_ejecuciones pe
      JOIN ordenes_trabajo ot ON ot.id = pe.orden_id
      WHERE pe.id = paso_respuestas.ejecucion_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

-- ot_procedimientos (scoped via ordenes_trabajo)
CREATE POLICY "otproc_select" ON ot_procedimientos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = ot_procedimientos.orden_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "otproc_insert" ON ot_procedimientos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = ot_procedimientos.orden_id
        AND ot.workspace_id = my_workspace_id()
    )
  );

CREATE POLICY "otproc_delete" ON ot_procedimientos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = ot_procedimientos.orden_id
        AND ot.workspace_id = my_workspace_id()
    )
  );
;
