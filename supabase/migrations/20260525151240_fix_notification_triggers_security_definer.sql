-- Root cause: dropping the "Service role insert notifications" RLS bypass broke
-- OT creation/completion because two trigger functions (running as the invoking
-- authenticated user) try to INSERT into public.notifications.
--
-- Fix: promote both to SECURITY DEFINER so they run with elevated privileges
-- (the canonical pattern for system writes triggered by user action), and pin
-- search_path while we're here.

CREATE OR REPLACE FUNCTION public.trigger_notify_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_ids  uuid[];
  prev_ids uuid[];
  added    uuid[];
  actor    uuid;
  uid      uuid;
BEGIN
  new_ids  := COALESCE(NEW.asignados_ids, '{}');
  prev_ids := CASE WHEN TG_OP = 'INSERT' THEN '{}'::uuid[] ELSE COALESCE(OLD.asignados_ids, '{}') END;
  actor    := NEW.creado_por;

  SELECT ARRAY(SELECT UNNEST(new_ids) EXCEPT SELECT UNNEST(prev_ids)) INTO added;
  IF array_length(added, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH uid IN ARRAY added LOOP
    IF uid IS DISTINCT FROM actor AND EXISTS (SELECT 1 FROM public.usuarios WHERE id = uid) THEN
      INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
      VALUES (uid, 'Nueva orden asignada', 'Te han asignado a la orden: ' || NEW.titulo, 'asignado', '/orden/' || NEW.id::text);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_notify_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  recipients uuid[];
  recip      uuid;
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN
    SELECT ARRAY(
      SELECT DISTINCT sub.uid FROM (
        SELECT NEW.creado_por AS uid
        UNION ALL
        SELECT UNNEST(COALESCE(NEW.asignados_ids, '{}'))
      ) sub
      WHERE sub.uid IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.usuarios WHERE id = sub.uid)
    ) INTO recipients;

    FOREACH recip IN ARRAY recipients LOOP
      INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
      VALUES (recip, 'Orden completada', 'La orden "' || NEW.titulo || '" ha sido completada.', 'completado', '/orden/' || NEW.id::text);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;;
