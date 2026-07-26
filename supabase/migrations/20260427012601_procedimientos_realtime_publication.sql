
ALTER TABLE public.procedimiento_ejecuciones REPLICA IDENTITY FULL;
ALTER TABLE public.paso_respuestas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.procedimiento_ejecuciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paso_respuestas;
;
