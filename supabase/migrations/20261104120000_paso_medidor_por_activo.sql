-- Un procedimiento, muchos activos: el paso `medidor` lee el medidor del activo
-- de la OT, no siempre el mismo.
--
-- EL CASO: "Inspección Semanal de Generadores" (Electrilam) sirve a 18
-- generadores. Cada generador tiene su Horómetro, su Frecuencia, etc. Pero un
-- paso guarda UN `medidor_id`, así que todas las lecturas caían en la serie de
-- un solo generador. La alternativa —un procedimiento por generador, o 18 pasos
-- condicionales por lectura— es inmantenible (y el móvil no evalúa condiciones).
--
-- LA REGLA: el medidor del paso es el "molde". Si la OT tiene un activo distinto
-- al del molde, la lectura va al medidor de ESE activo con el mismo nombre
-- (sin distinguir mayúsculas ni espacios de borde). Si ese activo no tiene un
-- medidor con ese nombre, no se registra lectura: anotarla en la serie de otra
-- máquina es dato falso, y con umbral crítico abriría una OT sobre el activo
-- equivocado.
--
-- Sin cambios para lo que ya existía: OT sin activo, medidor sin activo, o el
-- mismo activo en ambos → se usa el medidor del paso tal cual.
--
-- ponytail: el vínculo es por nombre. Renombrar el medidor de un solo generador
-- lo desengancha en silencio. Si eso empieza a doler, el upgrade es una columna
-- `clave` en medidores y matchear por ella.

CREATE OR REPLACE FUNCTION public.fn_paso_respuesta_a_lectura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_medidor_id     uuid;
  v_ws             uuid;
  v_activo_medidor uuid;
  v_nombre         text;
  v_activo_ot      uuid;
BEGIN
  SELECT p.medidor_id INTO v_medidor_id
    FROM public.procedimiento_pasos p
   WHERE p.id = NEW.paso_id;

  IF v_medidor_id IS NULL OR NEW.valor_medido IS NULL THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo se re-registra si el numero cambio de verdad. Sin esto,
  -- guardar una nota o una foto sobre el mismo paso duplicaria la lectura.
  IF TG_OP = 'UPDATE'
     AND OLD.valor_medido IS NOT DISTINCT FROM NEW.valor_medido THEN
    RETURN NEW;
  END IF;

  SELECT m.workspace_id, m.activo_id, m.nombre
    INTO v_ws, v_activo_medidor, v_nombre
    FROM public.medidores m
   WHERE m.id = v_medidor_id;

  IF v_ws IS NULL THEN
    RETURN NEW;
  END IF;

  -- Anti-duplicado: la misma respuesta puede reescribirse (correccion del
  -- tecnico, replay de la cola offline). Se borra la lectura que esta respuesta
  -- habia generado antes; abajo se inserta la vigente, si corresponde.
  DELETE FROM public.medidor_lecturas
   WHERE paso_respuesta_id = NEW.id;

  SELECT o.activo_id INTO v_activo_ot
    FROM public.procedimiento_ejecuciones e
    JOIN public.ordenes_trabajo o ON o.id = e.orden_id
   WHERE e.id = NEW.ejecucion_id;

  IF v_activo_ot IS NOT NULL
     AND v_activo_medidor IS NOT NULL
     AND v_activo_ot <> v_activo_medidor THEN
    SELECT m.id INTO v_medidor_id
      FROM public.medidores m
     WHERE m.activo_id = v_activo_ot
       AND m.activo
       AND lower(btrim(m.nombre)) = lower(btrim(v_nombre))
     ORDER BY m.created_at
     LIMIT 1;

    IF v_medidor_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- `respondido_at` y NO now(): es el instante en que el tecnico tomo la
  -- medicion, aunque la ronda se sincronice horas despues.
  INSERT INTO public.medidor_lecturas (
    medidor_id, workspace_id, valor, ts, foto_url, creado_por, paso_respuesta_id
  ) VALUES (
    v_medidor_id,
    v_ws,
    NEW.valor_medido,
    COALESCE(NEW.respondido_at, now()),
    NEW.foto_url,
    NEW.respondido_por,
    NEW.id
  );

  RETURN NEW;
END;
$$;
