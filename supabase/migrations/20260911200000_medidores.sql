-- Medidores: puntos de lectura sobre un activo, y las lecturas que producen.
--
-- El caso que resuelve: hoy el estado de un activo solo cambia cuando una
-- persona lo declara. Un medidor es la otra fuente de verdad —el numero que
-- sale de la maquina— y lo que permite que una condicion anormal se convierta
-- en una OT sin que nadie este mirando.
--
-- POR QUE UNA TABLA Y NO DOS (manual vs automatizado):
-- La diferencia entre "el tecnico anota 8.421 horas en la ronda" y "el gateway
-- publica 8.421" es de donde viene el POST, no de que significa el numero. El
-- grafico, el umbral y el disparo de la OT son identicos en los dos casos. Dos
-- tablas obligarian a duplicar las tres cosas para siempre; el `tipo` distingue
-- lo unico que difiere de verdad: si lleva token y quien puede escribir.
--
-- POR QUE EL MEDIDOR NO CUELGA DEL ACTIVO:
-- `activo_id` es nullable a proposito. Un medidor de consumo electrico de un
-- edificio no pertenece a ninguna maquina, y obligarlo a inventarse un activo
-- padre ensucia el inventario. Sin activo el medidor grafica igual; lo que no
-- puede hacer es abrir una OT (no habria a que asociarla) — ver el trigger.

-- ── Medidores ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medidores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  nombre       text NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion  text,

  -- 'manual': lo carga una persona desde la app.
  -- 'automatizado': lo carga un dispositivo contra /api/medidores/lecturas.
  tipo         text NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual','automatizado')),

  -- Texto libre y no un enum: las unidades reales no caben en una lista
  -- cerrada (mm/s, A, °C, rpm, bar, kWh, horas, ciclos, %, ...) y cada planta
  -- tiene las suyas. Validar esto solo obligaria a migrar por cada unidad nueva.
  unidad       text NOT NULL CHECK (btrim(unidad) <> ''),

  activo_id    uuid REFERENCES public.activos(id) ON DELETE CASCADE,
  ubicacion_id uuid REFERENCES public.ubicaciones(id) ON DELETE SET NULL,

  -- Credencial de escritura del dispositivo. NULL en los manuales.
  --
  -- ponytail: token en claro. Es una credencial de solo-escritura, acotada a un
  -- medidor, revocable borrando la fila, y guardarla asi permite que la UI lo
  -- muestre siempre ("copiar token") que es lo que el cliente espera al
  -- configurar un gateway. Si algun dia el medidor puede LEER algo, o el token
  -- sirve para mas de un medidor, pasa a hash + mostrar-una-sola-vez.
  token        text UNIQUE,

  -- Umbrales. NULL = el medidor solo grafica, no vigila.
  advertencia  numeric,
  critico      numeric,

  -- Baja logica, igual que `activos.activo`: borrar el medidor se llevaria el
  -- historial de lecturas por el ON DELETE CASCADE de abajo.
  activo       boolean NOT NULL DEFAULT true,

  creado_por   uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Solo los automatizados llevan token, y todos ellos lo necesitan: sin token
  -- el dispositivo no tiene como autenticarse y el medidor nace inservible.
  CONSTRAINT medidores_token_por_tipo CHECK (
    (tipo = 'automatizado' AND token IS NOT NULL)
    OR (tipo = 'manual' AND token IS NULL)
  ),

  -- Un critico por debajo de la advertencia haria que la franja de advertencia
  -- no exista: toda lectura que la cruza ya es critica.
  CONSTRAINT medidores_umbrales_ordenados CHECK (
    advertencia IS NULL OR critico IS NULL OR critico > advertencia
  )
);

CREATE INDEX IF NOT EXISTS idx_medidores_ws ON public.medidores (workspace_id) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_medidores_activo ON public.medidores (activo_id) WHERE activo;

ALTER TABLE public.medidores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medidores_select ON public.medidores;
CREATE POLICY medidores_select ON public.medidores
  FOR SELECT USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS medidores_insert ON public.medidores;
CREATE POLICY medidores_insert ON public.medidores
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS medidores_update ON public.medidores;
CREATE POLICY medidores_update ON public.medidores
  FOR UPDATE USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS medidores_delete ON public.medidores;
CREATE POLICY medidores_delete ON public.medidores
  FOR DELETE USING (workspace_id = my_workspace_id());

-- ── Lecturas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medidor_lecturas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medidor_id   uuid NOT NULL REFERENCES public.medidores(id) ON DELETE CASCADE,
  -- Denormalizado por la misma razon que en `activo_estado_periodos`: las
  -- consultas filtran por workspace y rango, y sin esto cada una tendria que
  -- pasar por `medidores`.
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  valor        numeric NOT NULL,
  -- El instante de la MEDICION, no el de la insercion: un gateway que estuvo
  -- sin red manda su buffer despues y las lecturas tienen que caer donde
  -- corresponde en el grafico.
  ts           timestamptz NOT NULL DEFAULT now(),

  -- NULL = entro por la API. Con valor = la cargo esa persona a mano.
  creado_por   uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- El acceso tipico: la serie de un medidor en una ventana de tiempo.
CREATE INDEX IF NOT EXISTS idx_medidor_lecturas_serie
  ON public.medidor_lecturas (medidor_id, ts DESC);

ALTER TABLE public.medidor_lecturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medidor_lecturas_select ON public.medidor_lecturas;
CREATE POLICY medidor_lecturas_select ON public.medidor_lecturas
  FOR SELECT USING (workspace_id = my_workspace_id());

-- Insert manual desde la app. Los automatizados entran por la API con service
-- role, que no pasa por RLS.
DROP POLICY IF EXISTS medidor_lecturas_insert ON public.medidor_lecturas;
CREATE POLICY medidor_lecturas_insert ON public.medidor_lecturas
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

-- Sin UPDATE a proposito: una lectura es un hecho medido, no se edita. Si el
-- numero estaba mal se borra la fila y se carga de nuevo.
DROP POLICY IF EXISTS medidor_lecturas_delete ON public.medidor_lecturas;
CREATE POLICY medidor_lecturas_delete ON public.medidor_lecturas
  FOR DELETE USING (workspace_id = my_workspace_id());

-- `medidor_id` en la OT: es lo que hace posible el dedupe del trigger de abajo
-- y deja ver de que lectura salio el trabajo. Va antes de la funcion porque la
-- funcion lo consulta.
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS medidor_id uuid REFERENCES public.medidores(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- El disparo: una lectura critica abre una OT.
--
-- Esto es lo unico que separa "Pangui tiene graficos de IoT" de "Pangui
-- convierte una condicion anormal en trabajo asignado". El resto de la
-- migracion es plomeria para que esta funcion tenga de donde leer.
--
-- POR QUE UN TRIGGER Y NO LA API:
-- Porque una lectura manual tiene que disparar exactamente igual que una
-- automatizada. Si el chequeo viviera en /api/medidores/lecturas, el tecnico
-- que anota una vibracion de 9 mm/s en la ronda no abriria ninguna OT.
CREATE OR REPLACE FUNCTION public.fn_medidor_lectura_critica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_medidor record;
  v_abierta uuid;
  v_numero  integer;
  v_orden   uuid;
  v_titulo  text;
BEGIN
  SELECT id, nombre, unidad, activo_id, ubicacion_id, critico, creado_por, workspace_id
    INTO v_medidor
    FROM public.medidores
   WHERE id = NEW.medidor_id;

  -- Sin umbral no hay nada que vigilar; sin activo no hay a que asociar la OT.
  IF v_medidor.critico IS NULL OR v_medidor.activo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.valor < v_medidor.critico THEN
    RETURN NEW;
  END IF;

  -- Dedupe: mientras siga abierta la OT anterior de ESTE medidor, no se abre
  -- otra. Sin esto un motor parado en 7.8 mm/s genera una OT por lectura —que
  -- con un gateway de 5 segundos son 720 por hora— y el cliente apaga la
  -- funcion el primer dia.
  --
  -- ponytail: el candado es "hay una OT abierta", no una ventana de tiempo. Si
  -- alguien cierra la OT con la maquina todavia critica, la siguiente lectura
  -- abre otra — que es el comportamiento correcto (el problema sigue ahi), pero
  -- si molesta, el upgrade es exigir ademas N minutos desde `generada_at`.
  SELECT o.id INTO v_abierta
    FROM public.ordenes_trabajo o
   WHERE o.medidor_id = NEW.medidor_id
     AND o.estado NOT IN ('completado','cancelado')
   LIMIT 1;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  v_titulo := v_medidor.nombre || ' en nivel critico';

  -- MAX+1 por workspace, igual que `work_order_command_create`. El numero no
  -- tiene default en la tabla: si no se calcula aca, la OT sale como "OT #".
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.ordenes_trabajo
   WHERE workspace_id = v_medidor.workspace_id;

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, estado, prioridad,
    activo_id, ubicacion_id, medidor_id, numero, origen
  ) VALUES (
    v_medidor.workspace_id,
    -- Queda a nombre de quien creo el medidor: es lo mas cercano a un
    -- responsable que se puede afirmar sin inventar un usuario de sistema.
    v_medidor.creado_por,
    v_titulo,
    format(
      'Lectura de %s: %s %s (umbral critico: %s %s) el %s.',
      v_medidor.nombre,
      -- rtrim del punto: 'FM...0.999' deja "7." en los enteros.
      rtrim(trim(to_char(NEW.valor, 'FM999999990.999')), '.'), v_medidor.unidad,
      rtrim(trim(to_char(v_medidor.critico, 'FM999999990.999')), '.'), v_medidor.unidad,
      to_char(NEW.ts AT TIME ZONE 'America/Santiago', 'DD/MM/YYYY HH24:MI')
    ),
    'solicitud',
    'emergencia',
    'pendiente',
    'alta',
    v_medidor.activo_id,
    v_medidor.ubicacion_id,
    NEW.medidor_id,
    v_numero,
    'medidor'
  )
  RETURNING id INTO v_orden;

  RETURN NEW;
END;
$$;

-- Parcial porque la enorme mayoria de las OTs no viene de un medidor, y el
-- unico acceso por esta columna es el dedupe (que solo mira las abiertas).
CREATE INDEX IF NOT EXISTS idx_ordenes_medidor_abiertas
  ON public.ordenes_trabajo (medidor_id)
  WHERE medidor_id IS NOT NULL AND estado NOT IN ('completado','cancelado');

DROP TRIGGER IF EXISTS trg_medidor_lectura_critica ON public.medidor_lecturas;
CREATE TRIGGER trg_medidor_lectura_critica
  AFTER INSERT ON public.medidor_lecturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_medidor_lectura_critica();

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- El panel de lecturas se actualiza solo mientras el usuario lo mira: es el
-- punto de la funcion —ver el numero de la maquina moverse— y sin esto habria
-- que refrescar a mano o poner un polling que consulta aunque no cambie nada.
--
-- La publicacion esta recortada a proposito (ver 20260814190000_trim_realtime_
-- publication): se agrega tabla por tabla, solo las que tienen un suscriptor
-- real. Esta lo tiene.
ALTER PUBLICATION supabase_realtime ADD TABLE public.medidor_lecturas;
