-- Trim the supabase_realtime publication to the tables that actually have
-- subscribers.
--
-- WHY: wal2json WAL decoding for this publication was measured at 89.6% of ALL
-- database CPU time (4,462,160 calls / 30,192s cumulative in pg_stat_statements,
-- 2026-08-14). Every write to a published table is decoded and serialized to
-- JSON whether or not any client listens. The publication carried 9 tables while
-- application code subscribes to only `ordenes_trabajo` and `notifications`.
--
-- Dropped here are the 5 with no subscriber in either repo (verified by grep for
-- `.channel(` / `postgres_changes` across pangui and pangui-native-stable, app
-- code and tests):
--   materiales_usados, orden_partes, partes, paso_respuestas,
--   procedimiento_ejecuciones
--
-- DELIBERATELY KEPT (do not drop without updating tests first):
--   ordenes_trabajo  — OrdenesBandeja.tsx (web), orden detail (mobile)
--   notifications    — NotificationMenu.tsx + AppSidebar.tsx (web),
--                      overview/index.tsx (mobile)
--   actividad_ot     — asserted by pangui-native-stable/tests/realtime.test.ts
--                      (:253, :286); CI runs against a live workspace
--   ot_procedimientos — asserted by pangui-native-stable/tests/procedimientos.test.ts
--                      (section 6); needs REPLICA IDENTITY FULL + publication
--
-- REVERSIBLE: ALTER PUBLICATION supabase_realtime ADD TABLE <name>;

ALTER PUBLICATION supabase_realtime DROP TABLE public.materiales_usados;
ALTER PUBLICATION supabase_realtime DROP TABLE public.orden_partes;
ALTER PUBLICATION supabase_realtime DROP TABLE public.partes;
ALTER PUBLICATION supabase_realtime DROP TABLE public.paso_respuestas;
ALTER PUBLICATION supabase_realtime DROP TABLE public.procedimiento_ejecuciones;
