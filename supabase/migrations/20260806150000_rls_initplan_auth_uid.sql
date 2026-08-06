-- Wrap bare `auth.uid()` in RLS policies as `(SELECT auth.uid())`.
--
-- Written bare, `auth.uid()` is re-evaluated once PER ROW. Wrapped in a
-- scalar subquery, Postgres hoists it to an InitPlan and evaluates it once per
-- query. Same semantics, strictly less work.
--
-- Invisible at current row counts, but it is the pattern that decides whether
-- these policies still behave when a table reaches six figures, and the rewrite
-- is mechanical. The policies added earlier today already use this form; these
-- 20 are older ones.
--
-- Every policy below is recreated with its predicate otherwise UNCHANGED, with
-- one deliberate exception noted at inspection_routes_delete.

-- ── actividad_ot ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS actividad_delete_own ON public.actividad_ot;
CREATE POLICY actividad_delete_own ON public.actividad_ot
FOR DELETE TO authenticated
USING (
  tipo = 'comentario'
  AND usuario_id = (SELECT auth.uid())
  AND orden_id IN (SELECT id FROM ordenes_trabajo WHERE workspace_id = my_workspace_id())
);

DROP POLICY IF EXISTS actividad_update_own ON public.actividad_ot;
CREATE POLICY actividad_update_own ON public.actividad_ot
FOR UPDATE TO authenticated
USING (
  tipo = 'comentario'
  AND usuario_id = (SELECT auth.uid())
  AND orden_id IN (SELECT id FROM ordenes_trabajo WHERE workspace_id = my_workspace_id())
)
WITH CHECK (
  tipo = 'comentario'
  AND usuario_id = (SELECT auth.uid())
  AND orden_id IN (SELECT id FROM ordenes_trabajo WHERE workspace_id = my_workspace_id())
);

-- ── billing_profiles ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workspace owner can manage billing profile" ON public.billing_profiles;
CREATE POLICY "workspace owner can manage billing profile" ON public.billing_profiles
FOR ALL
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = billing_profiles.workspace_id
            AND u.rol = 'owner')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = billing_profiles.workspace_id
            AND u.rol = 'owner')
);

-- ── import_templates ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS import_templates_select ON public.import_templates;
CREATE POLICY import_templates_select ON public.import_templates
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = import_templates.workspace_id
            AND u.activo = true)
);

DROP POLICY IF EXISTS import_templates_insert ON public.import_templates;
CREATE POLICY import_templates_insert ON public.import_templates
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = import_templates.workspace_id
            AND u.activo = true
            AND u.rol = ANY (ARRAY['owner','admin']))
);

DROP POLICY IF EXISTS import_templates_update ON public.import_templates;
CREATE POLICY import_templates_update ON public.import_templates
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = import_templates.workspace_id
            AND u.activo = true
            AND u.rol = ANY (ARRAY['owner','admin']))
);

DROP POLICY IF EXISTS import_templates_delete ON public.import_templates;
CREATE POLICY import_templates_delete ON public.import_templates
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = import_templates.workspace_id
            AND u.activo = true
            AND u.rol = ANY (ARRAY['owner','admin']))
);

-- ── inspection_routes ────────────────────────────────────────────────────────
-- Also drops 'supervisor', which is not in the role taxonomy
-- (owner/admin/member/requester) — the same dead branch already removed from
-- usuarios_update in 20260806140000.
DROP POLICY IF EXISTS inspection_routes_delete ON public.inspection_routes;
CREATE POLICY inspection_routes_delete ON public.inspection_routes
FOR DELETE TO authenticated
USING (
  workspace_id = my_workspace_id()
  AND (SELECT rol FROM usuarios WHERE id = (SELECT auth.uid()) LIMIT 1) = ANY (ARRAY['admin','owner'])
);

-- ── material_proveedores ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workspace members can read material providers" ON public.material_proveedores;
CREATE POLICY "workspace members can read material providers" ON public.material_proveedores
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM partes p JOIN usuarios u ON u.workspace_id = p.workspace_id
          WHERE p.id = material_proveedores.parte_id AND u.id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "workspace members can add material providers" ON public.material_proveedores;
CREATE POLICY "workspace members can add material providers" ON public.material_proveedores
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM partes p
          JOIN proveedores pr ON pr.workspace_id = p.workspace_id
          JOIN usuarios u ON u.workspace_id = p.workspace_id
          WHERE p.id = material_proveedores.parte_id
            AND pr.id = material_proveedores.proveedor_id
            AND u.id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "workspace members can remove material providers" ON public.material_proveedores;
CREATE POLICY "workspace members can remove material providers" ON public.material_proveedores
FOR DELETE
USING (
  EXISTS (SELECT 1 FROM partes p JOIN usuarios u ON u.workspace_id = p.workspace_id
          WHERE p.id = material_proveedores.parte_id AND u.id = (SELECT auth.uid()))
);

-- ── material_* read policies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "workspace members can read material reservations" ON public.material_reservations;
CREATE POLICY "workspace members can read material reservations" ON public.material_reservations
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid()) AND u.workspace_id = material_reservations.workspace_id)
);

DROP POLICY IF EXISTS "workspace members can read material stock entries" ON public.material_stock_entries;
CREATE POLICY "workspace members can read material stock entries" ON public.material_stock_entries
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid()) AND u.workspace_id = material_stock_entries.workspace_id)
);

DROP POLICY IF EXISTS "workspace members can read material withdrawals" ON public.material_withdrawals;
CREATE POLICY "workspace members can read material withdrawals" ON public.material_withdrawals
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid()) AND u.workspace_id = material_withdrawals.workspace_id)
);

DROP POLICY IF EXISTS "workspace members can read material withdrawal returns" ON public.material_withdrawal_returns;
CREATE POLICY "workspace members can read material withdrawal returns" ON public.material_withdrawal_returns
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid()) AND u.workspace_id = material_withdrawal_returns.workspace_id)
);

-- ── ordenes_marcadas ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ordenes_marcadas_select ON public.ordenes_marcadas;
CREATE POLICY ordenes_marcadas_select ON public.ordenes_marcadas
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ordenes_marcadas_insert ON public.ordenes_marcadas;
CREATE POLICY ordenes_marcadas_insert ON public.ordenes_marcadas
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ordenes_marcadas_delete ON public.ordenes_marcadas;
CREATE POLICY ordenes_marcadas_delete ON public.ordenes_marcadas
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

-- ── reglas_alerta_usuarios ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "workspace members can read alert recipients" ON public.reglas_alerta_usuarios;
CREATE POLICY "workspace members can read alert recipients" ON public.reglas_alerta_usuarios
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid()) AND u.workspace_id = reglas_alerta_usuarios.workspace_id)
);

DROP POLICY IF EXISTS "workspace managers can manage alert recipients" ON public.reglas_alerta_usuarios;
CREATE POLICY "workspace managers can manage alert recipients" ON public.reglas_alerta_usuarios
FOR ALL
USING (
  EXISTS (SELECT 1 FROM usuarios u
          WHERE u.id = (SELECT auth.uid())
            AND u.workspace_id = reglas_alerta_usuarios.workspace_id
            AND u.rol = ANY (ARRAY['owner','admin']))
)
WITH CHECK (
  EXISTS (SELECT 1
          FROM usuarios actor
          JOIN reglas_alerta_workspace r
            ON r.id = reglas_alerta_usuarios.regla_id
           AND r.workspace_id = reglas_alerta_usuarios.workspace_id
          JOIN usuarios recipient
            ON recipient.id = reglas_alerta_usuarios.usuario_id
           AND recipient.workspace_id = reglas_alerta_usuarios.workspace_id
          WHERE actor.id = (SELECT auth.uid())
            AND actor.workspace_id = reglas_alerta_usuarios.workspace_id
            AND actor.rol = ANY (ARRAY['owner','admin']))
);
