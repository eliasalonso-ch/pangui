
-- ============================================================
-- 1. reglas_alerta_workspace
-- Problem: ALL policy covers SELECT for admins AND a separate SELECT policy covers everyone,
-- causing two permissive SELECT policies.
-- Fix: replace ALL with explicit INSERT/UPDATE/DELETE for admins only.
-- SELECT for all workspace members is handled by "workspace members can read rules" alone.
-- ============================================================
DROP POLICY IF EXISTS "admins can manage rules" ON public.reglas_alerta_workspace;

CREATE POLICY "admins can insert rules" ON public.reglas_alerta_workspace
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM usuarios
      WHERE id = (SELECT auth.uid()) AND rol = ANY (ARRAY['admin'::text, 'owner'::text])
    )
  );

CREATE POLICY "admins can update rules" ON public.reglas_alerta_workspace
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios
      WHERE id = (SELECT auth.uid()) AND rol = ANY (ARRAY['admin'::text, 'owner'::text])
    )
  );

CREATE POLICY "admins can delete rules" ON public.reglas_alerta_workspace
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios
      WHERE id = (SELECT auth.uid()) AND rol = ANY (ARRAY['admin'::text, 'owner'::text])
    )
  );
-- SELECT is now solely "workspace members can read rules" — no duplicate.


-- ============================================================
-- 2. usuarios UPDATE
-- Problem: usuarios_update_admin (admin|supervisor) and usuarios_update_by_admin (owner|admin)
-- both cover the admin role, causing overlap.
-- Fix: merge into one "usuarios_update_elevated" covering owner|admin|supervisor.
-- usuarios_update (own row) stays unchanged.
-- ============================================================
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_by_admin" ON public.usuarios;

CREATE POLICY "usuarios_update_elevated" ON public.usuarios
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios_1.rol FROM usuarios usuarios_1
         WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text])
  )
  WITH CHECK (workspace_id = my_workspace_id());
;
