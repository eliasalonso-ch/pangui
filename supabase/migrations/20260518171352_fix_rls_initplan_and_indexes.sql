
-- ============================================================
-- Fix auth_rls_initplan: wrap auth.uid() in (SELECT auth.uid())
-- so Postgres evaluates it once per query, not once per row.
-- ============================================================

-- ── foto_grupo_items ─────────────────────────────────────────

DROP POLICY IF EXISTS "foto_grupo_items_select" ON public.foto_grupo_items;
CREATE POLICY "foto_grupo_items_select" ON public.foto_grupo_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM foto_grupos g
      JOIN usuarios u ON u.workspace_id = g.workspace_id
      WHERE g.id = foto_grupo_items.grupo_id
        AND u.id = (SELECT auth.uid())
        AND u.activo = true
    )
  );

DROP POLICY IF EXISTS "foto_grupo_items_delete" ON public.foto_grupo_items;
CREATE POLICY "foto_grupo_items_delete" ON public.foto_grupo_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM foto_grupos g
      JOIN usuarios u ON u.workspace_id = g.workspace_id
      WHERE g.id = foto_grupo_items.grupo_id
        AND u.id = (SELECT auth.uid())
        AND u.activo = true
        AND (g.locked = false OR u.rol = ANY (ARRAY['owner','admin']))
    )
  );

DROP POLICY IF EXISTS "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items;
CREATE POLICY "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.workspace_id = (
          SELECT fg.workspace_id FROM foto_grupos fg WHERE fg.id = foto_grupo_items.grupo_id
        )
    )
  );

-- ── oficios ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "oficios_insert" ON public.oficios;
CREATE POLICY "oficios_insert" ON public.oficios
  FOR INSERT WITH CHECK (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  );

DROP POLICY IF EXISTS "oficios_update" ON public.oficios;
CREATE POLICY "oficios_update" ON public.oficios
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  ) WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "oficios_delete" ON public.oficios;
CREATE POLICY "oficios_delete" ON public.oficios
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  );

-- ── cargos ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "cargos_insert" ON public.cargos;
CREATE POLICY "cargos_insert" ON public.cargos
  FOR INSERT WITH CHECK (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  );

DROP POLICY IF EXISTS "cargos_update" ON public.cargos;
CREATE POLICY "cargos_update" ON public.cargos
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  ) WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "cargos_delete" ON public.cargos;
CREATE POLICY "cargos_delete" ON public.cargos
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  );

-- ── completion_messages ──────────────────────────────────────

DROP POLICY IF EXISTS "completion_messages_insert" ON public.completion_messages;
CREATE POLICY "completion_messages_insert" ON public.completion_messages
  FOR INSERT WITH CHECK (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  );

DROP POLICY IF EXISTS "completion_messages_update" ON public.completion_messages;
CREATE POLICY "completion_messages_update" ON public.completion_messages
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  ) WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "completion_messages_delete" ON public.completion_messages;
CREATE POLICY "completion_messages_delete" ON public.completion_messages
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner','admin'])
  );

-- ============================================================
-- Drop unused indexes — they waste write IOPS on every INSERT/UPDATE
-- and bloat WAL, contributing directly to IO budget exhaustion.
-- ============================================================

DROP INDEX IF EXISTS public.idx_fk_ot_activo_id;
DROP INDEX IF EXISTS public.idx_fk_ot_creado_por;
DROP INDEX IF EXISTS public.idx_fk_ot_lugar_id;
DROP INDEX IF EXISTS public.idx_fk_ot_plantilla_id;
DROP INDEX IF EXISTS public.idx_fk_actividad_usuario_id;
DROP INDEX IF EXISTS public.idx_fk_auditoria_usuario_id;
DROP INDEX IF EXISTS public.idx_fk_activos_activo_padre_id;
DROP INDEX IF EXISTS public.idx_fk_activos_fabricante_id;
DROP INDEX IF EXISTS public.idx_fk_activos_modelo_id;
DROP INDEX IF EXISTS public.idx_fk_activos_proveedor_id;
DROP INDEX IF EXISTS public.idx_fk_activos_responsable_id;
DROP INDEX IF EXISTS public.idx_fk_activos_ubicacion_id;
DROP INDEX IF EXISTS public.idx_fk_activos_workspace_id;
DROP INDEX IF EXISTS public.idx_fk_hojas_created_by;
DROP INDEX IF EXISTS public.idx_fk_hojas_levantamiento_id;
DROP INDEX IF EXISTS public.idx_fk_lev_creado_por;
DROP INDEX IF EXISTS public.idx_fk_lev_orden_id;
DROP INDEX IF EXISTS public.idx_fk_lev_asignado_a;
DROP INDEX IF EXISTS public.idx_fk_lev_sociedad_id;
DROP INDEX IF EXISTS public.idx_fk_lev_ubicacion_id;
DROP INDEX IF EXISTS public.idx_fk_foto_grupos_created_by;
DROP INDEX IF EXISTS public.idx_fk_ubicaciones_sociedad_id;
DROP INDEX IF EXISTS public.idx_fk_materiales_usados_material_id;
DROP INDEX IF EXISTS public.idx_fk_lugares_ubicacion_id;

-- ============================================================
-- Add composite index on ubicaciones (workspace_id, activa, edificio)
-- Supabase advisor recommended this for the ORDER BY edificio query.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ubicaciones_workspace_activa_edificio
  ON public.ubicaciones (workspace_id, activa, edificio ASC);
;
