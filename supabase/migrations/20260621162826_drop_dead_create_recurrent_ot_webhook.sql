-- Remove the superseded webhook trigger that POSTs to the create-recurrent-ot
-- edge function on every OT update. Recurrence is fully handled in-DB by
-- trg_generar_siguiente_ot_recurrente (generar_siguiente_ot_recurrente).
-- The webhook always returned 401 and did nothing; this eliminates that noise.
DROP TRIGGER IF EXISTS "on-ot-completed-create-recurrent" ON public.ordenes_trabajo;;
