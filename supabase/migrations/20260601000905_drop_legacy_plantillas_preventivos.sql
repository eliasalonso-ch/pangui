-- Elimina el sistema viejo de plantillas de procedimiento y el esqueleto de
-- preventivos que colgaba de él. Todas estas tablas/columna estaban VACÍAS
-- (0 filas, 0 de 230 OTs usaban plantilla_id) y nada vivo dependía de ellas.
-- Se reconstruirá el motor de preventivos desde cero, cimentado sobre la tabla
-- `procedimientos` (el sistema bueno) y `activos`.
--
-- CASCADE arrastra las políticas RLS e índices de cada tabla.
-- DROP COLUMN plantilla_id arrastra su FK e índice idx_ot_plantilla_id.

DROP TABLE IF EXISTS pasos_plantilla CASCADE;
DROP TABLE IF EXISTS preventivos CASCADE;
DROP TABLE IF EXISTS plantillas_procedimiento CASCADE;

ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS plantilla_id;;
