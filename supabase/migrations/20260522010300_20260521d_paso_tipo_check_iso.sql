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

NOTIFY pgrst, 'reload schema';;
