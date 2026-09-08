-- Planes de mantención: el calendario preventivo declarado por adelantado.
--
-- Por qué una tabla nueva y no `ordenes_trabajo.recurrencia`:
-- la recurrencia de OT es REACTIVA — el trigger de
-- 20260730160000_recurrence_advance_from_today.sql crea la siguiente OT recién
-- cuando se completa la anterior, así que en todo momento existe UNA sola OT
-- futura y su fecha depende de cuándo se cerró la previa. Sirve para trabajo
-- que se repite, pero no puede responder "qué mantenciones vienen el próximo
-- trimestre" ni sostener un aviso con un mes de anticipación: si la mantención
-- anterior se cierra tarde, la fecha se corre y el aviso llega tarde o nunca.
--
-- Un plan declara las fechas por adelantado (plan_ocurrencias), independientes
-- de cuándo se cerró la ocurrencia anterior. Eso es lo que permite mirar hacia
-- adelante: avisar con anticipación y, más adelante, emitir la orden de compra
-- de los insumos antes de que llegue la fecha.
--
-- La recurrencia de OT NO se toca: Electrilam la usa hoy y su semántica
-- reactiva es correcta para trabajo correctivo.

CREATE TABLE IF NOT EXISTS public.planes_mantencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion text,

  -- Un plan cubre un activo. Si el activo se borra, el plan pierde su objeto:
  -- no hay plan de mantención sin algo que mantener.
  activo_id uuid NOT NULL REFERENCES public.activos(id) ON DELETE CASCADE,

  -- Mismo vocabulario que ordenes_trabajo.recurrencia (types/ordenes.ts), sin
  -- 'ninguna': un plan sin recurrencia no es un plan. Reusarlo deja que la UI
  -- comparta el selector y que las fechas se calculen con la misma semántica.
  -- Subconjunto del vocabulario de ordenes_trabajo.recurrencia: sin 'ninguna'
  -- (un plan sin repetición no es un plan) y sin 'quincenal'/'personalizada',
  -- que son formas alternativas de decir lo que ya dicen las demás.
  recurrencia text NOT NULL CHECK (recurrencia IN (
    'diaria','semanal','mensual','mensual_fecha','mensual_dia','anual'
  )),
  recurrencia_config jsonb,

  -- Primer vencimiento: cuándo vence la primera mantención de la serie. Las
  -- siguientes se derivan de esta aplicando la recurrencia.
  fecha_inicio date NOT NULL,
  -- Opcional: hasta cuándo. NULL = indefinido.
  fecha_fin date,

  -- Hora a la que vence la mantención ("el 8 a las 09:00"). La heredan las OTs
  -- generadas. NULL = vence el día, sin hora, que es lo habitual en una
  -- mantención mensual.
  --
  -- Es `time` y no parte de un timestamptz a propósito: guardar la hora aparte
  -- deja las ocurrencias como fechas puras, así el cálculo de recurrencia no
  -- depende de zona horaria — importante en Chile, que cambia de horario dos
  -- veces al año y correría las fechas si se guardaran como instantes.
  hora_vencimiento time,

  -- Una ocurrencia tiene DOS fechas y conviene no confundirlas:
  --
  --   vencimiento  — cuándo debe estar hecha la mantención (fecha_programada).
  --   apertura     — cuándo la OT aparece para que alguien la trabaje.
  --
  -- `dias_apertura_previa` es la distancia entre ambas. Con 1, la OT se abre el
  -- día antes del vencimiento; el equipo no ve un mes de OTs abiertas que aún
  -- no tocan.
  dias_apertura_previa integer NOT NULL DEFAULT 1 CHECK (dias_apertura_previa >= 0),

  -- Cuántos días antes del vencimiento hay que AVISAR. Es independiente de la
  -- apertura: avisar es "prepárate, esto viene" (y es donde colgará la orden de
  -- compra de los insumos), abrir es "ya se puede ejecutar". El cliente que
  -- motivó esta tabla pide 30 días para alcanzar a comprar materiales, con la
  -- OT abriéndose recién cerca de la fecha.
  dias_aviso_previo integer NOT NULL DEFAULT 30 CHECK (dias_aviso_previo >= 0),

  -- Con cuánta antelación se materializan las ocurrencias futuras. El proceso
  -- que las rellena mantiene siempre esta ventana poblada, así que el plan
  -- nunca se queda sin fechas por delante.
  horizonte_dias integer NOT NULL DEFAULT 365
    CHECK (horizonte_dias > 0 AND horizonte_dias <= 1825),

  -- Plantilla de la OT: los valores que hereda cada orden generada por el plan.
  --
  -- `titulo_ot` vacío significa "usa el nombre del plan": lo normal es que una
  -- mantención trimestral de la bomba 3 se llame igual que su plan, y obligar a
  -- repetirlo sería ruido.
  titulo_ot text,
  descripcion_ot text,
  categoria_id uuid REFERENCES public.categorias_ot(id) ON DELETE SET NULL,
  ubicacion_id uuid REFERENCES public.ubicaciones(id) ON DELETE SET NULL,
  tipo_trabajo text,
  prioridad text,
  asignados_ids uuid[] NOT NULL DEFAULT '{}',
  procedimiento_ids uuid[] NOT NULL DEFAULT '{}',
  duracion_estimada_horas numeric CHECK (duracion_estimada_horas IS NULL OR duracion_estimada_horas > 0),

  -- Un plan pausado deja de generar ocurrencias pero conserva su historia.
  activo boolean NOT NULL DEFAULT true,

  creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT planes_fecha_fin_posterior
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS planes_mantencion_workspace_idx
  ON public.planes_mantencion (workspace_id) WHERE activo;
CREATE INDEX IF NOT EXISTS planes_mantencion_activo_idx
  ON public.planes_mantencion (activo_id);

-- Las fechas futuras, materializadas.
--
-- Existir como fila es lo que las hace consultables antes de que ocurran:
-- "qué viene en 30 días" es un SELECT por rango, no un cálculo que hay que
-- rehacer en cada cliente. También es donde se ancla el estado del aviso y,
-- más adelante, la orden de compra emitida para esa fecha.
CREATE TABLE IF NOT EXISTS public.plan_ocurrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.planes_mantencion(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Cuándo VENCE esta mantención.
  fecha_programada date NOT NULL,
  -- Cuándo se abre la OT (fecha_programada - dias_apertura_previa del plan).
  -- Se guarda materializada en vez de calcularse al vuelo: si el plan cambia su
  -- offset más adelante, las ocurrencias ya avisadas conservan la fecha con la
  -- que se comunicaron.
  fecha_apertura date NOT NULL,
  -- 1, 2, 3… dentro de la serie del plan. Ordena y da título ("Nº 3").
  iteracion integer NOT NULL CHECK (iteracion > 0),

  estado text NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada','avisada','generada','completada','omitida')),

  -- La OT que materializó esta ocurrencia. NULL mientras no se ha generado.
  -- ON DELETE SET NULL: borrar la OT devuelve la ocurrencia a pendiente en vez
  -- de borrar el registro de que esa fecha estaba planificada.
  orden_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,

  avisada_at timestamptz,
  generada_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Una sola ocurrencia por iteración: es lo que hace idempotente al proceso
  -- que las materializa, que puede correr más de una vez sobre el mismo plan.
  CONSTRAINT plan_ocurrencias_unica UNIQUE (plan_id, iteracion)
);

-- El índice que sirve la consulta central: "ocurrencias que caen dentro de la
-- ventana de aviso y todavía no se avisan".
CREATE INDEX IF NOT EXISTS plan_ocurrencias_pendientes_idx
  ON public.plan_ocurrencias (fecha_programada)
  WHERE estado IN ('programada','avisada');
CREATE INDEX IF NOT EXISTS plan_ocurrencias_plan_idx
  ON public.plan_ocurrencias (plan_id, fecha_programada);
CREATE INDEX IF NOT EXISTS plan_ocurrencias_workspace_idx
  ON public.plan_ocurrencias (workspace_id, fecha_programada);

-- updated_at ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.planes_mantencion_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS planes_mantencion_touch_trg ON public.planes_mantencion;
CREATE TRIGGER planes_mantencion_touch_trg
  BEFORE UPDATE ON public.planes_mantencion
  FOR EACH ROW EXECUTE FUNCTION public.planes_mantencion_touch();

-- RLS -------------------------------------------------------------------------
-- Mismo modelo que el resto del esquema: se ve lo del propio workspace; crear,
-- editar y borrar es de admins (lib/roles.js: owner/admin), porque un plan de
-- mantención es configuración del espacio, no trabajo del día a día.

ALTER TABLE public.planes_mantencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_ocurrencias  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planes_select ON public.planes_mantencion;
CREATE POLICY planes_select ON public.planes_mantencion
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT u.workspace_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

DROP POLICY IF EXISTS planes_admin_write ON public.planes_mantencion;
CREATE POLICY planes_admin_write ON public.planes_mantencion
  FOR ALL TO authenticated
  USING (workspace_id IN (
    SELECT u.workspace_id FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.rol IN ('owner','admin')
  ))
  WITH CHECK (workspace_id IN (
    SELECT u.workspace_id FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.rol IN ('owner','admin')
  ));

DROP POLICY IF EXISTS plan_ocurrencias_select ON public.plan_ocurrencias;
CREATE POLICY plan_ocurrencias_select ON public.plan_ocurrencias
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT u.workspace_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

DROP POLICY IF EXISTS plan_ocurrencias_admin_write ON public.plan_ocurrencias;
CREATE POLICY plan_ocurrencias_admin_write ON public.plan_ocurrencias
  FOR ALL TO authenticated
  USING (workspace_id IN (
    SELECT u.workspace_id FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.rol IN ('owner','admin')
  ))
  WITH CHECK (workspace_id IN (
    SELECT u.workspace_id FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.rol IN ('owner','admin')
  ));

-- Materializar ocurrencias -----------------------------------------------------

-- Avanza una fecha según la recurrencia del plan. Espeja la semántica de
-- calcProximaEjecucion() en lib/ordenes-api.ts para que un plan mensual y una
-- OT mensual caigan el mismo día.
CREATE OR REPLACE FUNCTION public.plan_avanzar_fecha(
  p_desde date,
  p_recurrencia text,
  p_config jsonb
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_interval integer := GREATEST(COALESCE((p_config->>'interval')::integer, 1), 1);
BEGIN
  RETURN CASE p_recurrencia
    WHEN 'diaria'        THEN p_desde + (v_interval || ' days')::interval
    WHEN 'semanal'       THEN p_desde + (v_interval || ' weeks')::interval
    WHEN 'mensual'       THEN p_desde + (v_interval || ' months')::interval
    WHEN 'mensual_fecha' THEN p_desde + (v_interval || ' months')::interval
    -- mensual_dia ("el 2º Martes") avanza por ahora como mensual_fecha: el
    -- formulario ya guarda week_ordinal en recurrencia_config, pero traducirlo
    -- a la fecha real queda pendiente.
    WHEN 'mensual_dia'   THEN p_desde + (v_interval || ' months')::interval
    WHEN 'anual'         THEN p_desde + (v_interval || ' years')::interval
    ELSE NULL
  END::date;
END;
$function$;

-- Rellena las ocurrencias de un plan hasta p_horizonte_dias hacia adelante.
--
-- Idempotente por el UNIQUE (plan_id, iteracion): correrla dos veces no
-- duplica nada, así que puede llamarse al crear el plan, al editarlo y desde
-- un cron sin coordinación.
-- p_horizonte_dias NULL usa el horizonte configurado en el plan; pasarlo
-- explícito sirve para materializar más allá (una vista de calendario que mira
-- un año adelante en un plan con horizonte de 4 semanas).
CREATE OR REPLACE FUNCTION public.plan_materializar_ocurrencias(
  p_plan_id uuid,
  p_horizonte_dias integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan      public.planes_mantencion;
  v_fecha     date;
  v_iter      integer;
  v_limite    date;
  v_creadas   integer := 0;
  v_guarda    integer := 0;
BEGIN
  SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = p_plan_id;
  IF v_plan.id IS NULL OR NOT v_plan.activo THEN
    RETURN 0;
  END IF;

  v_limite := CURRENT_DATE + make_interval(
    days => GREATEST(COALESCE(p_horizonte_dias, v_plan.horizonte_dias), 1)
  );
  IF v_plan.fecha_fin IS NOT NULL AND v_plan.fecha_fin < v_limite THEN
    v_limite := v_plan.fecha_fin;
  END IF;

  -- Retomar desde la última ocurrencia ya materializada, si la hay.
  SELECT fecha_programada, iteracion INTO v_fecha, v_iter
  FROM public.plan_ocurrencias
  WHERE plan_id = p_plan_id
  ORDER BY iteracion DESC
  LIMIT 1;

  IF v_fecha IS NULL THEN
    v_fecha := v_plan.fecha_inicio;
    v_iter  := 1;
  ELSE
    v_fecha := public.plan_avanzar_fecha(v_fecha, v_plan.recurrencia, v_plan.recurrencia_config);
    v_iter  := v_iter + 1;
  END IF;

  -- La guarda corta recurrencias mal configuradas (un interval que no avanza
  -- daría un bucle infinito) en vez de colgar la transacción.
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
$function$;

GRANT EXECUTE ON FUNCTION public.plan_materializar_ocurrencias(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_avanzar_fecha(date, text, jsonb) TO authenticated;
