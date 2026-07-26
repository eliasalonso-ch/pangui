-- =============================================================================
-- Extend procedimiento_pasos.tipo CHECK constraint to include the ISO/MaintainX
-- step types added in 20260521_procedimientos_iso_overhaul.sql. The original
-- 20260521 migration added the *columns* and the TS enum, but the pre-existing
-- DB CHECK from the procedimientos system rollout only listed the original 11
-- values, blocking inserts of medidor / fecha / hora / fecha_hora / archivo /
-- escaneo / falla_iso14224 / sub_procedimiento / seccion / puntuacion.
--
-- Idempotent: drops the old constraint by name, recreates with the full list.
-- =============================================================================

ALTER TABLE public.procedimiento_pasos
  DROP CONSTRAINT IF EXISTS procedimiento_pasos_tipo_check;

ALTER TABLE public.procedimiento_pasos
  ADD CONSTRAINT procedimiento_pasos_tipo_check
  CHECK (tipo IN (
    'instruccion', 'advertencia', 'texto', 'numero', 'monto',
    'si_no_na', 'opcion_multiple', 'lista_verificacion', 'inspeccion',
    'imagen', 'firma',
    'medidor', 'archivo', 'fecha', 'hora', 'fecha_hora',
    'escaneo', 'falla_iso14224', 'sub_procedimiento', 'seccion', 'puntuacion'
  ));

NOTIFY pgrst, 'reload schema';
