-- Una OT creada por una automatización SÍ notifica a sus asignados, aunque el
-- asignado sea quien creó la automatización.
--
-- El guard `uid IS DISTINCT FROM actor` existe para no avisarle a alguien de algo
-- que acaba de hacer él mismo: si creo una OT y me asigno, ya lo sé. Es correcto
-- para una persona.
--
-- No lo es para una automatización. El motor pone en `creado_por` a quien creó la
-- REGLA, que es lo más cercano a un responsable que se puede afirmar — pero esa
-- persona no creó esta OT: la creó el motor, posiblemente de madrugada y sin que
-- nadie estuviera mirando. Ese es justamente el momento en que el aviso importa,
-- y el guard lo estaba tragando.
CREATE OR REPLACE FUNCTION public.trigger_notify_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  new_ids  uuid[];
  prev_ids uuid[];
  added    uuid[];
  actor    uuid;
  uid      uuid;
  es_auto  boolean;
BEGIN
  new_ids  := COALESCE(NEW.asignados_ids, '{}');
  prev_ids := CASE WHEN TG_OP = 'INSERT' THEN '{}'::uuid[] ELSE COALESCE(OLD.asignados_ids, '{}') END;
  actor    := NEW.creado_por;
  -- Nadie "hizo" esta asignación a mano: la hizo la regla.
  es_auto  := NEW.automatizacion_id IS NOT NULL;

  SELECT ARRAY(SELECT UNNEST(new_ids) EXCEPT SELECT UNNEST(prev_ids)) INTO added;
  IF array_length(added, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH uid IN ARRAY added LOOP
    IF (es_auto OR uid IS DISTINCT FROM actor)
       AND EXISTS (SELECT 1 FROM public.usuarios WHERE id = uid) THEN
      INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
      VALUES (
        uid,
        CASE WHEN es_auto THEN 'Orden creada por automatización' ELSE 'Nueva orden asignada' END,
        CASE WHEN es_auto
             THEN 'Una automatización creó y te asignó la orden: ' || NEW.titulo
             ELSE 'Te han asignado a la orden: ' || NEW.titulo END,
        'asignado',
        '/orden/' || NEW.id::text
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
