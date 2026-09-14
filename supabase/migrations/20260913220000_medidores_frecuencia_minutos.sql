-- Frecuencia de lectura en MINUTOS.
--
-- `frecuencia_dias` era integer de días, así que la ronda más corta que se podía
-- expresar era "cada 1 día". En terreno hay medidores que se leen por turno
-- —cada 8 o 12 horas— y eso no entraba: 0.33 días trunca a 0 y además viola el
-- CHECK de positividad.
--
-- Minutos y no horas como unidad base: una ronda "cada 30 minutos" es plausible
-- en un proceso crítico, y una vez que se migra la columna conviene que el piso
-- quede bien abajo para no repetir esta migración. Sigue siendo un integer, así
-- que la comparación "¿está vencida?" es la misma resta de siempre.
--
-- `frecuencia_dias` SE MANTIENE y se sincroniza por trigger. Motivo: la app web
-- y la móvil se despliegan por separado, así que durante la ventana entre un
-- deploy y el otro las dos versiones tienen que leer y escribir la misma
-- configuración sin pisarse. La columna vieja se elimina en una migración
-- posterior, cuando las dos apps estén arriba con la nueva.

ALTER TABLE public.medidores
  ADD COLUMN IF NOT EXISTS frecuencia_minutos integer;

-- Backfill: lo ya configurado en días pasa a minutos.
UPDATE public.medidores
   SET frecuencia_minutos = frecuencia_dias * 1440
 WHERE frecuencia_dias IS NOT NULL
   AND frecuencia_minutos IS NULL;

ALTER TABLE public.medidores
  DROP CONSTRAINT IF EXISTS medidores_frecuencia_minutos_positiva;

ALTER TABLE public.medidores
  ADD CONSTRAINT medidores_frecuencia_minutos_positiva
  CHECK (frecuencia_minutos IS NULL OR frecuencia_minutos > 0);

COMMENT ON COLUMN public.medidores.frecuencia_minutos IS
  'Cada cuantos minutos corresponde tomar la lectura. Solo para tipo=manual; NULL = sin ronda.';

COMMENT ON COLUMN public.medidores.frecuencia_dias IS
  'DEPRECADA: usar frecuencia_minutos. Se mantiene sincronizada por trigger mientras conviven las dos versiones de la app. Redondea hacia arriba, asi que una ronda sub-diaria se ve como 1 dia.';

/*
 * Espejo entre las dos columnas.
 *
 * Escribe la app vieja (días) o la nueva (minutos) y la otra columna queda
 * coherente sin que ninguna sepa de la otra. El redondeo hacia arriba en el
 * sentido minutos→días es deliberado: una ronda de 8 horas vista por la app
 * vieja como "cada 1 día" atrasa el vencimiento, que es preferible a "cada 0
 * días" (viola el CHECK) o a marcarlo vencido todo el tiempo.
 */
CREATE OR REPLACE FUNCTION public.fn_medidor_sincronizar_frecuencia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.frecuencia_minutos IS NOT NULL THEN
      NEW.frecuencia_dias := GREATEST(1, CEIL(NEW.frecuencia_minutos / 1440.0)::integer);
    ELSIF NEW.frecuencia_dias IS NOT NULL THEN
      NEW.frecuencia_minutos := NEW.frecuencia_dias * 1440;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: manda la columna que efectivamente cambió.
  IF NEW.frecuencia_minutos IS DISTINCT FROM OLD.frecuencia_minutos THEN
    NEW.frecuencia_dias := CASE
      WHEN NEW.frecuencia_minutos IS NULL THEN NULL
      ELSE GREATEST(1, CEIL(NEW.frecuencia_minutos / 1440.0)::integer)
    END;
  ELSIF NEW.frecuencia_dias IS DISTINCT FROM OLD.frecuencia_dias THEN
    NEW.frecuencia_minutos := CASE
      WHEN NEW.frecuencia_dias IS NULL THEN NULL
      ELSE NEW.frecuencia_dias * 1440
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medidor_sincronizar_frecuencia ON public.medidores;

CREATE TRIGGER trg_medidor_sincronizar_frecuencia
  BEFORE INSERT OR UPDATE OF frecuencia_dias, frecuencia_minutos ON public.medidores
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_medidor_sincronizar_frecuencia();
