-- Un activo no puede estar en dos estados al mismo tiempo.
--
-- `activo_estado_periodos` es un registro de INTERVALOS: cada fila dice desde
-- cuándo y hasta cuándo el activo estuvo en un estado, y `fin IS NULL` es el
-- estado vigente. El índice único que ya existía impide dos períodos ABIERTOS a
-- la vez, pero no impedía que un período abierto se superpusiera con otro ya
-- cerrado más adelante en el tiempo.
--
-- Eso pasó de verdad: un activo quedó con un período "operativo" abierto desde
-- su alta que atravesaba, meses después, su propia parada por falla. El activo
-- figuraba operativo y fuera de servicio en el mismo instante, y las horas de
-- esa parada se contaban dos veces en la disponibilidad.
--
-- La restricción de exclusión lo vuelve imposible: para un mismo `activo_id`,
-- dos rangos [inicio, fin) no pueden solaparse. Los períodos abiertos se tratan
-- como si terminaran en el infinito, que es exactamente lo que significan.
--
-- Lo que esta restricción NO puede expresar son los HUECOS —que entre el fin de
-- un período y el inicio del siguiente no falte tiempo—, porque un hueco no es
-- un conflicto entre dos filas sino la ausencia de una tercera. Eso se cuida al
-- escribir: `cambiar_estado_activo` cierra el período abierto con el mismo
-- timestamp con que abre el nuevo, así que nunca deja espacio.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.activo_estado_periodos
  DROP CONSTRAINT IF EXISTS activo_estado_periodos_sin_solape;

ALTER TABLE public.activo_estado_periodos
  ADD CONSTRAINT activo_estado_periodos_sin_solape
  EXCLUDE USING gist (
    activo_id WITH =,
    tstzrange(inicio, COALESCE(fin, 'infinity'::timestamptz), '[)') WITH &&
  );

COMMENT ON CONSTRAINT activo_estado_periodos_sin_solape ON public.activo_estado_periodos IS
  'Impide que un activo tenga dos períodos de estado superpuestos: estar en dos '
  'estados a la vez duplicaría las horas al calcular disponibilidad.';
