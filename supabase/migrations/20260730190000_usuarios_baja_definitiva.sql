-- Baja definitiva de usuarios (tombstone) + reasignación de trabajo.
--
-- Hoy solo existe `activo`, un booleano que la pantalla de Equipo alterna. No
-- hay forma de dar de baja a alguien de verdad ni de mover su trabajo abierto
-- a otra persona.
--
-- Borrar la fila NO es opción: cinco claves foráneas apuntan a `usuarios` sin
-- `ON DELETE` (por lo tanto NO ACTION), así que Postgres rechaza el DELETE de
-- cualquiera que haya trabajado:
--     actividad_ot.usuario_id
--     ot_procedimientos.adjuntado_por
--     paso_respuestas.firmado_por_id / respondido_por
--     procedimiento_ejecuciones.iniciado_por / completado_por
-- Y aunque se pudiera, el historial perdería a su autor: los comentarios de un
-- técnico son evidencia de la OT y tienen que seguir diciendo quién los
-- escribió.
--
-- El modelo es entonces:
--   activo = false          -> desactivado: no entra, no cuenta para facturación
--   deleted_at IS NOT NULL  -> baja definitiva: además desaparece de selectores
--                              y de la lista de Equipo, pero la fila queda para
--                              que el historial siga siendo legible.
--
-- Aditivo: columnas nuevas anulables, sin DROP y sin NOT NULL.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.usuarios.deleted_at IS
  'Baja definitiva. La fila se conserva para no romper el historial (comentarios, '
  'firmas, ejecuciones de procedimiento); el usuario no puede iniciar sesión, no '
  'aparece en selectores ni en Equipo, y no cuenta para facturación.';

-- Los listados filtran por deleted_at IS NULL en cada pantalla de equipo.
CREATE INDEX IF NOT EXISTS idx_usuarios_workspace_vigentes
  ON public.usuarios (workspace_id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reasignar el trabajo abierto de un usuario a otro.
--
-- Mueve SOLO asignaciones de OTs abiertas. No toca autoría: comentarios, fotos,
-- firmas y OTs cerradas siguen perteneciendo a quien las hizo — reescribir eso
-- falsearía el historial.
--
-- Devuelve cuántas OTs se movieron.
CREATE OR REPLACE FUNCTION public.reasignar_trabajo_usuario(
  p_desde uuid,
  p_hacia uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_workspace uuid;
  v_workspace_destino uuid;
  v_movidas integer := 0;
BEGIN
  IF p_desde IS NULL OR p_hacia IS NULL THEN
    RAISE EXCEPTION 'Se requieren ambos usuarios.';
  END IF;
  IF p_desde = p_hacia THEN
    RAISE EXCEPTION 'El usuario de origen y el de destino son el mismo.';
  END IF;

  SELECT workspace_id INTO v_workspace FROM public.usuarios WHERE id = p_desde;
  SELECT workspace_id INTO v_workspace_destino FROM public.usuarios
   WHERE id = p_hacia AND COALESCE(activo, true) AND deleted_at IS NULL;

  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'El usuario de origen no existe.';
  END IF;
  IF v_workspace_destino IS NULL THEN
    RAISE EXCEPTION 'El usuario de destino no existe, está inactivo o fue dado de baja.';
  END IF;
  IF v_workspace <> v_workspace_destino THEN
    RAISE EXCEPTION 'Ambos usuarios deben pertenecer al mismo espacio de trabajo.';
  END IF;

  -- Solo OTs abiertas: lo cerrado es historial.
  WITH movidas AS (
    UPDATE public.ordenes_trabajo
       SET asignados_ids = (
             SELECT ARRAY(
               SELECT DISTINCT unnest(
                 array_replace(COALESCE(asignados_ids, '{}'::uuid[]), p_desde, p_hacia)
               )
             )
           )
     WHERE workspace_id = v_workspace
       AND deleted_at IS NULL
       AND estado IN ('pendiente', 'en_espera', 'en_curso', 'en_revision')
       AND p_desde = ANY(COALESCE(asignados_ids, '{}'::uuid[]))
    RETURNING 1
  )
  SELECT count(*) INTO v_movidas FROM movidas;

  RETURN v_movidas;
END;
$$;

REVOKE ALL ON FUNCTION public.reasignar_trabajo_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reasignar_trabajo_usuario(uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Dar de baja definitiva a un usuario.
--
-- Se niega si le queda trabajo abierto: primero hay que reasignarlo. Eso evita
-- que una OT quede sin responsable por dar de baja a alguien.
CREATE OR REPLACE FUNCTION public.dar_de_baja_usuario(
  p_usuario uuid,
  p_actor uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_workspace uuid;
  v_abiertas integer;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.usuarios WHERE id = p_usuario;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'El usuario no existe.';
  END IF;
  IF p_usuario = p_actor THEN
    RAISE EXCEPTION 'No podés darte de baja a vos mismo.';
  END IF;

  SELECT count(*) INTO v_abiertas
    FROM public.ordenes_trabajo
   WHERE workspace_id = v_workspace
     AND deleted_at IS NULL
     AND estado IN ('pendiente', 'en_espera', 'en_curso', 'en_revision')
     AND p_usuario = ANY(COALESCE(asignados_ids, '{}'::uuid[]));

  IF v_abiertas > 0 THEN
    RAISE EXCEPTION 'El usuario tiene % OT(s) abiertas asignadas. Reasignalas antes de darlo de baja.', v_abiertas;
  END IF;

  UPDATE public.usuarios
     SET deleted_at = now(),
         deleted_by = p_actor,
         activo = false
   WHERE id = p_usuario;
END;
$$;

REVOKE ALL ON FUNCTION public.dar_de_baja_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dar_de_baja_usuario(uuid, uuid) TO authenticated, service_role;
