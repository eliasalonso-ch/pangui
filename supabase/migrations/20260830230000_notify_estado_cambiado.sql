-- Notify on OT state transitions that are NOT completion.
--
-- The problem: changing an OT from pendiente -> en_curso -> en_espera notified
-- nobody. Two independent failures stacked:
--
--   1. trigger_notify_completion only fires on estado = 'completado'. Every
--      other transition fell through silently.
--   2. The web client called notifyOTEstadoCambiado() -> /api/notificar, whose
--      recipient lookup filters on rol IN ('tecnico','jefe'). Those roles do
--      not exist -- the taxonomy is owner/admin/member/requester -- so the
--      route matched 0 users and returned {ok:true, enviados:0}. Mobile never
--      called it at all.
--
-- Hence exactly 1 'estado_cambiado' row in the whole database, against 238
-- actividad_ot rows recording real state changes.
--
-- The fix triggers off actividad_ot, not ordenes_trabajo, deliberately:
--   * Both apps ALREADY write an actividad_ot row (tipo='estado_cambiado',
--     comentario=<label>) on every transition -- web at ordenes-api.ts,
--     mobile at features/work-orders/api.ts. One trigger covers both clients.
--   * That row carries usuario_id (the actor), so we can exclude them from
--     recipients without depending on auth.uid(), which is not reliably
--     populated for every write path. This is the same approach
--     trigger_notify_comment already uses.
--
-- Completion is deliberately NOT handled here: trigger_notify_completion still
-- owns 'completado' and emits its own notification. Emitting from both would
-- double-notify every closure.

CREATE OR REPLACE FUNCTION public.trigger_notify_estado_cambiado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  orden_row record;
  v_label   text;
BEGIN
  IF NEW.tipo <> 'estado_cambiado' THEN
    RETURN NEW;
  END IF;

  SELECT id, titulo, estado, creado_por, asignados_ids
  INTO orden_row
  FROM public.ordenes_trabajo
  WHERE id = NEW.orden_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Completion is trigger_notify_completion's job; staying out avoids doubles.
  IF orden_row.estado = 'completado' THEN
    RETURN NEW;
  END IF;

  -- Both clients write the human label ("En curso", "En espera") into
  -- comentario. Fall back to the raw estado if a caller omitted it.
  v_label := COALESCE(NULLIF(TRIM(NEW.comentario), ''), orden_row.estado);

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
  SELECT DISTINCT recipient.uid,
    'OT pasó a ' || v_label,
    orden_row.titulo,
    'estado_cambiado',
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
$function$;

DROP TRIGGER IF EXISTS on_orden_estado_cambiado ON public.actividad_ot;
CREATE TRIGGER on_orden_estado_cambiado
  AFTER INSERT ON public.actividad_ot
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notify_estado_cambiado();
