-- Automatizaciones: la regla configurable que reemplaza al disparo soldado.
--
-- Hasta acá `fn_medidor_lectura_critica` implementaba DOS reglas fijas —umbral
-- crítico y intervalo de uso— con título, tipo, prioridad y dedupe constantes en
-- el código. Servía, pero nadie podía escribir "si la corriente pasa de 10 A,
-- abre una OT asignada a Juan". Estas tablas son ese "nadie podía" resuelto.
--
-- El motor va en la migración siguiente; acá está solo dónde se guarda.

CREATE TABLE IF NOT EXISTS public.automatizaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nombre              text NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion         text,
  -- Toggle "Habilitar la automatización". Se apaga sin borrar: una
  -- automatización pausada conserva su historial de ejecuciones.
  activa              boolean NOT NULL DEFAULT true,
  ultima_ejecucion_at timestamptz,
  creado_por          uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automatizaciones_ws
  ON public.automatizaciones (workspace_id);

-- ── Disparadores ────────────────────────────────────────────────────────────
-- Una fila por medidor vigilado. Varios medidores en la misma automatización son
-- varias filas: es lo que hace posible el "+ Añadir varios activos" sin una
-- tabla puente aparte.
CREATE TABLE IF NOT EXISTS public.automatizacion_triggers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automatizacion_id uuid NOT NULL REFERENCES public.automatizaciones(id) ON DELETE CASCADE,
  medidor_id        uuid NOT NULL REFERENCES public.medidores(id) ON DELETE CASCADE,

  operador          text NOT NULL CHECK (operador IN ('mayor_igual','menor_igual','igual','entre')),
  valor             numeric NOT NULL,
  -- Solo en 'entre'. El CHECK de abajo lo exige ahí y lo prohíbe en el resto:
  -- un 'valor_hasta' colgando en un operador que no lo usa es una regla que se
  -- lee de dos maneras distintas.
  valor_hasta       numeric,

  modo              text NOT NULL DEFAULT 'una_lectura'
                    CHECK (modo IN ('una_lectura','una_lectura_reset','lecturas_multiples')),
  modo_n            integer CHECK (modo_n IS NULL OR modo_n > 1),

  -- Latch de 'una_lectura_reset'. Es el único estado que el modo necesita: sin
  -- esto no hay forma de distinguir "todavía no disparé" de "ya disparé y la
  -- condición sigue cumpliéndose".
  armado            boolean NOT NULL DEFAULT true,

  CONSTRAINT automatizacion_triggers_hasta_solo_en_entre CHECK (
    (operador = 'entre'  AND valor_hasta IS NOT NULL AND valor_hasta > valor)
    OR (operador <> 'entre' AND valor_hasta IS NULL)
  ),
  CONSTRAINT automatizacion_triggers_n_solo_en_multiples CHECK (
    (modo = 'lecturas_multiples' AND modo_n IS NOT NULL)
    OR (modo <> 'lecturas_multiples' AND modo_n IS NULL)
  )
);

-- El acceso del motor: por medidor, en cada lectura insertada.
CREATE INDEX IF NOT EXISTS idx_automatizacion_triggers_medidor
  ON public.automatizacion_triggers (medidor_id);
CREATE INDEX IF NOT EXISTS idx_automatizacion_triggers_auto
  ON public.automatizacion_triggers (automatizacion_id);

-- ── Acciones ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automatizacion_acciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automatizacion_id uuid NOT NULL REFERENCES public.automatizaciones(id) ON DELETE CASCADE,

  -- v1 solo escribe 'crear_ot'. Las otras tres entran en el CHECK desde ahora
  -- para no migrarlo después; el motor las registra como omitidas.
  tipo              text NOT NULL CHECK (tipo IN
                    ('crear_ot','crear_solicitud','cambiar_estado_activo','enviar_notificacion')),

  -- jsonb y no columnas: 'crear_ot' lleva ~15 campos y las otras tres llevan dos
  -- cada una. Una columna por campo sería 90% NULL y habría que migrar la tabla
  -- cada vez que la OT gane un campo.
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Los dos frenos. Por ACCIÓN y no por automatización, igual que la referencia:
  -- una automatización puede querer notificar siempre y abrir OT una vez al día.
  --
  -- Sin retrigger, un gateway que publica cada 5 segundos con la condición
  -- cumplida genera 720 OT por hora y el cliente apaga la función el primer día.
  retrigger_minutos integer NOT NULL DEFAULT 5 CHECK (retrigger_minutos >= 0),
  solo_si_anterior_cerrada boolean NOT NULL DEFAULT false,

  orden             integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_automatizacion_acciones_auto
  ON public.automatizacion_acciones (automatizacion_id, orden);

-- ── Historial ───────────────────────────────────────────────────────────────
-- El panel "Historia de la acción". Es producto, no telemetría: de las cinco
-- preguntas de la FAQ de MaintainX, cuatro son "¿por qué no corrió / por qué se
-- saltó / por qué falló / por qué duplicó?". Registrar SOLO los éxitos deja esas
-- cuatro sin respuesta y las convierte en tickets de soporte.
CREATE TABLE IF NOT EXISTS public.automatizacion_ejecuciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automatizacion_id uuid NOT NULL REFERENCES public.automatizaciones(id) ON DELETE CASCADE,
  accion_id         uuid REFERENCES public.automatizacion_acciones(id) ON DELETE SET NULL,
  lectura_id        uuid REFERENCES public.medidor_lecturas(id) ON DELETE SET NULL,

  resultado         text NOT NULL CHECK (resultado IN ('ejecutada','omitida','fallida')),
  -- Por qué se omitió o falló, en castellano y listo para mostrar.
  detalle           text,
  -- El valor que disparó, congelado: la lectura se puede borrar (la tabla tiene
  -- policy de DELETE) y el historial no debería quedar sin el número.
  valor             numeric,
  orden_id          uuid REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- El historial se lee de la más nueva hacia atrás, por automatización.
CREATE INDEX IF NOT EXISTS idx_automatizacion_ejecuciones_hist
  ON public.automatizacion_ejecuciones (automatizacion_id, created_at DESC);
-- El chequeo de retrigger: última ejecutada de ESTA acción.
CREATE INDEX IF NOT EXISTS idx_automatizacion_ejecuciones_retrigger
  ON public.automatizacion_ejecuciones (accion_id, created_at DESC)
  WHERE resultado = 'ejecutada';

-- ── OT generada por automatización ──────────────────────────────────────────
-- Necesaria para que `solo_si_anterior_cerrada` mire por AUTOMATIZACIÓN y no por
-- medidor: dos automatizaciones sobre el mismo medidor no deben bloquearse entre
-- sí, que es lo que pasaría reusando `ordenes_trabajo.medidor_id`.
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS automatizacion_id uuid
  REFERENCES public.automatizaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_automatizacion_abiertas
  ON public.ordenes_trabajo (automatizacion_id)
  WHERE automatizacion_id IS NOT NULL AND estado NOT IN ('completado','cancelado');

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Las tres tablas hijas no tienen workspace_id propio: se resuelve por la
-- automatización padre. Denormalizarlo acá ahorraría un EXISTS por fila pero
-- abre la puerta a que un hijo quede en otro workspace que su padre.
ALTER TABLE public.automatizaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automatizaciones_select ON public.automatizaciones;
CREATE POLICY automatizaciones_select ON public.automatizaciones
  FOR SELECT USING (workspace_id = my_workspace_id());
DROP POLICY IF EXISTS automatizaciones_insert ON public.automatizaciones;
CREATE POLICY automatizaciones_insert ON public.automatizaciones
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
DROP POLICY IF EXISTS automatizaciones_update ON public.automatizaciones;
CREATE POLICY automatizaciones_update ON public.automatizaciones
  FOR UPDATE USING (workspace_id = my_workspace_id());
DROP POLICY IF EXISTS automatizaciones_delete ON public.automatizaciones;
CREATE POLICY automatizaciones_delete ON public.automatizaciones
  FOR DELETE USING (workspace_id = my_workspace_id());

ALTER TABLE public.automatizacion_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automatizacion_triggers_all ON public.automatizacion_triggers;
CREATE POLICY automatizacion_triggers_all ON public.automatizacion_triggers
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ));

ALTER TABLE public.automatizacion_acciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automatizacion_acciones_all ON public.automatizacion_acciones;
CREATE POLICY automatizacion_acciones_all ON public.automatizacion_acciones
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ));

-- Solo lectura: las escribe el motor (SECURITY DEFINER), nunca un cliente.
ALTER TABLE public.automatizacion_ejecuciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automatizacion_ejecuciones_select ON public.automatizacion_ejecuciones;
CREATE POLICY automatizacion_ejecuciones_select ON public.automatizacion_ejecuciones
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ));
