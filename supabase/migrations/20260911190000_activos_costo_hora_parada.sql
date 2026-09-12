-- Cuánto cuesta una hora de este activo detenido.
--
-- Sin este número la analítica puede decir "47 horas de parada imprevista" pero
-- no "eso costó $14 millones", y esa segunda frase es la única que sirve para
-- pedir presupuesto. El costo de la OT —repuestos y mano de obra— es la parte
-- chica: lo caro es la producción que no se hizo mientras la máquina estuvo
-- parada. En los datos de este workspace una correctiva cuesta en promedio
-- $555.000 contra $313.750 de una preventiva, y eso todavía no cuenta la línea
-- detenida.
--
-- Es un dato que pone el cliente, no algo que se pueda derivar: depende de la
-- línea, del turno y del precio del producto. Queda NULL cuando no se sabe, y
-- la UI muestra las horas sin convertir a pesos en vez de inventar un número.
--
-- numeric y no integer: hay activos cuyo costo por hora no es un entero de
-- pesos (equipos compartidos, prorrateos por turno).

ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS costo_hora_parada numeric;

ALTER TABLE public.activos
  DROP CONSTRAINT IF EXISTS activos_costo_hora_parada_no_negativo;

ALTER TABLE public.activos
  ADD CONSTRAINT activos_costo_hora_parada_no_negativo
  CHECK (costo_hora_parada IS NULL OR costo_hora_parada >= 0);

COMMENT ON COLUMN public.activos.costo_hora_parada IS
  'Costo de una hora de este activo detenido (producción perdida), en la moneda '
  'del workspace. NULL = no informado; la analítica muestra horas sin convertir.';
