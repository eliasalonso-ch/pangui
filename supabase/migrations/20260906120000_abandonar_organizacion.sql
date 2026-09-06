-- Abandonar organización: baja self-service del propio usuario.
--
-- `dar_de_baja_usuario` NO sirve para esto: prohíbe explícitamente que el actor
-- se dé de baja a sí mismo (`IF p_usuario = p_actor THEN RAISE EXCEPTION`), que
-- es la regla correcta para la pantalla de Equipo — un admin dando de baja a
-- otra persona — pero deja al usuario sin forma de irse por su cuenta.
--
-- Diferencias con la baja administrada:
--
--   1. El actor es siempre auth.uid(). La función no recibe a quién dar de baja,
--      así que no puede usarse para echar a nadie más, ni siquiera manipulando
--      el payload desde el cliente.
--
--   2. La reasignación y la baja ocurren en la MISMA transacción. Si se dejaran
--      como dos llamadas (reasignar_trabajo_usuario + baja), una falla de red
--      entre ambas dejaría el trabajo movido y al usuario todavía dentro, o
--      —peor— exigiría reintentar con el destino ya perdido. Acá o pasa todo o
--      no pasa nada.
--
--   3. El owner no puede irse. `billing_profiles` da acceso de facturación
--      SOLO a `rol = 'owner'` (ver 20260728180754_billing_profiles.sql), así
--      que un workspace sin owner queda con una suscripción que nadie puede
--      administrar ni cancelar. Primero hay que traspasar la propiedad.
--
-- El destino de la reasignación es obligatorio cuando queda trabajo abierto:
-- irse no puede dejar una OT sin responsable.
CREATE OR REPLACE FUNCTION public.abandonar_organizacion(
  p_reasignar_a uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_workspace uuid;
  v_rol       text;
  v_abiertas  integer;
  v_movidas   integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.';
  END IF;

  SELECT workspace_id, rol INTO v_workspace, v_rol
    FROM public.usuarios
   WHERE id = v_actor AND deleted_at IS NULL;

  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no existe o ya fue dado de baja.';
  END IF;

  -- El owner sostiene la facturación del workspace: si se va, nadie puede
  -- administrar la suscripción. Tiene que traspasar la propiedad primero.
  IF v_rol = 'owner' THEN
    RAISE EXCEPTION 'Eres el propietario del espacio de trabajo. Transfiere la propiedad a otra persona antes de abandonarlo.';
  END IF;

  -- Cuánto trabajo abierto queda a su nombre.
  SELECT count(*) INTO v_abiertas
    FROM public.ordenes_trabajo
   WHERE workspace_id = v_workspace
     AND deleted_at IS NULL
     AND estado IN ('pendiente', 'en_espera', 'en_curso', 'en_revision')
     AND v_actor = ANY(COALESCE(asignados_ids, '{}'::uuid[]));

  IF v_abiertas > 0 THEN
    IF p_reasignar_a IS NULL THEN
      RAISE EXCEPTION 'Tienes % OT(s) abiertas asignadas. Elige a quién reasignarlas antes de abandonar la organización.', v_abiertas;
    END IF;

    IF p_reasignar_a = v_actor THEN
      RAISE EXCEPTION 'No puedes reasignarte el trabajo a ti mismo.';
    END IF;

    -- El destino tiene que ser alguien vigente del MISMO workspace: sin esto,
    -- un id de otra organización movería trabajo fuera del espacio.
    PERFORM 1 FROM public.usuarios
      WHERE id = p_reasignar_a
        AND workspace_id = v_workspace
        AND COALESCE(activo, true)
        AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La persona elegida no existe, está inactiva o no pertenece a este espacio de trabajo.';
    END IF;

    -- Solo asignaciones de OTs abiertas. La autoría (comentarios, fotos,
    -- firmas, OTs cerradas) no se toca: reescribirla falsearía el historial.
    WITH movidas AS (
      UPDATE public.ordenes_trabajo
         SET asignados_ids = (
               SELECT ARRAY(
                 SELECT DISTINCT unnest(
                   array_replace(COALESCE(asignados_ids, '{}'::uuid[]), v_actor, p_reasignar_a)
                 )
               )
             )
       WHERE workspace_id = v_workspace
         AND deleted_at IS NULL
         AND estado IN ('pendiente', 'en_espera', 'en_curso', 'en_revision')
         AND v_actor = ANY(COALESCE(asignados_ids, '{}'::uuid[]))
      RETURNING 1
    )
    SELECT count(*) INTO v_movidas FROM movidas;
  END IF;

  -- Baja definitiva: la fila queda para que el historial siga teniendo autor.
  -- `deleted_by` es el propio usuario, que es exactamente lo que pasó.
  UPDATE public.usuarios
     SET deleted_at = now(),
         deleted_by = v_actor,
         activo = false
   WHERE id = v_actor;

  RETURN v_movidas;
END;
$$;

COMMENT ON FUNCTION public.abandonar_organizacion(uuid) IS
  'Baja self-service: el usuario autenticado abandona su workspace, reasignando '
  'en la misma transacción el trabajo abierto que tenga. El owner no puede irse '
  'sin traspasar antes la propiedad, porque sostiene la facturación.';

REVOKE ALL ON FUNCTION public.abandonar_organizacion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abandonar_organizacion(uuid) TO authenticated;
