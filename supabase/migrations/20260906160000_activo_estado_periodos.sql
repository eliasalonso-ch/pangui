-- Historial de estado de activos con tiempo de inactividad real.
--
-- El problema que resuelve: `lib/activo-metrics.ts` calcula la disponibilidad a
-- partir del tiempo de reparación de las OTs, y su propio comentario admite la
-- limitación —"downtime counts active repair time only, because that is all the
-- schema records"—. Esa es la disponibilidad *inherente*: no cuenta la espera
-- de repuestos ni de técnico, así que sale optimista. Para el cliente el activo
-- estuvo parado todo ese rato, no solo mientras alguien tenía la llave puesta.
--
-- `actividad_activo` ya registra cada cambio con {de, a} y timestamp, pero como
-- log de eventos: para saber cuánto duró un estado hay que mirar el evento
-- siguiente, no distingue parada planificada de imprevista, y no se puede
-- corregir hacia atrás ("se cayó ayer a las 3, lo cargo ahora").
--
-- Este es entonces un registro de INTERVALOS, no de eventos: cada fila es un
-- período con inicio y fin. `fin IS NULL` = el estado vigente. Un intervalo
-- cerrado tiene su duración explícita y no depende de la fila siguiente.
--
-- No reemplaza a `actividad_activo`: ese sigue siendo el timeline humano del
-- activo. Esta tabla es la serie temporal de la que salen los números.

CREATE TABLE IF NOT EXISTS public.activo_estado_periodos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activo_id    uuid NOT NULL REFERENCES public.activos(id) ON DELETE CASCADE,
  -- Denormalizado a propósito: las consultas del panel filtran por workspace y
  -- rango de fechas, y sin esto cada una tendría que pasar por `activos`.
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  estado       text NOT NULL CHECK (estado IN ('operativo','fuera_servicio','mantencion','baja')),

  -- Solo para los estados que son parada. `operativo` lleva NULL: exigir un
  -- tipo de inactividad cuando el activo está funcionando no significa nada.
  tipo_inactividad text CHECK (tipo_inactividad IN ('planeado','sin_planear')),

  inicio       timestamptz NOT NULL,
  -- NULL = período abierto, es el estado actual del activo.
  fin          timestamptz,

  notas        text,
  -- Quién lo registró. SET NULL para no romper el historial si se va la persona.
  creado_por   uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activo_estado_periodos_rango CHECK (fin IS NULL OR fin > inicio),
  -- `operativo` no es inactividad; el resto sí necesita clasificarse para que
  -- los totales de "planificada" vs "imprevista" signifiquen algo.
  CONSTRAINT activo_estado_periodos_tipo CHECK (
    (estado = 'operativo' AND tipo_inactividad IS NULL)
    OR (estado <> 'operativo' AND tipo_inactividad IS NOT NULL)
  )
);

-- Un activo no puede tener dos períodos abiertos a la vez: sería estar en dos
-- estados al mismo tiempo y duplicaría el conteo de horas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activo_estado_periodos_abierto
  ON public.activo_estado_periodos (activo_id)
  WHERE fin IS NULL;

-- El acceso típico: los períodos de un activo, del más reciente al más viejo.
CREATE INDEX IF NOT EXISTS idx_activo_estado_periodos_activo
  ON public.activo_estado_periodos (activo_id, inicio DESC);

-- Para los reportes por workspace y ventana de tiempo.
CREATE INDEX IF NOT EXISTS idx_activo_estado_periodos_ws
  ON public.activo_estado_periodos (workspace_id, inicio DESC);

ALTER TABLE public.activo_estado_periodos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activo_estado_periodos_select" ON public.activo_estado_periodos;
CREATE POLICY "activo_estado_periodos_select"
  ON public.activo_estado_periodos FOR SELECT
  USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "activo_estado_periodos_insert" ON public.activo_estado_periodos;
CREATE POLICY "activo_estado_periodos_insert"
  ON public.activo_estado_periodos FOR INSERT
  WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "activo_estado_periodos_update" ON public.activo_estado_periodos;
CREATE POLICY "activo_estado_periodos_update"
  ON public.activo_estado_periodos FOR UPDATE
  USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS "activo_estado_periodos_delete" ON public.activo_estado_periodos;
CREATE POLICY "activo_estado_periodos_delete"
  ON public.activo_estado_periodos FOR DELETE
  USING (workspace_id = my_workspace_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- Cambiar el estado de un activo.
--
-- Cierra el período abierto y abre el nuevo, en una sola transacción: si se
-- hiciera en dos llamadas, una falla en el medio dejaría al activo sin ningún
-- período abierto (huecos en el historial) o con dos (horas duplicadas).
--
-- `p_desde` permite fechar hacia atrás — "se cayó ayer a las 15:00"— que es el
-- caso real: nadie está frente al sistema en el momento exacto en que se para
-- una máquina. Se valida que no quede antes del período que ya estaba abierto,
-- porque eso invertiría el orden de la línea de tiempo.
CREATE OR REPLACE FUNCTION public.cambiar_estado_activo(
  p_activo           uuid,
  p_estado           text,
  p_tipo_inactividad text DEFAULT NULL,
  p_desde            timestamptz DEFAULT NULL,
  p_notas            text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_workspace uuid;
  v_desde     timestamptz := COALESCE(p_desde, now());
  v_abierto   record;
  v_nuevo     uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.';
  END IF;

  SELECT workspace_id INTO v_workspace
    FROM public.activos
   WHERE id = p_activo AND COALESCE(activo, true);
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'El activo no existe o fue dado de baja.';
  END IF;

  -- RLS no aplica dentro de SECURITY DEFINER, así que el aislamiento entre
  -- workspaces se comprueba a mano.
  IF v_workspace IS DISTINCT FROM public.my_workspace_id() THEN
    RAISE EXCEPTION 'El activo no pertenece a tu espacio de trabajo.';
  END IF;

  IF p_estado NOT IN ('operativo','fuera_servicio','mantencion','baja') THEN
    RAISE EXCEPTION 'Estado inválido.';
  END IF;

  -- La restricción de la tabla ya lo exige; acá el mensaje es en castellano y
  -- llega antes de tocar nada.
  IF p_estado = 'operativo' AND p_tipo_inactividad IS NOT NULL THEN
    RAISE EXCEPTION 'Un activo operativo no lleva tipo de inactividad.';
  END IF;
  IF p_estado <> 'operativo' AND p_tipo_inactividad IS NULL THEN
    RAISE EXCEPTION 'Elige si la inactividad es planeada o sin planear.';
  END IF;

  IF v_desde > now() THEN
    RAISE EXCEPTION 'La fecha de inicio no puede estar en el futuro.';
  END IF;

  SELECT id, inicio, estado INTO v_abierto
    FROM public.activo_estado_periodos
   WHERE activo_id = p_activo AND fin IS NULL
   LIMIT 1;

  IF FOUND THEN
    IF v_abierto.estado = p_estado THEN
      RAISE EXCEPTION 'El activo ya está en ese estado.';
    END IF;
    IF v_desde <= v_abierto.inicio THEN
      RAISE EXCEPTION 'La fecha de inicio tiene que ser posterior al comienzo del estado actual.';
    END IF;
    UPDATE public.activo_estado_periodos
       SET fin = v_desde
     WHERE id = v_abierto.id;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, notas, creado_por)
  VALUES
    (p_activo, v_workspace, p_estado, p_tipo_inactividad, v_desde, NULLIF(btrim(p_notas), ''), v_actor)
  RETURNING id INTO v_nuevo;

  -- `activos.estado` sigue siendo la fuente para listados y filtros; esta tabla
  -- es el historial. El trigger de actividad_activo se dispara solo.
  UPDATE public.activos SET estado = p_estado WHERE id = p_activo;

  RETURN v_nuevo;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_activo(uuid, text, text, timestamptz, text) IS
  'Cierra el período de estado abierto y abre el nuevo, atómicamente. Permite '
  'fechar hacia atrás para registrar paradas que nadie cargó en el momento.';

REVOKE ALL ON FUNCTION public.cambiar_estado_activo(uuid, text, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_activo(uuid, text, text, timestamptz, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Semilla: un período abierto por cada activo vigente.
--
-- Sin esto los activos que ya existen no tienen historial y el panel sale vacío
-- hasta el primer cambio de estado. Se arranca desde `created_at` del activo,
-- que es lo más honesto que se puede afirmar: no sabemos cuándo entró en su
-- estado actual, pero sí que no fue antes de existir.
--
-- Los que ya tengan un período abierto se saltan, así que correrlo dos veces
-- no duplica nada.
INSERT INTO public.activo_estado_periodos
  (activo_id, workspace_id, estado, tipo_inactividad, inicio, creado_por)
SELECT
  a.id,
  a.workspace_id,
  COALESCE(NULLIF(a.estado, ''), 'operativo'),
  CASE
    WHEN COALESCE(NULLIF(a.estado, ''), 'operativo') = 'operativo' THEN NULL
    ELSE 'sin_planear'
  END,
  COALESCE(a.created_at, now()),
  NULL
FROM public.activos a
WHERE COALESCE(a.activo, true)
  AND a.workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.activo_estado_periodos p
     WHERE p.activo_id = a.id AND p.fin IS NULL
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Red de seguridad: mantener el historial aunque nadie use la función.
--
-- `activos.estado` se escribe desde varios lados —el formulario de edición del
-- panel, la app móvil, y cualquier UPDATE suelto—, no solo desde
-- `cambiar_estado_activo`. Si alguno de esos caminos cambia el estado sin tocar
-- `activo_estado_periodos`, el historial queda con huecos y las horas mal
-- contadas, que es justo el problema que esta tabla viene a resolver.
--
-- Este trigger cierra el período abierto y abre el nuevo ante CUALQUIER cambio
-- de `estado`. Es idempotente respecto de la función: cuando el cambio vino de
-- `cambiar_estado_activo`, el período nuevo ya existe con el `inicio` elegido
-- por el usuario (que puede ser retroactivo), así que el trigger no hace nada.
--
-- Lo que el trigger NO puede saber es si la parada fue planificada; asume
-- `sin_planear`, que es el supuesto conservador: contar de más una avería es
-- preferible a esconderla en la mantención programada.
CREATE OR REPLACE FUNCTION public.fn_sync_activo_estado_periodo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_abierto record;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  SELECT id, estado, inicio INTO v_abierto
    FROM public.activo_estado_periodos
   WHERE activo_id = NEW.id AND fin IS NULL
   LIMIT 1;

  -- `cambiar_estado_activo` ya dejó el período correcto: no duplicar.
  IF FOUND AND v_abierto.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF FOUND THEN
    UPDATE public.activo_estado_periodos SET fin = now() WHERE id = v_abierto.id;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, creado_por)
  VALUES (
    NEW.id,
    NEW.workspace_id,
    NEW.estado,
    CASE WHEN NEW.estado = 'operativo' THEN NULL ELSE 'sin_planear' END,
    now(),
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_activo_estado_periodo ON public.activos;
CREATE TRIGGER trg_sync_activo_estado_periodo
  AFTER UPDATE OF estado ON public.activos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_activo_estado_periodo();

-- ─────────────────────────────────────────────────────────────────────────────
-- Activos nuevos: abrirles el período inicial al crearlos.
--
-- La semilla de más arriba solo alcanza a los activos que existían cuando corrió
-- la migración. Sin este trigger, un activo creado después nace sin ningún
-- período abierto y su historial sale vacío hasta que alguien le cambie el
-- estado — que es exactamente lo que no se quiere: un activo operativo desde su
-- alta tiene tiempo de funcionamiento desde el minuto uno.
CREATE OR REPLACE FUNCTION public.fn_abrir_periodo_activo_nuevo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, creado_por)
  VALUES (
    NEW.id,
    NEW.workspace_id,
    COALESCE(NULLIF(NEW.estado, ''), 'operativo'),
    CASE WHEN COALESCE(NULLIF(NEW.estado, ''), 'operativo') = 'operativo' THEN NULL ELSE 'sin_planear' END,
    COALESCE(NEW.created_at, now()),
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abrir_periodo_activo_nuevo ON public.activos;
CREATE TRIGGER trg_abrir_periodo_activo_nuevo
  AFTER INSERT ON public.activos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_abrir_periodo_activo_nuevo();
