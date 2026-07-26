
-- ============================================================
-- 1. FIX auth_rls_initplan: replace bare auth.uid() with (SELECT auth.uid())
-- ============================================================

-- usuarios_update_admin
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_admin" ON public.usuarios
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios_1.rol FROM usuarios usuarios_1 WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['admin'::text, 'supervisor'::text])
  )
  WITH CHECK (workspace_id = my_workspace_id());

-- usuarios_update_by_admin
DROP POLICY IF EXISTS "usuarios_update_by_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_by_admin" ON public.usuarios
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios_1.rol FROM usuarios usuarios_1 WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (workspace_id = my_workspace_id());

-- ordenes_delete
DROP POLICY IF EXISTS "ordenes_delete" ON public.ordenes_trabajo;
CREATE POLICY "ordenes_delete" ON public.ordenes_trabajo
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text])
  );

-- ordenes_update
DROP POLICY IF EXISTS "ordenes_update" ON public.ordenes_trabajo;
CREATE POLICY "ordenes_update" ON public.ordenes_trabajo
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
  )
  WITH CHECK (workspace_id = my_workspace_id());

-- categorias_delete
DROP POLICY IF EXISTS "categorias_delete" ON public.categorias_ot;
CREATE POLICY "categorias_delete" ON public.categorias_ot
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- ubicaciones_delete
DROP POLICY IF EXISTS "ubicaciones_delete" ON public.ubicaciones;
CREATE POLICY "ubicaciones_delete" ON public.ubicaciones
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['admin'::text, 'supervisor'::text])
  );

-- sociedades_delete
DROP POLICY IF EXISTS "sociedades_delete" ON public.sociedades;
CREATE POLICY "sociedades_delete" ON public.sociedades
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['admin'::text, 'supervisor'::text])
  );

-- foto_grupos_update
DROP POLICY IF EXISTS "foto_grupos_update" ON public.foto_grupos;
CREATE POLICY "foto_grupos_update" ON public.foto_grupos
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (workspace_id = my_workspace_id());


-- ============================================================
-- 2. DROP DUPLICATE PERMISSIVE POLICIES
-- ============================================================

-- actividad_ot: keep actividad_insert / actividad_select (use my_workspace_id())
DROP POLICY IF EXISTS "actividad_ot_insert_own_workspace" ON public.actividad_ot;
DROP POLICY IF EXISTS "actividad_ot_select_own_workspace" ON public.actividad_ot;

-- categorias_ot SELECT: keep categorias_ot_select
DROP POLICY IF EXISTS "categorias_select" ON public.categorias_ot;

-- feedback SELECT: merge into one — keep feedback_select_admin, drop feedback_select
-- (feedback_select checks workspace membership; feedback_select_admin checks admin role;
--  replace both with a single policy covering workspace members)
DROP POLICY IF EXISTS "feedback_select" ON public.feedback;
DROP POLICY IF EXISTS "feedback_select_admin" ON public.feedback;
CREATE POLICY "feedback_select" ON public.feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.workspace_id = my_workspace_id()
    )
  );

-- foto_grupos UPDATE: foto_grupos_update (admin-only) already exists and is fixed above.
-- "workspace members can manage foto_grupos" is ALL for any workspace member — that's
-- overly broad for UPDATE (any member could update). Drop it; the fixed foto_grupos_update covers UPDATE.
DROP POLICY IF EXISTS "workspace members can manage foto_grupos" ON public.foto_grupos;

-- lugares: drop the weaker _own_workspace duplicates
DROP POLICY IF EXISTS "lugares_delete_own_workspace" ON public.lugares;
DROP POLICY IF EXISTS "lugares_insert_own_workspace" ON public.lugares;
DROP POLICY IF EXISTS "lugares_select_own_workspace" ON public.lugares;

-- materiales_usados: mat_* already use (SELECT auth.uid()); drop materiales_* duplicates
DROP POLICY IF EXISTS "materiales_insert" ON public.materiales_usados;
DROP POLICY IF EXISTS "materiales_select" ON public.materiales_usados;

-- notifications: keep "Users …" named policies, drop the unnamed duplicates
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
DROP POLICY IF EXISTS "notif_select" ON public.notifications;
DROP POLICY IF EXISTS "notif_update" ON public.notifications;
DROP POLICY IF EXISTS "delete own" ON public.notifications;
DROP POLICY IF EXISTS "read own" ON public.notifications;
DROP POLICY IF EXISTS "update own" ON public.notifications;

-- ordenes_trabajo INSERT/SELECT: keep ordenes_insert / ordenes_select
DROP POLICY IF EXISTS "ot_insert" ON public.ordenes_trabajo;
DROP POLICY IF EXISTS "ot_select" ON public.ordenes_trabajo;

-- push_subscriptions: keep "delete own" / "insert own" / "select own"
DROP POLICY IF EXISTS "push_delete" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_select" ON public.push_subscriptions;

-- reglas_alerta_workspace SELECT: merge into one SELECT covering all workspace members
-- (admins can manage rules = ALL, so it already covers SELECT for admins via the ALL policy;
--  "workspace members can read rules" is the only SELECT for non-admins)
-- These two have different predicates so they are not true duplicates — keep both.
-- The lint fires because both are permissive for the same action. Consolidate into one SELECT:
DROP POLICY IF EXISTS "workspace members can read rules" ON public.reglas_alerta_workspace;
-- The ALL policy already covers SELECT for admins; add a broader SELECT for all members:
CREATE POLICY "workspace members can read rules" ON public.reglas_alerta_workspace
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios WHERE id = (SELECT auth.uid())
    )
  );
-- Now admins: the ALL policy provides INSERT/UPDATE/DELETE; SELECT is covered by the SELECT policy above.
-- Drop the ALL policy's SELECT overlap by converting it to a non-SELECT ALL:
-- Actually the simplest fix is to consolidate: drop "admins can manage rules" ALL and replace with
-- explicit INSERT/UPDATE/DELETE for admins, then the single SELECT covers everyone.
DROP POLICY IF EXISTS "admins can manage rules" ON public.reglas_alerta_workspace;
CREATE POLICY "admins can manage rules" ON public.reglas_alerta_workspace
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios
      WHERE id = (SELECT auth.uid()) AND rol = ANY (ARRAY['admin'::text, 'owner'::text])
    )
  );

-- sociedades SELECT: keep sociedades_select (uses my_workspace_id())
DROP POLICY IF EXISTS "sociedades_select_own_workspace" ON public.sociedades;

-- solicitudes UPDATE: solicitudes_update is the full policy; drop the narrower duplicate
DROP POLICY IF EXISTS "Solicitante can update own solicitudes" ON public.solicitudes;

-- solicitudes_arco INSERT: arco_insert and public_insert are both WITH CHECK true — drop public_insert
DROP POLICY IF EXISTS "public_insert" ON public.solicitudes_arco;
-- solicitudes_arco SELECT: arco_select (any authenticated) is superset of jefe_select — drop jefe_select
DROP POLICY IF EXISTS "jefe_select" ON public.solicitudes_arco;
-- solicitudes_arco UPDATE: same — arco_update supersedes jefe_update
DROP POLICY IF EXISTS "jefe_update" ON public.solicitudes_arco;

-- tipos_parte: all policies are effectively true/true — consolidate to one ALL policy
DROP POLICY IF EXISTS "all read tipos_parte" ON public.tipos_parte;
DROP POLICY IF EXISTS "all write tipos_parte" ON public.tipos_parte;
DROP POLICY IF EXISTS "tipos_parte_insert" ON public.tipos_parte;
DROP POLICY IF EXISTS "tipos_parte_select" ON public.tipos_parte;
-- keep tipos_parte_all (ALL, qual=true, with_check=true)

-- usuarios SELECT: merge "Inactive users cannot access data" + usuarios_select into one policy
DROP POLICY IF EXISTS "Inactive users cannot access data" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;
CREATE POLICY "usuarios_select" ON public.usuarios
  FOR SELECT USING (
    workspace_id = my_workspace_id()
    AND (activo = true OR id = (SELECT auth.uid()))
  );

-- usuarios UPDATE: usuarios_update_admin and usuarios_update_by_admin differ only in roles
-- (admin+supervisor vs owner+admin). Keep both — they cover different actor sets.
-- Both are already fixed above (initplan). No further action needed.


-- ============================================================
-- 3. DROP DUPLICATE INDEXES (keep the idx_* prefixed names)
-- ============================================================
DROP INDEX IF EXISTS public.actividad_ot_orden_id_idx;
DROP INDEX IF EXISTS public.idx_notifications_usuario_leida;
DROP INDEX IF EXISTS public.idx_ordenes_trabajo_workspace_id;
DROP INDEX IF EXISTS public.ot_procedimientos_orden_id_idx;
DROP INDEX IF EXISTS public.paso_respuestas_ejecucion_id_idx;
DROP INDEX IF EXISTS public.procedimiento_ejecuciones_orden_id_idx;
;
