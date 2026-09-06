-- Salida del owner: traspasar la propiedad, o borrar el workspace entero.
--
-- `abandonar_organizacion` (20260906120000) le prohíbe irse al owner, porque
-- `billing_profiles` da acceso de facturación SOLO a `rol = 'owner'`: un
-- workspace sin owner queda con una suscripción que nadie puede administrar.
-- Eso dejaba al owner sin ninguna salida. Acá están las dos que faltaban.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Traspasar la propiedad.
--
-- El owner elige a otro miembro vigente, que pasa a `owner`, y él baja a
-- `admin`. Se hace en una sola transacción porque el estado intermedio —dos
-- owners, o ninguno— rompe las políticas RLS de facturación.
--
-- Después de esto el ex-owner ya puede usar `abandonar_organizacion` como
-- cualquier otro miembro.
CREATE OR REPLACE FUNCTION public.transferir_propiedad(
  p_nuevo_owner uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_workspace uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.';
  END IF;
  IF p_nuevo_owner IS NULL THEN
    RAISE EXCEPTION 'Debes elegir a quién traspasar la propiedad.';
  END IF;
  IF p_nuevo_owner = v_actor THEN
    RAISE EXCEPTION 'Ya eres el propietario.';
  END IF;

  -- Solo el owner traspasa: un admin no puede auto-promoverse.
  SELECT workspace_id INTO v_workspace
    FROM public.usuarios
   WHERE id = v_actor AND rol = 'owner' AND deleted_at IS NULL;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Solo el propietario puede traspasar la propiedad.';
  END IF;

  -- El destino tiene que estar vigente y en el MISMO workspace.
  PERFORM 1 FROM public.usuarios
    WHERE id = p_nuevo_owner
      AND workspace_id = v_workspace
      AND COALESCE(activo, true)
      AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La persona elegida no existe, está inactiva o no pertenece a este espacio de trabajo.';
  END IF;

  UPDATE public.usuarios SET rol = 'owner' WHERE id = p_nuevo_owner;
  UPDATE public.usuarios SET rol = 'admin' WHERE id = v_actor;
END;
$$;

COMMENT ON FUNCTION public.transferir_propiedad(uuid) IS
  'El owner traspasa la propiedad del workspace a otro miembro vigente y queda '
  'como admin. Atómico: dos owners (o ninguno) rompe las RLS de facturación.';

REVOKE ALL ON FUNCTION public.transferir_propiedad(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_propiedad(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Borrar el workspace completo.
--
-- Es la salida definitiva del owner: se lleva la organización entera —OTs,
-- activos, procedimientos, ubicaciones, catálogos y las cuentas de todos los
-- miembros—, no solo su usuario.
--
-- NO se llama desde el cliente. La ruta /api/workspace/eliminar la invoca con
-- service_role DESPUÉS de haber cancelado la suscripción en Flow y verificado
-- la contraseña del owner. El orden importa: si el workspace desaparece antes
-- de cancelar, queda un cobro recurrente en Flow sin nada en la base que lo
-- relacione con un cliente.
--
-- Casi todas las tablas cuelgan de `workspaces` con ON DELETE CASCADE, así que
-- el DELETE final las arrastra. Las excepciones son `usuarios` —cinco claves
-- foráneas la apuntan sin ON DELETE, ver 20260730190000— y las filas de otras
-- tablas que la referencian. Por eso el borrado va en orden: primero lo que
-- apunta a usuarios, después usuarios, y al final el workspace.
--
-- Los objetos en R2 (fotos, firmas, logos) NO se tocan acá: viven fuera de
-- Postgres y los borra la ruta HTTP, que sí puede hablar con R2.
CREATE OR REPLACE FUNCTION public.eliminar_workspace(
  p_workspace uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'Falta el workspace.';
  END IF;

  -- Tablas que referencian `usuarios` sin ON DELETE: hay que vaciarlas antes
  -- de poder borrar las personas. Son historial de ejecución, y el workspace
  -- entero se va igual, así que no queda nada huérfano.
  -- Se navega por orden_id, no por workspace_id: esa columna se agregó después
  -- (20260505163139) y es nullable, así que las ejecuciones viejas la tienen en
  -- NULL y un filtro por workspace_id las dejaría sin borrar.
  DELETE FROM public.paso_respuestas pr
   USING public.procedimiento_ejecuciones pe, public.ordenes_trabajo ot
   WHERE pr.ejecucion_id = pe.id
     AND pe.orden_id = ot.id
     AND ot.workspace_id = p_workspace;

  DELETE FROM public.procedimiento_ejecuciones pe
   USING public.ordenes_trabajo ot
   WHERE pe.orden_id = ot.id
     AND ot.workspace_id = p_workspace;

  DELETE FROM public.ot_procedimientos op
   USING public.ordenes_trabajo ot
   WHERE op.orden_id = ot.id
     AND ot.workspace_id = p_workspace;

  DELETE FROM public.actividad_ot ao
   USING public.ordenes_trabajo ot
   WHERE ao.orden_id = ot.id
     AND ot.workspace_id = p_workspace;

  -- Las OTs referencian usuarios por `asignados_ids` (array, sin FK) y por
  -- columnas de autoría; se borran antes que las personas de todos modos.
  DELETE FROM public.ordenes_trabajo WHERE workspace_id = p_workspace;

  -- `deleted_by` apunta a usuarios del mismo workspace: soltarlo evita que el
  -- DELETE siguiente choque contra su propia tabla.
  UPDATE public.usuarios SET deleted_by = NULL WHERE workspace_id = p_workspace;

  DELETE FROM public.usuarios WHERE workspace_id = p_workspace;

  -- El resto cuelga de workspaces con ON DELETE CASCADE.
  DELETE FROM public.workspaces WHERE id = p_workspace;
END;
$$;

COMMENT ON FUNCTION public.eliminar_workspace(uuid) IS
  'Borra un workspace y todo lo suyo. Solo para service_role desde '
  '/api/workspace/eliminar, que antes cancela la suscripción en Flow, verifica '
  'la contraseña del owner y purga los objetos de R2.';

-- Solo service_role: esto no se expone a `authenticated` en ninguna forma.
REVOKE ALL ON FUNCTION public.eliminar_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_workspace(uuid) TO service_role;
