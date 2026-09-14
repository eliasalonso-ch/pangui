-- Una lectura tomada dentro de un procedimiento ES una lectura del medidor.
--
-- EL BUG QUE CIERRA:
-- Un paso de tipo `medidor` guarda su numero en `paso_respuestas.valor_medido` y
-- ahi se queda. Nunca llegaba a `medidor_lecturas`, asi que:
--   1. no aparecia en el grafico del medidor (la serie tenia hoyos justo donde
--      el tecnico SI fue a terreno), y
--   2. no pasaba por `fn_medidor_lectura_critica`, o sea que una vibracion
--      critica anotada dentro de una ronda NO abria ninguna OT.
-- El (2) es el grave: el umbral existe para convertir una condicion anormal en
-- trabajo asignado, y por esta via se lo saltaba en silencio.
--
-- POR QUE UN TRIGGER Y NO CODIGO EN LOS CLIENTES:
-- Hay dos apps que escriben esta tabla (web y movil) y la movil ademas encola
-- las respuestas offline y las sincroniza despues. Poner el INSERT en el cliente
-- significaria duplicar la logica y que la lectura llegue tarde —o no llegue— en
-- el camino offline. En la base ocurre una sola vez, para todos los caminos,
-- incluido el replay de la cola.
--
-- POR QUE ESPEJO Y NO MOVER EL DATO:
-- `paso_respuestas` sigue siendo la respuesta del paso (con su nota, su foto, su
-- aprobacion y su revision); `medidor_lecturas` es la serie del instrumento. Son
-- dos preguntas distintas —"que contesto el tecnico en el paso 7" vs "como viene
-- la vibracion"— y cada una tiene sus consumidores. Se copia el numero, no se
-- muda.

-- Trazabilidad de ida y vuelta: de la lectura al paso que la origino, y el
-- candado del anti-duplicado de arriba.
--
-- ON DELETE CASCADE: si se borra la respuesta del paso (se desadjunta el
-- procedimiento, se borra la OT), la lectura que salio de ella deja de tener
-- respaldo. Las lecturas cargadas a mano o por API tienen esto en NULL y no las
-- toca nadie.
ALTER TABLE public.medidor_lecturas
  ADD COLUMN IF NOT EXISTS paso_respuesta_id uuid
  REFERENCES public.paso_respuestas(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.medidor_lecturas.paso_respuesta_id IS
  'Respuesta de paso que origino esta lectura. NULL = cargada a mano o por API.';

-- Unico parcial: una respuesta de paso produce como maximo UNA lectura. Es el
-- respaldo real del anti-duplicado —si dos replays de la cola offline entran a
-- la vez, el DELETE+INSERT de arriba podria correr en paralelo y esta
-- restriccion es la que impide el punto doble.
CREATE UNIQUE INDEX IF NOT EXISTS idx_medidor_lecturas_paso_respuesta
  ON public.medidor_lecturas (paso_respuesta_id)
  WHERE paso_respuesta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_paso_respuesta_a_lectura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_medidor_id uuid;
  v_ws         uuid;
BEGIN
  -- Solo los pasos atados a un medidor. Un paso `numero` suelto mide algo que
  -- no tiene serie historica y no le corresponde ensuciar ninguna.
  SELECT p.medidor_id INTO v_medidor_id
    FROM public.procedimiento_pasos p
   WHERE p.id = NEW.paso_id;

  IF v_medidor_id IS NULL OR NEW.valor_medido IS NULL THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo se re-registra si el numero cambio de verdad. Sin esto,
  -- guardar una nota o una foto sobre el mismo paso duplicaria la lectura.
  IF TG_OP = 'UPDATE'
     AND OLD.valor_medido IS NOT DISTINCT FROM NEW.valor_medido THEN
    RETURN NEW;
  END IF;

  -- El medidor manda el workspace: `paso_respuestas.workspace_id` es nullable y
  -- la RLS de `medidor_lecturas` exige uno correcto.
  SELECT m.workspace_id INTO v_ws
    FROM public.medidores m
   WHERE m.id = v_medidor_id;

  IF v_ws IS NULL THEN
    RETURN NEW;
  END IF;

  -- Anti-duplicado: la misma respuesta puede reescribirse (correccion del
  -- tecnico, replay de la cola offline que reintenta). Se borra la lectura que
  -- esta respuesta habia generado antes y se inserta la vigente, para que el
  -- grafico no muestre dos puntos donde hubo una sola medicion.
  DELETE FROM public.medidor_lecturas
   WHERE paso_respuesta_id = NEW.id;

  -- `respondido_at` y NO now(): es el instante en que el tecnico tomo la
  -- medicion. Una ronda que se sincroniza tres horas despues tiene que caer
  -- donde corresponde en el eje, igual que el buffer de un gateway.
  INSERT INTO public.medidor_lecturas (
    medidor_id, workspace_id, valor, ts, foto_url, creado_por, paso_respuesta_id
  ) VALUES (
    v_medidor_id,
    v_ws,
    NEW.valor_medido,
    COALESCE(NEW.respondido_at, now()),
    NEW.foto_url,
    NEW.respondido_por,
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paso_respuesta_a_lectura ON public.paso_respuestas;
CREATE TRIGGER trg_paso_respuesta_a_lectura
  AFTER INSERT OR UPDATE OF valor_medido ON public.paso_respuestas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_paso_respuesta_a_lectura();
