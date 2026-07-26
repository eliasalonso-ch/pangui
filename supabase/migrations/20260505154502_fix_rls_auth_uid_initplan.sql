
-- Fix my_workspace_id() and fn_mi_rol() to use (SELECT auth.uid()) so they
-- are evaluated once per query, not once per row. Also mark STABLE so the
-- planner can cache them across rows within a query.

CREATE OR REPLACE FUNCTION public.my_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.usuarios WHERE id = (SELECT auth.uid()) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_mi_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM usuarios WHERE id = (SELECT auth.uid());
$$;

-- Fix policies that call auth.uid() directly (not via helpers).
-- These are the ones flagged by the performance advisor.

-- actividad_ot
DROP POLICY IF EXISTS "actividad_ot_insert_own_workspace" ON actividad_ot;
CREATE POLICY "actividad_ot_insert_own_workspace" ON actividad_ot
  FOR INSERT WITH CHECK (
    orden_id IN (
      SELECT ot.id FROM ordenes_trabajo ot
      JOIN usuarios u ON u.workspace_id = ot.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "actividad_ot_select_own_workspace" ON actividad_ot;
CREATE POLICY "actividad_ot_select_own_workspace" ON actividad_ot
  FOR SELECT USING (
    orden_id IN (
      SELECT ot.id FROM ordenes_trabajo ot
      JOIN usuarios u ON u.workspace_id = ot.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- alerta_enviada
DROP POLICY IF EXISTS "admins can read sent alerts" ON alerta_enviada;
CREATE POLICY "admins can read sent alerts" ON alerta_enviada
  FOR SELECT USING (
    workspace_id IN (
      SELECT usuarios.workspace_id FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.rol = ANY (ARRAY['admin'::text, 'owner'::text])
    )
  );

-- comentarios_orden
DROP POLICY IF EXISTS "comentarios_delete" ON comentarios_orden;
CREATE POLICY "comentarios_delete" ON comentarios_orden
  FOR DELETE USING (usuario_id = (SELECT auth.uid()));

-- fabricantes
DROP POLICY IF EXISTS "fabricantes_insert" ON fabricantes;
CREATE POLICY "fabricantes_insert" ON fabricantes
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "fabricantes_select" ON fabricantes;
CREATE POLICY "fabricantes_select" ON fabricantes
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- feedback
DROP POLICY IF EXISTS "feedback_insert" ON feedback;
CREATE POLICY "feedback_insert" ON feedback
  FOR INSERT WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "feedback_select_admin" ON feedback;
CREATE POLICY "feedback_select_admin" ON feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'admin'::text
    )
  );

-- foto_grupo_items
DROP POLICY IF EXISTS "workspace members can manage foto_grupo_items" ON foto_grupo_items;
CREATE POLICY "workspace members can manage foto_grupo_items" ON foto_grupo_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM foto_grupos g
      JOIN usuarios u ON u.workspace_id = g.workspace_id
      WHERE g.id = foto_grupo_items.grupo_id AND u.id = (SELECT auth.uid())
    )
  );

-- foto_grupos
DROP POLICY IF EXISTS "workspace members can manage foto_grupos" ON foto_grupos;
CREATE POLICY "workspace members can manage foto_grupos" ON foto_grupos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = (SELECT auth.uid()) AND u.workspace_id = foto_grupos.workspace_id
    )
  );

-- hitos
DROP POLICY IF EXISTS "workspace members delete hitos" ON hitos;
CREATE POLICY "workspace members delete hitos" ON hitos
  FOR DELETE USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "workspace members insert hitos" ON hitos;
CREATE POLICY "workspace members insert hitos" ON hitos
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "workspace members read hitos" ON hitos;
CREATE POLICY "workspace members read hitos" ON hitos
  FOR SELECT USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

-- levantamiento_actividad
DROP POLICY IF EXISTS "workspace members can access actividad" ON levantamiento_actividad;
CREATE POLICY "workspace members can access actividad" ON levantamiento_actividad
  FOR ALL USING (
    levantamiento_id IN (
      SELECT l.id FROM levantamientos l
      JOIN usuarios u ON u.workspace_id = l.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- levantamiento_foto_grupos
DROP POLICY IF EXISTS "workspace members can access foto_grupos" ON levantamiento_foto_grupos;
CREATE POLICY "workspace members can access foto_grupos" ON levantamiento_foto_grupos
  FOR ALL USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

-- levantamiento_foto_items
DROP POLICY IF EXISTS "workspace members can access foto_items" ON levantamiento_foto_items;
CREATE POLICY "workspace members can access foto_items" ON levantamiento_foto_items
  FOR ALL USING (
    grupo_id IN (
      SELECT g.id FROM levantamiento_foto_grupos g
      JOIN usuarios u ON u.workspace_id = g.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- levantamiento_items
DROP POLICY IF EXISTS "workspace members can read items" ON levantamiento_items;
CREATE POLICY "workspace members can read items" ON levantamiento_items
  FOR ALL USING (
    seccion_id IN (
      SELECT s.id FROM levantamiento_secciones s
      JOIN levantamientos l ON l.id = s.levantamiento_id
      JOIN usuarios u ON u.workspace_id = l.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- levantamiento_materiales
DROP POLICY IF EXISTS "workspace members can access materiales" ON levantamiento_materiales;
CREATE POLICY "workspace members can access materiales" ON levantamiento_materiales
  FOR ALL USING (
    levantamiento_id IN (
      SELECT l.id FROM levantamientos l
      JOIN usuarios u ON u.workspace_id = l.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- levantamiento_secciones
DROP POLICY IF EXISTS "workspace members can read secciones" ON levantamiento_secciones;
CREATE POLICY "workspace members can read secciones" ON levantamiento_secciones
  FOR ALL USING (
    levantamiento_id IN (
      SELECT l.id FROM levantamientos l
      JOIN usuarios u ON u.workspace_id = l.workspace_id
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- levantamientos
DROP POLICY IF EXISTS "workspace members can insert levantamientos" ON levantamientos;
CREATE POLICY "workspace members can insert levantamientos" ON levantamientos
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "workspace members can read levantamientos" ON levantamientos;
CREATE POLICY "workspace members can read levantamientos" ON levantamientos
  FOR SELECT USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "workspace members can update levantamientos" ON levantamientos;
CREATE POLICY "workspace members can update levantamientos" ON levantamientos
  FOR UPDATE USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

-- lugares (policies with direct auth.uid() role check)
DROP POLICY IF EXISTS "lugares_delete" ON lugares;
CREATE POLICY "lugares_delete" ON lugares
  FOR DELETE USING (
    ((workspace_id = my_workspace_id()) OR (ubicacion_id IN (SELECT ubicaciones.id FROM ubicaciones WHERE ubicaciones.workspace_id = my_workspace_id())))
    AND (
      (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['admin'::text, 'supervisor'::text])
    )
  );

DROP POLICY IF EXISTS "lugares_delete_own_workspace" ON lugares;
CREATE POLICY "lugares_delete_own_workspace" ON lugares
  FOR DELETE USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "lugares_insert_own_workspace" ON lugares;
CREATE POLICY "lugares_insert_own_workspace" ON lugares
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "lugares_select_own_workspace" ON lugares;
CREATE POLICY "lugares_select_own_workspace" ON lugares
  FOR SELECT USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

-- materiales_usados (uses inline subselect for workspace)
DROP POLICY IF EXISTS "mat_delete" ON materiales_usados;
CREATE POLICY "mat_delete" ON materiales_usados
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = materiales_usados.orden_id
        AND ot.workspace_id = (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mat_insert" ON materiales_usados;
CREATE POLICY "mat_insert" ON materiales_usados
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = materiales_usados.orden_id
        AND ot.workspace_id = (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mat_select" ON materiales_usados;
CREATE POLICY "mat_select" ON materiales_usados
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = materiales_usados.orden_id
        AND ot.workspace_id = (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mat_update" ON materiales_usados;
CREATE POLICY "mat_update" ON materiales_usados
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = materiales_usados.orden_id
        AND ot.workspace_id = (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    )
  );

-- modelos
DROP POLICY IF EXISTS "modelos_insert" ON modelos;
CREATE POLICY "modelos_insert" ON modelos
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "modelos_select" ON modelos;
CREATE POLICY "modelos_select" ON modelos
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- notificacion_preferencias
DROP POLICY IF EXISTS "user owns their preferences" ON notificacion_preferencias;
CREATE POLICY "user owns their preferences" ON notificacion_preferencias
  FOR ALL USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

-- notifications (multiple duplicate policies — fix all)
DROP POLICY IF EXISTS "Users delete own notifications" ON notifications;
CREATE POLICY "Users delete own notifications" ON notifications
  FOR DELETE USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "delete own" ON notifications;
CREATE POLICY "delete own" ON notifications
  FOR DELETE USING ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS "notif_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications
  FOR INSERT WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notif_select" ON notifications;
CREATE POLICY "notif_select" ON notifications
  FOR SELECT USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_update" ON notifications
  FOR UPDATE USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "read own" ON notifications;
CREATE POLICY "read own" ON notifications
  FOR SELECT USING ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS "update own" ON notifications;
CREATE POLICY "update own" ON notifications
  FOR UPDATE USING ((SELECT auth.uid()) = usuario_id);

-- orden_partes
DROP POLICY IF EXISTS "workspace members can manage orden_partes" ON orden_partes;
CREATE POLICY "workspace members can manage orden_partes" ON orden_partes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      JOIN usuarios u ON u.workspace_id = o.workspace_id
      WHERE o.id = orden_partes.orden_id AND u.id = (SELECT auth.uid())
    )
  );

-- permisos_usuario
DROP POLICY IF EXISTS "permisos_select_own" ON permisos_usuario;
CREATE POLICY "permisos_select_own" ON permisos_usuario
  FOR SELECT USING (usuario_id = (SELECT auth.uid()));

-- procedimiento_pasos (uses auth.uid() for created_by check)
DROP POLICY IF EXISTS "pasos_delete" ON procedimiento_pasos;
CREATE POLICY "pasos_delete" ON procedimiento_pasos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id = my_workspace_id()
        AND (
          (fn_mi_rol() = ANY (ARRAY['admin'::text, 'owner'::text]))
          OR p.created_by = (SELECT auth.uid())
        )
    )
  );

-- procedimientos (UPDATE uses auth.uid() for created_by)
DROP POLICY IF EXISTS "proc_update" ON procedimientos;
CREATE POLICY "proc_update" ON procedimientos
  FOR UPDATE USING (
    (workspace_id = my_workspace_id())
    AND (
      (fn_mi_rol() = ANY (ARRAY['admin'::text, 'owner'::text]))
      OR created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (workspace_id = my_workspace_id())
    AND (
      (fn_mi_rol() = ANY (ARRAY['admin'::text, 'owner'::text]))
      OR created_by = (SELECT auth.uid())
    )
  );

-- push_subscriptions
DROP POLICY IF EXISTS "delete own" ON push_subscriptions;
CREATE POLICY "delete own" ON push_subscriptions
  FOR DELETE USING ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS "insert own" ON push_subscriptions;
CREATE POLICY "insert own" ON push_subscriptions
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = usuario_id);

DROP POLICY IF EXISTS "push_delete" ON push_subscriptions;
CREATE POLICY "push_delete" ON push_subscriptions
  FOR DELETE USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_insert" ON push_subscriptions;
CREATE POLICY "push_insert" ON push_subscriptions
  FOR INSERT WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_select" ON push_subscriptions;
CREATE POLICY "push_select" ON push_subscriptions
  FOR SELECT USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "select own" ON push_subscriptions;
CREATE POLICY "select own" ON push_subscriptions
  FOR SELECT USING ((SELECT auth.uid()) = usuario_id);

-- reglas_alerta_workspace
DROP POLICY IF EXISTS "admins can manage rules" ON reglas_alerta_workspace;
CREATE POLICY "admins can manage rules" ON reglas_alerta_workspace
  FOR ALL USING (
    workspace_id IN (
      SELECT usuarios.workspace_id FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.rol = ANY (ARRAY['admin'::text, 'owner'::text])
    )
  );

DROP POLICY IF EXISTS "workspace members can read rules" ON reglas_alerta_workspace;
CREATE POLICY "workspace members can read rules" ON reglas_alerta_workspace
  FOR SELECT USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

-- sociedades
DROP POLICY IF EXISTS "sociedades_select_own_workspace" ON sociedades;
CREATE POLICY "sociedades_select_own_workspace" ON sociedades
  FOR SELECT USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
  );

-- solicitudes
DROP POLICY IF EXISTS "Solicitante can delete own solicitudes" ON solicitudes;
CREATE POLICY "Solicitante can delete own solicitudes" ON solicitudes
  FOR DELETE USING (creado_por = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Solicitante can update own solicitudes" ON solicitudes;
CREATE POLICY "Solicitante can update own solicitudes" ON solicitudes
  FOR UPDATE USING (creado_por = (SELECT auth.uid()))
  WITH CHECK (creado_por = (SELECT auth.uid()));

DROP POLICY IF EXISTS "solicitudes_insert" ON solicitudes;
CREATE POLICY "solicitudes_insert" ON solicitudes
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    AND creado_por = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "solicitudes_select" ON solicitudes;
CREATE POLICY "solicitudes_select" ON solicitudes
  FOR SELECT USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    AND (
      creado_por = (SELECT auth.uid())
      OR (
        (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
        = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
      )
    )
  );

DROP POLICY IF EXISTS "solicitudes_update" ON solicitudes;
CREATE POLICY "solicitudes_update" ON solicitudes
  FOR UPDATE USING (
    workspace_id IN (SELECT usuarios.workspace_id FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
    AND (
      (creado_por = (SELECT auth.uid()) AND estado = 'pendiente'::text)
      OR (
        (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()))
        = ANY (ARRAY['owner'::text, 'admin'::text])
      )
    )
  );

-- solicitudes_arco
DROP POLICY IF EXISTS "arco_select" ON solicitudes_arco;
CREATE POLICY "arco_select" ON solicitudes_arco
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "arco_update" ON solicitudes_arco;
CREATE POLICY "arco_update" ON solicitudes_arco
  FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "jefe_select" ON solicitudes_arco;
CREATE POLICY "jefe_select" ON solicitudes_arco
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'jefe'::text)
  );

DROP POLICY IF EXISTS "jefe_update" ON solicitudes_arco;
CREATE POLICY "jefe_update" ON solicitudes_arco
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'jefe'::text)
  );

-- tipos_parte
DROP POLICY IF EXISTS "tipos_parte_insert" ON tipos_parte;
CREATE POLICY "tipos_parte_insert" ON tipos_parte
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "tipos_parte_select" ON tipos_parte;
CREATE POLICY "tipos_parte_select" ON tipos_parte
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- usuarios
DROP POLICY IF EXISTS "Inactive users cannot access data" ON usuarios;
CREATE POLICY "Inactive users cannot access data" ON usuarios
  FOR SELECT USING (activo = true OR (SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "admins can insert usuarios" ON usuarios;
CREATE POLICY "admins can insert usuarios" ON usuarios
  FOR INSERT WITH CHECK (
    workspace_id = (
      SELECT usuarios_1.workspace_id FROM usuarios usuarios_1
      WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1
    )
    AND (
      SELECT usuarios_1.rol FROM usuarios usuarios_1
      WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1
    ) = ANY (ARRAY['admin'::text, 'supervisor'::text])
  );

DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;
CREATE POLICY "usuarios_delete" ON usuarios
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND id <> (SELECT auth.uid())
    AND (
      SELECT usuarios_1.rol FROM usuarios usuarios_1
      WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1
    ) = 'admin'::text
  );

DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND rol = (
      SELECT usuarios_1.rol FROM usuarios usuarios_1
      WHERE usuarios_1.id = (SELECT auth.uid()) LIMIT 1
    )
    AND workspace_id = my_workspace_id()
  );
;
