-- A work order can retain creator/assignee UUIDs after the corresponding
-- usuarios row is removed. A comment must not fail just because one of those
-- stale recipients cannot receive a notification.
CREATE OR REPLACE FUNCTION public.trigger_notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orden_row record;
BEGIN
  IF NEW.tipo <> 'comentario' THEN
    RETURN NEW;
  END IF;

  SELECT id, creado_por, asignados_ids
  INTO orden_row
  FROM public.ordenes_trabajo
  WHERE id = NEW.orden_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
  SELECT DISTINCT recipient.uid,
    'Nuevo comentario en orden',
    NEW.comentario,
    'comentario',
    '/orden/' || orden_row.id::text
  FROM (
    SELECT orden_row.creado_por AS uid
    UNION ALL
    SELECT unnest(COALESCE(orden_row.asignados_ids, '{}'::uuid[]))
  ) AS recipient
  INNER JOIN public.usuarios AS usuario ON usuario.id = recipient.uid
  WHERE recipient.uid IS NOT NULL
    AND recipient.uid <> NEW.usuario_id;

  RETURN NEW;
END;
$$;

