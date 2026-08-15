-- Second (and final) trim of the supabase_realtime publication.
--
-- 20260814190000 dropped the 5 tables with no subscriber anywhere. These 2 were
-- held back only because mobile CI integration tests asserted realtime on them.
-- Those tests have now been removed (pangui-native-stable/tests/realtime.test.ts
-- and tests/procedimientos.test.ts), because they were guarding platform
-- behaviour that no production code path uses:
--
--   actividad_ot      — the OT activity/comment timeline. Both clients poll it;
--                       features/work-orders/hooks.ts carries the explicit
--                       comment "Activity feed — polling only, no realtime", and
--                       every mutation invalidates ["actividad", id], so a user's
--                       own comment appears from their own refetch. High write
--                       volume (every state change, pause, comment logs a row),
--                       so this is the larger of the two wins.
--   ot_procedimientos — OT↔procedure attachment. A setup action reflected by the
--                       mutation's own refetch; no second observer needs a live
--                       update. Low write volume.
--
-- After this migration the publication contains exactly the two tables with real
-- subscribers: ordenes_trabajo and notifications.
--
-- REPLICA IDENTITY FULL is intentionally left in place on both tables, so
-- re-enabling is a single statement if a live-updating timeline is ever built:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.actividad_ot;

ALTER PUBLICATION supabase_realtime DROP TABLE public.actividad_ot;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ot_procedimientos;
