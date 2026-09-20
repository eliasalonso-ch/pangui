-- Cierra las funciones SECURITY DEFINER que `anon` podia ejecutar sin control.
--
-- Las reporto el linter de seguridad de Supabase al aplicar las migraciones de
-- automatizaciones. NO ES TEORICO: con la anon key —la que viaja dentro del
-- bundle del navegador, o sea publica— y sin ninguna sesion,
--
--   POST /rest/v1/rpc/get_overview_stats {"p_workspace_id":"<uuid>"}
--     -> {"altaPrioridad":19,"vencidas":13,...}   datos reales del espacio
--
--   POST /rest/v1/rpc/plan_avisar_proximas {}
--     -> 200, habiendo entrado a su camino de escritura de notificaciones
--
-- Con el uuid de un workspace —que aparece en cualquier URL de la app— se podia
-- leer su tablero y disparar notificaciones a su gente.
--
-- POR QUE ESTABAN ABIERTAS: en Postgres, `GRANT EXECUTE` a PUBLIC es el default
-- de toda funcion nueva, y PostgREST publica en /rest/v1/rpc/ todo lo que el rol
-- pueda ejecutar. Hay que revocar a mano; olvidarlo no da ningun error.
--
-- CINCO SE CIERRAN DEL TODO (nadie las llama desde el cliente):
--   buscar_materiales                      -> cero llamadores, y ademas esta
--                                             rota: consulta una tabla
--                                             `materiales` que ya no existe.
--   plan_avisar_proximas
--   plan_generar_ordenes
--   plan_generar_ordenes_compra            -> solo las llama plan_tick_diario,
--                                             desde pg_cron como superusuario,
--                                             que no pasa por estos GRANT.
--                                             Verificado: el tick sigue corriendo.
REVOKE ALL ON FUNCTION public.buscar_materiales(uuid, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_avisar_proximas()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_generar_ordenes(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_generar_ordenes_compra()             FROM PUBLIC, anon, authenticated;

-- LA SEXTA SI SE USA, asi que se endurece en vez de cerrarse.
--
-- `lib/planes-api.ts` la llama al crear y al editar un plan. Cargaba el plan por
-- id y le materializaba ocurrencias sin mirar de quien es: un usuario
-- autenticado podia pasar el uuid del plan de otra empresa y escribirle filas en
-- `plan_ocurrencias`. Ahora comprueba el workspace.
--
-- El chequeo deja pasar a quien NO tiene sesion a proposito: por ahi entra
-- plan_tick_diario desde el cron, que corre sin usuario y tiene que poder
-- materializar los planes de todos los espacios.
CREATE OR REPLACE FUNCTION public.plan_materializar_ocurrencias(
  p_plan_id uuid,
  p_horizonte_dias integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_plan      public.planes_mantencion;
  v_fecha     date;
  v_iter      integer;
  v_limite    date;
  v_creadas   integer := 0;
  v_guarda    integer := 0;
  v_weekday   integer;
BEGIN
  SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = p_plan_id;
  IF v_plan.id IS NULL OR NOT v_plan.activo THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NOT NULL
     AND v_plan.workspace_id IS DISTINCT FROM public.my_workspace_id() THEN
    RAISE EXCEPTION 'El plan no pertenece a tu espacio de trabajo.';
  END IF;

  v_limite := CURRENT_DATE + make_interval(
    days => GREATEST(COALESCE(p_horizonte_dias, v_plan.horizonte_dias), 1)
  );
  IF v_plan.fecha_fin IS NOT NULL AND v_plan.fecha_fin < v_limite THEN
    v_limite := v_plan.fecha_fin;
  END IF;

  SELECT fecha_programada, iteracion INTO v_fecha, v_iter
  FROM public.plan_ocurrencias
  WHERE plan_id = p_plan_id
  ORDER BY iteracion DESC
  LIMIT 1;

  IF v_fecha IS NULL THEN
    v_fecha := v_plan.fecha_inicio;
    v_iter  := 1;

    -- Alinea la primera ocurrencia al dia de la semana pedido, avanzando desde
    -- fecha_inicio (nunca hacia atras: el plan no puede empezar antes de su
    -- fecha de inicio).
    IF v_plan.recurrencia = 'semanal' THEN
      v_weekday := (v_plan.recurrencia_config->'weekdays'->>0)::integer;
      IF v_weekday IS NOT NULL THEN
        v_fecha := v_fecha + ((v_weekday - EXTRACT(DOW FROM v_fecha)::integer + 7) % 7);
      END IF;
    END IF;
  ELSE
    v_fecha := public.plan_avanzar_fecha(v_fecha, v_plan.recurrencia, v_plan.recurrencia_config);
    v_iter  := v_iter + 1;
  END IF;

  WHILE v_fecha IS NOT NULL AND v_fecha <= v_limite AND v_guarda < 2000 LOOP
    INSERT INTO public.plan_ocurrencias (
      plan_id, workspace_id, fecha_programada, fecha_apertura, iteracion
    ) VALUES (
      p_plan_id, v_plan.workspace_id,
      v_fecha,
      v_fecha - make_interval(days => v_plan.dias_apertura_previa),
      v_iter
    )
    ON CONFLICT (plan_id, iteracion) DO NOTHING;

    v_creadas := v_creadas + 1;
    v_iter    := v_iter + 1;
    v_guarda  := v_guarda + 1;
    v_fecha   := public.plan_avanzar_fecha(v_fecha, v_plan.recurrencia, v_plan.recurrencia_config);
  END LOOP;

  RETURN v_creadas;
END;
$$;

REVOKE ALL ON FUNCTION public.plan_materializar_ocurrencias(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_materializar_ocurrencias(uuid, integer) TO authenticated;

-- QUE QUEDA ABIERTO A PROPOSITO
--
-- Las 15 funciones de trigger que el linter tambien lista (fn_medidor_lectura_
-- critica, fn_automatizacion_lectura, etc.) no se tocan: retornan `trigger` y
-- sin contexto de trigger fallan solas, asi que por REST no hacen nada.
--
-- Las que si comprueban al que llama tampoco: ajustar_stock_parte,
-- deactivate_usuario, set_solo_asignadas, fn_mi_rol, fn_puede_ver,
-- my_workspace_id y solo_asignadas_para_mi miran `auth.uid()`, que con `anon`
-- es NULL, asi que se defienden solas.
--
-- ponytail: quedan 8 tablas con RLS activo y cero politicas. Es fail-closed
-- —nadie accede salvo service_role— asi que no es una fuga, pero conviene
-- decidir la politica de cada una en vez de dejarlas asi para siempre.


-- get_overview_stats: se endurece en vez de cerrarse.
--
-- El primer intento la revoco tambien a `authenticated`, y eso era de mas: la
-- app MOVIL la expone en `useOverviewStats` (features/work-orders/hooks.ts).
-- Hoy ninguna pantalla usa ese hook, pero cerrarla del todo dejaba una bomba
-- para quien lo conecte. El grep del repo web no la encontraba; el de la movil
-- si.
--
-- El problema real no era quien la llama sino que el `p_workspace_id` venia del
-- cliente y se usaba tal cual: con sesion de una empresa se leian las cifras de
-- otra. Ahora el argumento se ignora en favor de `my_workspace_id()` —se
-- conserva en la firma para no romper a quien ya la llama asi— y `p_user_id`
-- solo puede ser uno mismo, que es el caso del tecnico con `solo_asignadas`.
CREATE OR REPLACE FUNCTION public.get_overview_stats(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH yo AS (
    SELECT public.my_workspace_id() AS ws, auth.uid() AS uid
  ),
  base AS (
    SELECT o.id, o.prioridad, o.estado, o.fecha_termino, o.updated_at, o.asignados_ids
    FROM ordenes_trabajo o, yo
    WHERE yo.ws IS NOT NULL
      AND o.workspace_id = yo.ws
      AND (p_user_id IS NULL OR (p_user_id = yo.uid AND o.asignados_ids @> ARRAY[p_user_id]))
  ),
  now_vals AS (
    SELECT
      date_trunc('day', now())                        AS start_today,
      date_trunc('day', now()) + interval '1 day'     AS end_today,
      now() - interval '7 days'                       AS seven_days_ago
  )
  SELECT json_build_object(
    'altaPrioridad',
      (SELECT count(*) FROM base
       WHERE prioridad IN ('alta', 'urgente')
         AND estado NOT IN ('completado', 'cancelado')),
    'vencidas',
      (SELECT count(*) FROM base, now_vals
       WHERE fecha_termino < start_today
         AND estado NOT IN ('completado', 'cancelado')),
    'vencenHoy',
      (SELECT count(*) FROM base, now_vals
       WHERE fecha_termino >= start_today
         AND fecha_termino < end_today
         AND estado NOT IN ('completado', 'cancelado')),
    'completadasUltimos7Dias',
      (SELECT count(*) FROM base, now_vals
       WHERE estado = 'completado'
         AND updated_at >= seven_days_ago)
  ) FROM now_vals;
$$;

REVOKE ALL ON FUNCTION public.get_overview_stats(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_stats(uuid, uuid) TO authenticated;
