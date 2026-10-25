-- Paso de procedimiento "Estado del activo" + switch "Foto obligatoria".
--
-- EL PROBLEMA QUE CIERRA:
-- Cambiar el estado del activo al hacer una mantención dependía de que el
-- técnico se acordara de tocar la píldora de la OT. El trigger de OT
-- (20261016010000) solo cubre las preventivas; una reactiva que encuentra el
-- equipo detenido, o una preventiva que lo deja fuera de servicio, no quedaban
-- registradas y la disponibilidad salía inflada.
--
-- POR QUÉ UN TRIGGER Y NO CÓDIGO EN LOS CLIENTES:
-- Lo mismo que con las lecturas de medidor (20260913140000): web y móvil
-- escriben paso_respuestas, y el móvil encola offline. En la base pasa una sola
-- vez, para todos los caminos, incluido el replay de la cola.
--
-- CON LAS PREVENTIVAS NO HAY CHOQUE: el período se abre SIN orden_id, o sea
-- como un cambio manual. Al cerrar la OT, fn_activo_estado_por_ot solo devuelve
-- a operativo si el período abierto sigue siendo el de la OT, así que un
-- "fuera de servicio" marcado en el paso sobrevive al cierre.

-- 1. El tipo nuevo.
ALTER TABLE public.procedimiento_pasos
  DROP CONSTRAINT IF EXISTS procedimiento_pasos_tipo_check;

ALTER TABLE public.procedimiento_pasos
  ADD CONSTRAINT procedimiento_pasos_tipo_check
  CHECK (tipo IN (
    'instruccion', 'advertencia', 'texto', 'numero', 'monto',
    'si_no_na', 'opcion_multiple', 'lista_verificacion', 'inspeccion',
    'imagen', 'firma',
    'medidor', 'archivo', 'fecha', 'hora', 'fecha_hora',
    'escaneo', 'falla_iso14224', 'sub_procedimiento', 'seccion', 'puntuacion',
    'estado_activo'
  ));

-- 2. Foto obligatoria en los pasos que adjuntan fotos a la respuesta
-- (inspección, sí/no/N/A, medidor). La valida el cliente al completar, igual
-- que `requerido`.
ALTER TABLE public.procedimiento_pasos
  ADD COLUMN IF NOT EXISTS foto_requerida boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.procedimiento_pasos.foto_requerida IS
  'Inspección / sí-no-NA / medidor: la respuesta necesita al menos una foto (en inspección, cada ítem).';

-- 3. La respuesta del paso aplica el cambio de estado.
-- valor_texto = estado elegido; valor_json.motivo_id = motivo (fuera de servicio).
CREATE OR REPLACE FUNCTION public.fn_paso_respuesta_estado_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_ot record;
BEGIN
  IF NEW.valor_texto IS NULL THEN
    RETURN NEW;
  END IF;
  -- Guardar una nota sobre el mismo paso no vuelve a cambiar nada.
  IF TG_OP = 'UPDATE' AND OLD.valor_texto IS NOT DISTINCT FROM NEW.valor_texto THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procedimiento_pasos
     WHERE id = NEW.paso_id AND tipo = 'estado_activo'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT o.activo_id, o.workspace_id, o.numero, p.nombre AS proc_nombre
    INTO v_ot
    FROM public.procedimiento_ejecuciones e
    JOIN public.ordenes_trabajo o ON o.id = e.orden_id
    JOIN public.procedimientos p ON p.id = e.procedimiento_id
   WHERE e.id = NEW.ejecucion_id;

  -- OT sin activo: el cliente ya lo muestra y lo da por respondido.
  IF v_ot.activo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Devuelve texto en vez de lanzar ("ya estaba X", motivo faltante): una
  -- excepción acá rompería el guardado de la respuesta y, offline, dejaría la
  -- cola reintentando para siempre. El cliente valida antes de mandar.
  -- ponytail: inicio = now() (llegada al servidor), no respondido_at; una
  -- respuesta sincronizada horas después corre la parada. Pasar respondido_at
  -- si importa.
  -- El bloque atrapa el cast de un motivo_id mal formado por lo mismo.
  BEGIN
    PERFORM public.fn_automatizacion_cambiar_estado(
      v_ot.activo_id,
      v_ot.workspace_id,
      NEW.valor_texto,
      CASE NEW.valor_texto
        WHEN 'operativo' THEN NULL
        WHEN 'mantencion' THEN 'planeado'
        ELSE 'sin_planear'
      END,
      CASE WHEN NEW.valor_texto = 'operativo' THEN NULL
           ELSE NULLIF(NEW.valor_json->>'motivo_id', '')::uuid END,
      format('Desde el procedimiento "%s" (OT #%s).', v_ot.proc_nombre, v_ot.numero),
      NEW.respondido_por
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_paso_respuesta_estado_activo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_paso_respuesta_estado_activo ON public.paso_respuestas;
CREATE TRIGGER trg_paso_respuesta_estado_activo
  AFTER INSERT OR UPDATE OF valor_texto ON public.paso_respuestas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_paso_respuesta_estado_activo();

NOTIFY pgrst, 'reload schema';
