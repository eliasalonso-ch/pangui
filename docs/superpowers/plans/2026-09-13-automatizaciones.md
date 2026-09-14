# Automatizaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded meter→work-order trigger with a configurable
trigger → action engine, exposed at `/automatizaciones` and gated to plan Empresa.

**Architecture:** Four new tables hold the rules; one `AFTER INSERT` trigger on
`medidor_lecturas` evaluates them and writes both the resulting work order and an
execution log row (including skips). The UI is a master-detail page cloned from
`/medidores`. The engine lives in Postgres because readings arrive from three
clients (web, mobile offline queue, gateway API with service role) and all three
must fire identically.

**Tech Stack:** Next.js 16 (App Router, client components), Supabase/Postgres 17
with RLS, TanStack Query, pgTAP for the engine tests, vitest for TS units,
lucide-react icons. Inline `style` objects — this codebase does not use CSS
modules or styled-components on these screens.

**Spec:** `docs/superpowers/specs/2026-09-13-automatizaciones-design.md`

## Global Constraints

- All user-facing copy is **Spanish (es-CL)**. Comments in new SQL and TS explain
  *why*, matching the density of `supabase/migrations/20260911200000_medidores.sql`.
- Migration filenames: `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`, timestamps
  strictly after `20260913220000` (the newest existing migration).
- Every new table: `workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON
  DELETE CASCADE`, `ENABLE ROW LEVEL SECURITY`, and four policies scoped with
  `workspace_id = my_workspace_id()` — copy the shape from `medidores` in
  `20260911200000_medidores.sql:78-94`.
- Plan tiers are exactly `basic | esencial | pro | enterprise`. "Empresa" is the
  display name of `enterprise`.
- `ordenes_trabajo` facts the engine depends on (verified against production):
  `descripcion` is **NOT NULL**, `numero` has **no default** (compute `MAX+1` per
  workspace), `asignados_ids` is `uuid[]`, `categoria_ids` is `uuid[]`,
  `tiempo_estimado` is `integer` **in minutes**, `prioridad` defaults to `'media'`,
  `estado` defaults to `'pendiente'`.
- Valid `tipo_trabajo`: `reactiva | preventiva | emergencia | levantamiento |
  presupuesto`. Valid `prioridad`: `ninguna | baja | media | alta | urgente`.
- Do not call `create_work_order_v1` from the trigger — it expects an actor JWT.
  Insert into `ordenes_trabajo` directly, as the current trigger does.
- Tests: `npm test` (vitest) from `C:\dev\pangui`; `supabase test db` runs every
  file in `supabase/tests/` (picked up automatically, no registration needed).
- Mobile repo is `C:\dev\pangui-native-stable`. Its meter form creates **manual
  meters only** (there is no `tipo` field), and it uses `frecuencia_minutos`
  where web's type says `frecuencia_dias` — a pre-existing divergence. Do not
  "fix" it in this work.

---

### Task 1: Tables, RLS and the plan flag

**Files:**
- Create: `supabase/migrations/20260914100000_automatizaciones.sql`
- Modify: `lib/flow-plans.ts:43-80` (add flag to the `features` interface), and the
  four `features` blocks at `:115-130`, `:162-179`, `:210-229`, `:256-271`
- Modify: `lib/planes.js:11-74` (mirror the flag in all four tiers)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `automatizaciones`, `automatizacion_triggers`,
  `automatizacion_acciones`, `automatizacion_ejecuciones`; column
  `ordenes_trabajo.automatizacion_id uuid`; plan feature key `automatizaciones`
  (`false` on basic/esencial/pro, `true` on enterprise).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260914100000_automatizaciones.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration to a scratch branch and verify**

Do NOT apply to production yet. Verify the SQL parses and the constraints behave:

```bash
cd /c/dev/pangui && supabase db reset --local 2>&1 | tail -20
```

Expected: reset completes with no error mentioning `automatizacion`.

If no local Supabase is available, verify by applying to the remote in a
transaction that rolls back — use the `execute_sql` MCP tool with the whole file
wrapped in `BEGIN; ... ROLLBACK;` and confirm no syntax error.

- [ ] **Step 3: Add the plan flag**

In `lib/flow-plans.ts`, inside the `features` block of the `PlanDef` interface
(after the `medidores` entry, around line 71):

```typescript
    // Automatizaciones: el constructor de reglas medidor → acción. Empresa y
    // solo Empresa. A diferencia de `medidores` —que es ver el número— esto es
    // que el sistema actúe solo, y es la línea que separa Pro de Empresa.
    automatizaciones:         boolean;   // /automatizaciones route
```

Then add `automatizaciones: false,` to the `features` of `basic`, `esencial` and
`pro`, and `automatizaciones: true,` to `enterprise`. Place each line immediately
after that tier's `medidores:` line so the blocks stay in the same order.

In `lib/planes.js`, add `automatizaciones: false` to `basic`, `esencial` and
`pro` feature blocks and `automatizaciones: true` to `enterprise`.

- [ ] **Step 4: Update the plan copy**

In `lib/flow-plans.ts`, the Pro highlight at line 192 currently reads
`"Medidores y mantenimiento por condición"`. Meter→OT firing moves to Empresa, so
that line becomes untrue. Change it to:

```typescript
      "Medidores y seguimiento de condición",
```

And in the `enterprise` highlights (line ~237), add after `"Todo lo de Pro"`:

```typescript
      "Automatizaciones (medidor → orden de trabajo)",
```

- [ ] **Step 5: Verify types compile**

Run: `cd /c/dev/pangui && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no error mentioning `flow-plans` or `automatizaciones`.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/pangui
git add supabase/migrations/20260914100000_automatizaciones.sql lib/flow-plans.ts lib/planes.js
git commit -m "feat(automatizaciones): tablas, RLS y bandera de plan Empresa

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The engine

Replaces `fn_medidor_lectura_critica` entirely. This is the highest-risk task in
the plan: a mis-braked engine generates hundreds of work orders.

**Files:**
- Create: `supabase/migrations/20260914110000_automatizaciones_motor.sql`

**Interfaces:**
- Consumes: every table from Task 1.
- Produces: function `public.fn_automatizacion_lectura()` and trigger
  `trg_automatizacion_lectura` on `medidor_lecturas`. Drops
  `trg_medidor_lectura_critica` and `fn_medidor_lectura_critica`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260914110000_automatizaciones_motor.sql`:

```sql
-- El motor de automatizaciones. Reemplaza a fn_medidor_lectura_critica.
--
-- POR QUÉ SIGUE SIENDO UN TRIGGER (y no la API):
-- Una lectura entra por tres caminos —el formulario web, la cola offline del
-- móvil y /api/medidores/lecturas con service role— y las tres tienen que
-- disparar igual. Es el mismo motivo que estaba comentado en la migración
-- original y no cambió: si el chequeo viviera en la API, el técnico que anota la
-- lectura en la ronda no abriría ninguna OT.
--
-- POR QUÉ SE BORRA EL ANTERIOR:
-- Los umbrales soldados hacían exactamente esto con dos reglas fijas. Dejarlos
-- correr al lado del motor significa que un medidor con umbral Y automatización
-- abre DOS OT por la misma lectura.

CREATE OR REPLACE FUNCTION public.fn_automatizacion_lectura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_medidor    record;
  v_trigger    record;
  v_accion     record;
  v_cumple     boolean;
  v_cumplen_n  integer;
  v_abierta    uuid;
  v_ultima     timestamptz;
  v_numero     integer;
  v_orden      uuid;
  v_titulo     text;
  v_desc       text;
  v_es_empresa boolean;
BEGIN
  SELECT id, nombre, unidad, activo_id, ubicacion_id, workspace_id
    INTO v_medidor
    FROM public.medidores
   WHERE id = NEW.medidor_id;

  -- El gate de plan vive acá y no solo en la UI: una automatización creada en
  -- Empresa seguiría corriendo después de bajar de plan, que es exactamente la
  -- clase de cobro fantasma que nadie quiere explicar.
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.workspace_id = v_medidor.workspace_id
       AND s.plan_key = 'enterprise'
       AND s.status IN ('active','trialing','past_due')
  ) INTO v_es_empresa;

  FOR v_trigger IN
    SELECT t.*, a.id AS auto_id, a.creado_por AS auto_creado_por
      FROM public.automatizacion_triggers t
      JOIN public.automatizaciones a ON a.id = t.automatizacion_id
     WHERE t.medidor_id = NEW.medidor_id
       AND a.activa
       AND a.workspace_id = v_medidor.workspace_id
  LOOP
    IF NOT v_es_empresa THEN
      INSERT INTO public.automatizacion_ejecuciones
        (automatizacion_id, lectura_id, resultado, detalle, valor)
      VALUES (v_trigger.auto_id, NEW.id, 'omitida',
              'El plan del espacio no incluye automatizaciones.', NEW.valor);
      CONTINUE;
    END IF;

    -- ── ¿La lectura cumple el operador? ─────────────────────────────────────
    v_cumple := CASE v_trigger.operador
      WHEN 'mayor_igual' THEN NEW.valor >= v_trigger.valor
      WHEN 'menor_igual' THEN NEW.valor <= v_trigger.valor
      WHEN 'igual'       THEN NEW.valor  = v_trigger.valor
      WHEN 'entre'       THEN NEW.valor >= v_trigger.valor
                          AND NEW.valor <= v_trigger.valor_hasta
    END;

    -- ── El modo ─────────────────────────────────────────────────────────────
    IF v_trigger.modo = 'una_lectura_reset' THEN
      -- Latch: al dejar de cumplirse se rearma y no se dispara nada más.
      IF NOT v_cumple THEN
        IF NOT v_trigger.armado THEN
          UPDATE public.automatizacion_triggers SET armado = true WHERE id = v_trigger.id;
        END IF;
        CONTINUE;
      END IF;
      IF NOT v_trigger.armado THEN
        CONTINUE;  -- ya disparó y la condición nunca se despejó
      END IF;

    ELSIF v_trigger.modo = 'lecturas_multiples' THEN
      IF NOT v_cumple THEN
        CONTINUE;
      END IF;
      -- Las últimas N lecturas del medidor, ESTA incluida, tienen que cumplir
      -- todas. Se cuenta sobre la ventana en vez de llevar un contador: un
      -- contador se desincroniza si alguien borra una lectura.
      SELECT count(*) INTO v_cumplen_n FROM (
        SELECT l.valor
          FROM public.medidor_lecturas l
         WHERE l.medidor_id = NEW.medidor_id
         ORDER BY l.ts DESC
         LIMIT v_trigger.modo_n
      ) ult
      WHERE CASE v_trigger.operador
        WHEN 'mayor_igual' THEN ult.valor >= v_trigger.valor
        WHEN 'menor_igual' THEN ult.valor <= v_trigger.valor
        WHEN 'igual'       THEN ult.valor  = v_trigger.valor
        WHEN 'entre'       THEN ult.valor >= v_trigger.valor
                            AND ult.valor <= v_trigger.valor_hasta
      END;

      IF v_cumplen_n < v_trigger.modo_n THEN
        CONTINUE;
      END IF;

    ELSE  -- 'una_lectura'
      IF NOT v_cumple THEN
        CONTINUE;
      END IF;
    END IF;

    -- ── Acciones ────────────────────────────────────────────────────────────
    FOR v_accion IN
      SELECT * FROM public.automatizacion_acciones
       WHERE automatizacion_id = v_trigger.auto_id
       ORDER BY orden, id
    LOOP
      -- v1 solo ejecuta crear_ot. El resto queda registrado para que la ficha
      -- diga por qué no pasó nada, en vez de quedar muda.
      IF v_accion.tipo <> 'crear_ot' THEN
        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                'Este tipo de acción todavía no está disponible.', NEW.valor);
        CONTINUE;
      END IF;

      -- Freno 1: retrigger.
      IF v_accion.retrigger_minutos > 0 THEN
        SELECT max(created_at) INTO v_ultima
          FROM public.automatizacion_ejecuciones
         WHERE accion_id = v_accion.id AND resultado = 'ejecutada';

        IF v_ultima IS NOT NULL
           AND v_ultima > now() - make_interval(mins => v_accion.retrigger_minutos) THEN
          INSERT INTO public.automatizacion_ejecuciones
            (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
          VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                  format('Se ejecutó hace menos de %s minutos.', v_accion.retrigger_minutos),
                  NEW.valor);
          CONTINUE;
        END IF;
      END IF;

      -- Freno 2: la OT anterior de ESTA automatización sigue abierta.
      IF v_accion.solo_si_anterior_cerrada THEN
        SELECT o.id INTO v_abierta
          FROM public.ordenes_trabajo o
         WHERE o.automatizacion_id = v_trigger.auto_id
           AND o.estado NOT IN ('completado','cancelado')
         LIMIT 1;

        IF v_abierta IS NOT NULL THEN
          INSERT INTO public.automatizacion_ejecuciones
            (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor, orden_id)
          VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                  'La orden de trabajo anterior sigue abierta.', NEW.valor, v_abierta);
          CONTINUE;
        END IF;
      END IF;

      -- ── Crear la OT ───────────────────────────────────────────────────────
      v_titulo := COALESCE(NULLIF(btrim(v_accion.config->>'titulo'), ''),
                           v_medidor.nombre || ' — automatización');

      -- `descripcion` es NOT NULL en ordenes_trabajo, así que siempre hay texto:
      -- el del usuario, o el hecho que disparó. Nunca cadena vacía sola.
      v_desc := COALESCE(NULLIF(btrim(v_accion.config->>'descripcion'), ''), '')
        || CASE WHEN COALESCE(btrim(v_accion.config->>'descripcion'), '') = '' THEN '' ELSE E'\n\n' END
        || format('Generada por automatización: %s marcó %s %s el %s.',
             v_medidor.nombre,
             rtrim(trim(to_char(NEW.valor, 'FM999999990.999')), '.'),
             v_medidor.unidad,
             to_char(NEW.ts AT TIME ZONE 'America/Santiago', 'DD/MM/YYYY HH24:MI'));

      SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
        FROM public.ordenes_trabajo
       WHERE workspace_id = v_medidor.workspace_id;

      INSERT INTO public.ordenes_trabajo (
        workspace_id, creado_por, titulo, descripcion,
        tipo, tipo_trabajo, estado, prioridad,
        activo_id, ubicacion_id, medidor_id, automatizacion_id,
        asignados_ids, categoria_ids, tiempo_estimado,
        numero, origen
      ) VALUES (
        v_medidor.workspace_id,
        -- A nombre de quien creó la automatización: es lo más cercano a un
        -- responsable que se puede afirmar sin inventar un usuario de sistema.
        v_trigger.auto_creado_por,
        v_titulo,
        v_desc,
        'solicitud',
        COALESCE(NULLIF(v_accion.config->>'tipo_trabajo', ''), 'reactiva'),
        'pendiente',
        COALESCE(NULLIF(v_accion.config->>'prioridad', ''), 'media'),
        -- El activo de la config manda; si no hay, el del medidor. Un medidor
        -- sin activo y sin activo en la config deja la OT sin activo, que es
        -- válido (a diferencia del motor viejo, que en ese caso no disparaba).
        COALESCE((v_accion.config->>'activo_id')::uuid, v_medidor.activo_id),
        COALESCE((v_accion.config->>'ubicacion_id')::uuid, v_medidor.ubicacion_id),
        NEW.medidor_id,
        v_trigger.auto_id,
        CASE WHEN v_accion.config ? 'asignados_ids'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_accion.config->'asignados_ids')::uuid)
             ELSE NULL END,
        CASE WHEN v_accion.config ? 'categoria_ids'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_accion.config->'categoria_ids')::uuid)
             ELSE NULL END,
        NULLIF(v_accion.config->>'tiempo_estimado', '')::integer,
        v_numero,
        'medidor'
      )
      RETURNING id INTO v_orden;

      INSERT INTO public.automatizacion_ejecuciones
        (automatizacion_id, accion_id, lectura_id, resultado, valor, orden_id)
      VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'ejecutada', NEW.valor, v_orden);

      -- El latch se baja recién acá: si un freno cortó arriba, la condición
      -- sigue pendiente y la próxima lectura la vuelve a evaluar.
      IF v_trigger.modo = 'una_lectura_reset' THEN
        UPDATE public.automatizacion_triggers SET armado = false WHERE id = v_trigger.id;
      END IF;
    END LOOP;

    UPDATE public.automatizaciones
       SET ultima_ejecucion_at = now()
     WHERE id = v_trigger.auto_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automatizacion_lectura ON public.medidor_lecturas;
CREATE TRIGGER trg_automatizacion_lectura
  AFTER INSERT ON public.medidor_lecturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_automatizacion_lectura();

-- ── Retirada del motor viejo ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_medidor_lectura_critica ON public.medidor_lecturas;
DROP FUNCTION IF EXISTS public.fn_medidor_lectura_critica();

-- Los umbrales dejan de existir en los medidores manuales: ahí la vigilancia se
-- configura como automatización. En los automatizados se quedan (el gateway los
-- usa para colorear la serie), por eso las columnas NO se borran.
UPDATE public.medidores
   SET advertencia = NULL, critico = NULL, intervalo_ot = NULL
 WHERE tipo = 'manual'
   AND (advertencia IS NOT NULL OR critico IS NOT NULL OR intervalo_ot IS NOT NULL);
```

- [ ] **Step 2: Verify the old trigger is gone and the new one exists**

Apply locally (`supabase db reset --local`), then:

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.medidor_lecturas'::regclass AND NOT tgisinternal;
```

Expected: `trg_automatizacion_lectura` present, `trg_medidor_lectura_critica` absent.

- [ ] **Step 3: Commit**

```bash
cd /c/dev/pangui
git add supabase/migrations/20260914110000_automatizaciones_motor.sql
git commit -m "feat(automatizaciones): motor configurable, retira el disparo soldado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: pgTAP test for the engine

Written after the engine rather than before it because pgTAP cannot run until the
schema exists. It is still a gate: Task 4 does not start until this passes.

**Files:**
- Create: `supabase/tests/automatizaciones.test.sql`

**Interfaces:**
- Consumes: the engine from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test**

Create `supabase/tests/automatizaciones.test.sql`. Fixture shape copied from
`supabase/tests/work_order_commands_v1.test.sql:1-30`:

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(9);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'auto-owner@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('20000000-0000-0000-0000-0000000000a1', 'WS automatizaciones'),
       ('20000000-0000-0000-0000-0000000000a2', 'WS sin plan');

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES ('10000000-0000-0000-0000-0000000000a1', 'Owner auto', 'owner',
        '20000000-0000-0000-0000-0000000000a1', true);

-- El motor exige plan Empresa vigente.
INSERT INTO public.subscriptions (workspace_id, plan_key, status)
VALUES ('20000000-0000-0000-0000-0000000000a1', 'enterprise', 'active'),
       ('20000000-0000-0000-0000-0000000000a2', 'pro', 'active');

INSERT INTO public.activos (id, nombre, workspace_id)
VALUES ('30000000-0000-0000-0000-0000000000a1', 'Motor 1', '20000000-0000-0000-0000-0000000000a1'),
       ('30000000-0000-0000-0000-0000000000a2', 'Motor 2', '20000000-0000-0000-0000-0000000000a2');

INSERT INTO public.medidores (id, workspace_id, nombre, tipo, unidad, activo_id, creado_por)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
        'Corriente', 'manual', 'A', '30000000-0000-0000-0000-0000000000a1',
        '10000000-0000-0000-0000-0000000000a1'),
       ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2',
        'Corriente sin plan', 'manual', 'A', '30000000-0000-0000-0000-0000000000a2', NULL);

INSERT INTO public.automatizaciones (id, workspace_id, nombre, creado_por)
VALUES ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
        'Corriente alta', '10000000-0000-0000-0000-0000000000a1');

INSERT INTO public.automatizacion_triggers (id, automatizacion_id, medidor_id, operador, valor)
VALUES ('60000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1',
        '40000000-0000-0000-0000-0000000000a1', 'mayor_igual', 10);

-- retrigger 0 para poder probar los frenos de a uno.
INSERT INTO public.automatizacion_acciones (id, automatizacion_id, tipo, config, retrigger_minutos)
VALUES ('70000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1',
        'crear_ot', '{"titulo":"Revisar motor","prioridad":"alta"}'::jsonb, 0);

-- ── 1. Una lectura que cumple abre una OT ───────────────────────────────────
INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 12);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  1, 'una lectura que cumple abre exactamente una OT');

SELECT extensions.is(
  (SELECT titulo FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1' LIMIT 1),
  'Revisar motor', 'la OT toma el título de la config');

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.automatizacion_ejecuciones
    WHERE resultado = 'ejecutada'),
  1, 'se registra una ejecución');

-- ── 2. Una lectura que no cumple no hace nada ───────────────────────────────
INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 3);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  1, 'una lectura bajo el umbral no abre OT');

-- ── 3. solo_si_anterior_cerrada omite mientras la OT siga abierta ───────────
UPDATE public.automatizacion_acciones
   SET solo_si_anterior_cerrada = true
 WHERE id = '70000000-0000-0000-0000-0000000000a1';

INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 15);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  1, 'no abre una segunda OT mientras la anterior sigue abierta');

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.automatizacion_ejecuciones
    WHERE resultado = 'omitida' AND detalle = 'La orden de trabajo anterior sigue abierta.'),
  1, 'la omisión queda registrada con su motivo');

-- Cerrada la anterior, la siguiente lectura sí abre otra.
UPDATE public.ordenes_trabajo SET estado = 'completado'
 WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1';

INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 16);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  2, 'con la anterior cerrada vuelve a abrir');

-- ── 4. Una automatización pausada no dispara ────────────────────────────────
UPDATE public.automatizacion_acciones SET solo_si_anterior_cerrada = false
 WHERE id = '70000000-0000-0000-0000-0000000000a1';
UPDATE public.ordenes_trabajo SET estado = 'completado'
 WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1';
UPDATE public.automatizaciones SET activa = false
 WHERE id = '50000000-0000-0000-0000-0000000000a1';

INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 20);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  2, 'una automatización pausada no dispara');

-- ── 5. El motor viejo ya no existe ──────────────────────────────────────────
SELECT extensions.is(
  (SELECT count(*)::integer FROM pg_trigger
    WHERE tgrelid = 'public.medidor_lecturas'::regclass
      AND tgname = 'trg_medidor_lectura_critica'),
  0, 'el trigger de umbrales soldados fue retirado');

SELECT * FROM extensions.finish();
ROLLBACK;
```

- [ ] **Step 2: Run the test**

```bash
cd /c/dev/pangui && supabase test db
```

Expected: `automatizaciones.test.sql .. ok`, 9 of 9 passing.

If a fixture INSERT fails on a NOT NULL column this plan did not anticipate, read
the error, add the column to that INSERT, and re-run. Do not weaken an assertion
to make it pass.

- [ ] **Step 3: Commit**

```bash
cd /c/dev/pangui
git add supabase/tests/automatizaciones.test.sql
git commit -m "test(automatizaciones): pgTAP del motor y sus dos frenos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `lib/automatizaciones-api.ts`

**Files:**
- Create: `lib/automatizaciones-api.ts`
- Create: `tests/lib/automatizaciones-api.test.ts`

**Interfaces:**
- Consumes: tables from Task 1.
- Produces:
  - types `Automatizacion`, `AutomatizacionTrigger`, `AutomatizacionAccion`,
    `AutomatizacionEjecucion`, `AutomatizacionCompleta`, `OperadorTrigger`,
    `ModoTrigger`, `ConfigCrearOT`
  - `fetchAutomatizaciones(workspaceId: string): Promise<AutomatizacionCompleta[]>`
  - `fetchEjecuciones(automatizacionId: string, limite?: number): Promise<AutomatizacionEjecucion[]>`
  - `createAutomatizacion(workspaceId: string, input: AutomatizacionInput): Promise<Automatizacion>`
  - `updateAutomatizacion(id: string, input: AutomatizacionInput): Promise<void>`
  - `toggleAutomatizacion(id: string, activa: boolean): Promise<void>`
  - `deleteAutomatizacion(id: string): Promise<void>`
  - `describirTrigger(t: Pick<AutomatizacionTrigger, "operador" | "valor" | "valor_hasta">, unidad: string): string`
  - const arrays `OPERADORES` and `MODOS` (used by Task 7's selects)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/automatizaciones-api.test.ts`. Only the pure helper is unit
tested; the fetch functions are thin PostgREST wrappers whose value is covered by
the pgTAP suite.

```typescript
import { describe, it, expect } from "vitest";
import { describirTrigger } from "@/lib/automatizaciones-api";

describe("describirTrigger", () => {
  it("describe un mayor o igual", () => {
    expect(describirTrigger(
      { operador: "mayor_igual", valor: 10, valor_hasta: null } as never, "A",
    )).toBe("es mayor o igual a 10 A");
  });

  it("describe un rango", () => {
    expect(describirTrigger(
      { operador: "entre", valor: 5, valor_hasta: 9 } as never, "mm/s",
    )).toBe("está entre 5 y 9 mm/s");
  });

  it("no deja espacio colgando cuando el medidor no tiene unidad", () => {
    expect(describirTrigger(
      { operador: "igual", valor: 3, valor_hasta: null } as never, "",
    )).toBe("es igual a 3");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/dev/pangui && npx vitest run tests/lib/automatizaciones-api.test.ts`
Expected: FAIL — cannot resolve `@/lib/automatizaciones-api`.

- [ ] **Step 3: Write the module**

Create `lib/automatizaciones-api.ts`:

```typescript
/**
 * Automatizaciones: la regla configurable medidor → acción.
 *
 * Reemplaza a los umbrales soldados que vivían en `medidores` (advertencia,
 * critico, intervalo_ot). Acá solo se guarda y se lee la configuración: el
 * disparo ocurre en el trigger `fn_automatizacion_lectura`, porque una lectura
 * entra por tres clientes distintos y los tres tienen que disparar igual.
 * Ver 20260914110000_automatizaciones_motor.sql.
 */

import { createClient } from "@/lib/supabase";

export type OperadorTrigger = "mayor_igual" | "menor_igual" | "igual" | "entre";
export type ModoTrigger = "una_lectura" | "una_lectura_reset" | "lecturas_multiples";
export type TipoAccion = "crear_ot" | "crear_solicitud" | "cambiar_estado_activo" | "enviar_notificacion";
export type ResultadoEjecucion = "ejecutada" | "omitida" | "fallida";

export interface Automatizacion {
  id: string;
  workspace_id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  ultima_ejecucion_at: string | null;
  creado_por: string | null;
  created_at: string;
}

export interface AutomatizacionTrigger {
  id: string;
  automatizacion_id: string;
  medidor_id: string;
  operador: OperadorTrigger;
  valor: number;
  valor_hasta: number | null;
  modo: ModoTrigger;
  modo_n: number | null;
  armado: boolean;
}

/** Campos de la OT que la acción deja preparados. Es el `config` jsonb. */
export interface ConfigCrearOT {
  titulo?: string;
  descripcion?: string;
  activo_id?: string | null;
  ubicacion_id?: string | null;
  asignados_ids?: string[];
  categoria_ids?: string[];
  /** Minutos. La UI pide horas + minutos y los suma acá. */
  tiempo_estimado?: number | null;
  prioridad?: string;
  tipo_trabajo?: string;
}

export interface AutomatizacionAccion {
  id: string;
  automatizacion_id: string;
  tipo: TipoAccion;
  config: ConfigCrearOT;
  retrigger_minutos: number;
  solo_si_anterior_cerrada: boolean;
  orden: number;
}

export interface AutomatizacionEjecucion {
  id: string;
  automatizacion_id: string;
  accion_id: string | null;
  lectura_id: string | null;
  resultado: ResultadoEjecucion;
  detalle: string | null;
  valor: number | null;
  orden_id: string | null;
  created_at: string;
}

/** Una automatización con sus hijos, que es como la muestra la ficha. */
export interface AutomatizacionCompleta extends Automatizacion {
  triggers: AutomatizacionTrigger[];
  acciones: AutomatizacionAccion[];
}

const OPERADOR_TEXTO: Record<OperadorTrigger, string> = {
  mayor_igual: "es mayor o igual a",
  menor_igual: "es menor o igual a",
  igual:       "es igual a",
  entre:       "está entre",
};

export const OPERADORES: { value: OperadorTrigger; label: string }[] = [
  { value: "mayor_igual", label: "Es mayor o igual a" },
  { value: "menor_igual", label: "Es menor o igual a" },
  { value: "igual",       label: "Es igual a" },
  { value: "entre",       label: "Está entre" },
];

export const MODOS: { value: ModoTrigger; label: string; ayuda: string }[] = [
  { value: "una_lectura", label: "Una lectura",
    ayuda: "Se activa cada vez que una lectura cumple la condición." },
  { value: "una_lectura_reset", label: "Una lectura, luego reiniciar",
    ayuda: "No se vuelve a activar hasta que la condición se despeje y se cumpla de nuevo." },
  { value: "lecturas_multiples", label: "Lecturas múltiples",
    ayuda: "Se activa cuando un número definido de las últimas lecturas cumplen la condición." },
];

/**
 * La condición en castellano, para la lista y la ficha.
 *
 * La unidad se concatena solo si existe: un medidor sin unidad dejaba
 * "es igual a 3 " con el espacio colgando.
 */
export function describirTrigger(
  t: Pick<AutomatizacionTrigger, "operador" | "valor" | "valor_hasta">,
  unidad: string,
): string {
  const sufijo = unidad ? ` ${unidad}` : "";
  if (t.operador === "entre") {
    return `${OPERADOR_TEXTO.entre} ${t.valor} y ${t.valor_hasta}${sufijo}`;
  }
  return `${OPERADOR_TEXTO[t.operador]} ${t.valor}${sufijo}`;
}

const AUTO_SELECT = `
  id, workspace_id, nombre, descripcion, activa, ultima_ejecucion_at, creado_por, created_at,
  automatizacion_triggers ( id, automatizacion_id, medidor_id, operador, valor, valor_hasta, modo, modo_n, armado ),
  automatizacion_acciones ( id, automatizacion_id, tipo, config, retrigger_minutos, solo_si_anterior_cerrada, orden )
`;

/** Todas las del espacio, con sus disparadores y acciones ya embebidos. */
export async function fetchAutomatizaciones(workspaceId: string): Promise<AutomatizacionCompleta[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("automatizaciones")
    .select(AUTO_SELECT)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Embebidos y no en tres consultas: la lista muestra la condición de cada
  // fila, así que resolverlos después costaría un viaje por automatización.
  return ((data ?? []) as unknown as (Automatizacion & {
    automatizacion_triggers: AutomatizacionTrigger[];
    automatizacion_acciones: AutomatizacionAccion[];
  })[]).map(({ automatizacion_triggers, automatizacion_acciones, ...resto }) => ({
    ...resto,
    triggers: automatizacion_triggers ?? [],
    acciones: (automatizacion_acciones ?? []).sort((a, b) => a.orden - b.orden),
  }));
}

/** El panel "Historia de la acción", de la más nueva hacia atrás. */
export async function fetchEjecuciones(
  automatizacionId: string,
  limite = 30,
): Promise<AutomatizacionEjecucion[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("automatizacion_ejecuciones")
    .select("id, automatizacion_id, accion_id, lectura_id, resultado, detalle, valor, orden_id, created_at")
    .eq("automatizacion_id", automatizacionId)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return (data ?? []) as unknown as AutomatizacionEjecucion[];
}

export interface AutomatizacionInput {
  nombre: string;
  descripcion?: string | null;
  triggers: {
    medidor_id: string;
    operador: OperadorTrigger;
    valor: number;
    valor_hasta?: number | null;
    modo: ModoTrigger;
    modo_n?: number | null;
  }[];
  acciones: {
    tipo: TipoAccion;
    config: ConfigCrearOT;
    retrigger_minutos: number;
    solo_si_anterior_cerrada: boolean;
  }[];
}

export async function createAutomatizacion(
  workspaceId: string,
  input: AutomatizacionInput,
): Promise<Automatizacion> {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  const { data, error } = await sb
    .from("automatizaciones")
    .insert({
      workspace_id: workspaceId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      creado_por: auth.user?.id ?? null,
    })
    .select("id, workspace_id, nombre, descripcion, activa, ultima_ejecucion_at, creado_por, created_at")
    .single();

  if (error) throw error;
  const auto = data as unknown as Automatizacion;

  await insertarHijos(auto.id, input);
  return auto;
}

/**
 * Guarda los cambios reemplazando disparadores y acciones.
 *
 * Se borran y se reinsertan en vez de hacer un diff: la ficha edita el conjunto
 * completo, y un diff por id significaría mantener la correspondencia en el
 * formulario para ahorrar dos DELETE. El historial no se toca —cuelga de la
 * automatización, no de la acción— salvo por `accion_id`, que queda NULL por el
 * ON DELETE SET NULL, que es justo lo que corresponde: esa acción ya no existe.
 */
export async function updateAutomatizacion(id: string, input: AutomatizacionInput): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("automatizaciones")
    .update({ nombre: input.nombre.trim(), descripcion: input.descripcion?.trim() || null })
    .eq("id", id);
  if (error) throw error;

  const { error: eT } = await sb.from("automatizacion_triggers").delete().eq("automatizacion_id", id);
  if (eT) throw eT;
  const { error: eA } = await sb.from("automatizacion_acciones").delete().eq("automatizacion_id", id);
  if (eA) throw eA;

  await insertarHijos(id, input);
}

async function insertarHijos(id: string, input: AutomatizacionInput): Promise<void> {
  const sb = createClient();

  const { error: eT } = await sb.from("automatizacion_triggers").insert(
    input.triggers.map(t => ({
      automatizacion_id: id,
      medidor_id: t.medidor_id,
      operador: t.operador,
      valor: t.valor,
      // La constraint exige NULL fuera de 'entre' y un valor dentro.
      valor_hasta: t.operador === "entre" ? (t.valor_hasta ?? null) : null,
      modo: t.modo,
      modo_n: t.modo === "lecturas_multiples" ? (t.modo_n ?? 2) : null,
    })),
  );
  if (eT) throw eT;

  if (input.acciones.length === 0) return;

  const { error: eA } = await sb.from("automatizacion_acciones").insert(
    input.acciones.map((a, i) => ({
      automatizacion_id: id,
      tipo: a.tipo,
      config: a.config,
      retrigger_minutos: a.retrigger_minutos,
      solo_si_anterior_cerrada: a.solo_si_anterior_cerrada,
      orden: i,
    })),
  );
  if (eA) throw eA;
}

export async function toggleAutomatizacion(id: string, activa: boolean): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("automatizaciones").update({ activa }).eq("id", id);
  if (error) throw error;
}

/** Borrado real: los hijos caen por CASCADE y el historial con ellos. */
export async function deleteAutomatizacion(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("automatizaciones").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run the test**

Run: `cd /c/dev/pangui && npx vitest run tests/lib/automatizaciones-api.test.ts`
Expected: PASS, 3 of 3.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/pangui
git add lib/automatizaciones-api.ts tests/lib/automatizaciones-api.test.ts
git commit -m "feat(automatizaciones): capa de datos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Extract the two shared selects

`SearchSelect` and `AssigneeSelect` are currently local to `OTCrearPanel.tsx` and
are exactly the controls the action form needs. Extract, don't copy.

**Files:**
- Create: `components/ordenes/SearchSelect.tsx`
- Create: `components/ordenes/AssigneeSelect.tsx`
- Modify: `app/(app)/ordenes/OTCrearPanel.tsx:230-343` (remove `SearchSelect`,
  import it), `:392-532` (remove `AssigneeSelect`, import it)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SearchSelect({ placeholder, value, options, onChange })` — `options` is
    `{ id: string; label: string }[]`, `value` is `string`, `onChange` is
    `(id: string) => void`. Default export from `components/ordenes/SearchSelect`.
  - `AssigneeSelect({ usuarios, value, onChange })` — `value` is `string[]`,
    `onChange` is `(ids: string[]) => void`. Default export from
    `components/ordenes/AssigneeSelect`.

- [ ] **Step 1: Read the exact current implementations**

Read `app/(app)/ordenes/OTCrearPanel.tsx` lines 228-343 and 390-532. Copy them
verbatim — including comments. Do not "improve" them while moving; a behaviour
change here shows up in OT creation, which is the app's hottest path.

- [ ] **Step 2: Create the two files**

Move each function into its own file, adding `"use client";` at the top and
changing `function X(...)` to `export default function X(...)`. Carry over only
the imports each one actually uses (check for `useState`, `useRef`, `useEffect`,
lucide icons, and any style constants — if a style constant like `inputStyle` is
defined in OTCrearPanel, import it from `@/components/catalogo/PanelCatalogo`
instead if identical, otherwise copy the constant into the new file).

Add a header comment to each, e.g. for `SearchSelect.tsx`:

```typescript
/**
 * Selector con búsqueda. Vivía dentro de OTCrearPanel.
 *
 * Salió de ahí porque el formulario de acción de una automatización necesita
 * exactamente este control —elegir un activo, una ubicación— y la alternativa
 * era una segunda copia que se separa de esta en cuanto alguien toca una.
 */
```

- [ ] **Step 3: Wire OTCrearPanel to the extracted versions**

Delete both function bodies from `OTCrearPanel.tsx` and add at the top with the
other component imports:

```typescript
import SearchSelect from "@/components/ordenes/SearchSelect";
import AssigneeSelect from "@/components/ordenes/AssigneeSelect";
```

- [ ] **Step 4: Verify nothing broke**

```bash
cd /c/dev/pangui && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && npm test 2>&1 | tail -15
```

Expected: no new type errors; the existing suite passes exactly as before this
task (same number of passing tests).

- [ ] **Step 5: Commit**

```bash
cd /c/dev/pangui
git add components/ordenes/SearchSelect.tsx components/ordenes/AssigneeSelect.tsx "app/(app)/ordenes/OTCrearPanel.tsx"
git commit -m "refactor(ordenes): extrae SearchSelect y AssigneeSelect para reuso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The `/automatizaciones` page

**Files:**
- Create: `app/(app)/automatizaciones/page.tsx`
- Create: `components/automatizaciones/AutomatizacionDetalle.tsx`

**Interfaces:**
- Consumes: everything from Task 4; `UpgradePrompt`, `useSuscripcion`,
  `useDeepLinkId`, `EmptyState`/`EmptyDetail`, and the style constants
  `btnSecundario`, `btnIcono`, `seccionDetalle` from
  `@/components/catalogo/PanelCatalogo`.
- Produces: route `/automatizaciones`; `AutomatizacionDetalle({ automatizacion,
  medidores, onEditar, onEliminar, onToggle })`.

- [ ] **Step 1: Build the page shell with the plan gate**

Create `app/(app)/automatizaciones/page.tsx`. Copy the master-detail skeleton
from `app/(app)/medidores/page.tsx` — the resizable list (`LIST_WIDTH_KEY`,
`DEFAULT_LIST_WIDTH` 380, `MIN_LIST_WIDTH` 300, `MIN_DETAIL_WIDTH` 480), the
`useDeepLinkId("/automatizaciones")` wiring, and the loading/gate wrapper.

The gate, mirroring `app/(app)/medidores/page.tsx:80-100`:

```typescript
export default function AutomatizacionesPage() {
  const suscripcion = useSuscripcion();
  if (suscripcion.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.automatizaciones) {
    return (
      <UpgradePrompt
        variant="card"
        title="Las automatizaciones están disponibles en Empresa"
        description="Deja escrita la regla una vez —si este medidor pasa de tal valor, abre esta orden de trabajo asignada a esta persona— y el sistema la aplica solo, con el registro de cada vez que actuó."
        upgradeTo="Empresa"
      />
    );
  }
  return <AutomatizacionesPageInner />;
}
```

Use `Workflow` from lucide-react as the section icon.

- [ ] **Step 2: Build the list**

Inside `AutomatizacionesPageInner`, load with TanStack Query:

```typescript
const { data: automatizaciones = [], isLoading } = useQuery({
  queryKey: ["automatizaciones", wsId],
  queryFn: () => fetchAutomatizaciones(wsId!),
  enabled: !!wsId,
});
```

Each row shows: the `Workflow` icon, `nombre`, an "Activada"/"Pausada" chip
(`var(--success)` / `var(--fg-4)`), and `Última ejecución: <fecha>` or
`Sin ejecuciones` when `ultima_ejecucion_at` is null. Format dates with
`toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric",
hour: "2-digit", minute: "2-digit" })`, same as `fmtFecha` in the medidores page.

Empty state via `EmptyState`: title `"Todavía no hay automatizaciones"`,
description `"Una automatización vigila un medidor y actúa sola: abre la orden
de trabajo en cuanto la lectura cruza el valor que definas."`

- [ ] **Step 3: Build the detail panel**

Create `components/automatizaciones/AutomatizacionDetalle.tsx`, following the
layout of the screenshots:

1. Header: name, `Editar` button (`btnSecundario`), overflow menu with `Eliminar`.
2. `Habilitar la automatización` — a toggle calling `toggleAutomatizacion`, then
   `queryClient.invalidateQueries({ queryKey: ["automatizaciones"] })`.
3. **Activador** section: for each trigger, `Cuando: <medidor> <describirTrigger>`,
   plus `Para: <modo label>` from `MODOS`.
4. **Acción** section: `Crear una orden de trabajo`, the subtitle
   `Ejecutar como máximo una vez cada N minutos` (omit when
   `retrigger_minutos === 0`), then the config fields that are set — título,
   activo, asignados, prioridad.
5. **Historia de la acción**: `fetchEjecuciones(id)` in its own query. One row per
   execution: timestamp, `<valor> <unidad>`, a result chip, and for `ejecutada`
   a `Ver orden de trabajo` link to `/ordenes?id=<orden_id>`. For `omitida` show
   `detalle` in `var(--fg-3)` — that text is the whole point of the panel.

Wrap each block in `seccionDetalle`.

- [ ] **Step 4: Verify in the browser**

```bash
cd /c/dev/pangui && npm run dev
```

Visit `http://localhost:3000/automatizaciones`. On a non-Empresa workspace expect
the upgrade card. To check the real screen, temporarily set the workspace's
subscription to enterprise in the DB, confirm the list renders, then set it back.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/pangui
git add "app/(app)/automatizaciones" components/automatizaciones
git commit -m "feat(automatizaciones): pantalla maestro-detalle con historial

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The builder

**Files:**
- Create: `components/automatizaciones/AutomatizacionCrearPanel.tsx`
- Modify: `app/(app)/automatizaciones/page.tsx` (mount it for create and edit)

**Interfaces:**
- Consumes: `createAutomatizacion`, `updateAutomatizacion`, `OPERADORES`,
  `MODOS`, `ConfigCrearOT` from Task 4; `SearchSelect` and `AssigneeSelect` from
  Task 5; `FieldRow`, `inputStyle`, `textareaStyle` from
  `@/components/catalogo/PanelCatalogo`.
- Produces: `AutomatizacionCrearPanel({ wsId, inicial, medidores, activos,
  ubicaciones, usuarios, categorias, onClose, onGuardada })` — default export.
  `inicial` is `AutomatizacionCompleta | null` (null = create).

- [ ] **Step 1: Build the form skeleton**

Three sections in the order of the reference: **Activador**, **Condiciones**,
**Acciones**. Header holds the name input (styled with `tituloInputStyle` from
PanelCatalogo) and a description textarea. Footer holds `Cancelar` and
`Crear` / `Guardar`, matching `MedidorCrearPanel`'s footer.

The **Condiciones** section renders a disabled placeholder — the spec ships none:

```tsx
<div style={seccionDetalle}>
  <label style={labelStyle}>Condiciones</label>
  <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
    Por ahora la automatización se ejecuta siempre que el disparador se cumple.
  </p>
</div>
```

- [ ] **Step 2: Build the trigger editor**

State: `triggers: { medidor_id, operador, valor, valor_hasta, modo, modo_n }[]`,
starting with one empty row.

Per row: a `SearchSelect` of meters (label `` `${m.nombre}${m.activo_nombre ? ` · ${m.activo_nombre}` : ""}` ``),
a `<select>` of `OPERADORES`, a numeric input for `valor`, a second numeric input
for `valor_hasta` shown **only** when `operador === "entre"`, and a `<select>` of
`MODOS` with the selected mode's `ayuda` beneath in `var(--fg-4)`. When
`modo === "lecturas_multiples"`, a numeric input for `modo_n` (min 2, default 2).

Below the rows: `+ Añadir disparador`, appending another row. Each row past the
first gets a trash button.

Show the meter's `unidad` as a suffix inside the value inputs, the same way
`MedidorCrearPanel.tsx:510-514` does it.

- [ ] **Step 3: Build the action form**

One action in v1, `tipo: "crear_ot"`, always present. Fields in the reference's
order, each in a `FieldRow`:

| Field | Control | Maps to |
|---|---|---|
| Título | text input | `config.titulo` |
| Descripción | textarea | `config.descripcion` |
| Ubicación | `SearchSelect` | `config.ubicacion_id` |
| Activo | `SearchSelect` | `config.activo_id` |
| Asignar a | `AssigneeSelect` | `config.asignados_ids` |
| Tiempo estimado | two numeric inputs, Horas + Minutos | `config.tiempo_estimado` |
| Prioridad | segmented buttons | `config.prioridad` |
| Categorías | `CategoriaMultiSelect` | `config.categoria_ids` |

Tiempo estimado is stored as **one integer in minutes**:

```typescript
const tiempoEstimado = (Number(horas) || 0) * 60 + (Number(minutos) || 0);
// 0 se guarda como null: "sin estimación" y "estimado en cero" no son lo mismo.
config.tiempo_estimado = tiempoEstimado > 0 ? tiempoEstimado : null;
```

Prioridad options are `ninguna | baja | media | alta | urgente` — reuse the
`PRIORIDADES` shape from `OTCrearPanel.tsx:185-191`. Note the reference screenshot
shows only four; Pangui has five, and matching Pangui wins.

Below the fields, the two brakes:

```tsx
<label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-2)" }}>
  <input type="checkbox" checked={soloSiCerrada}
    onChange={e => setSoloSiCerrada(e.target.checked)} />
  Crear sólo si la orden de trabajo anterior de esta automatización está cerrada
</label>
```

and a numeric input for `retrigger_minutos`, labelled
`Ejecutar como máximo una vez cada … minutos`, defaulting to `5`, with the help
text: `Evita que una condición sostenida abra una orden por cada lectura.`

- [ ] **Step 4: Validate and save**

Before submitting, in this order, setting a single `err` string:

```typescript
if (!nombre.trim()) return setErr("Ponle un nombre a la automatización.");
if (triggers.some(t => !t.medidor_id)) return setErr("Elige el medidor de cada disparador.");
if (triggers.some(t => !Number.isFinite(Number(t.valor))))
  return setErr("El valor del disparador tiene que ser un número.");
if (triggers.some(t => t.operador === "entre" &&
    !(Number(t.valor_hasta) > Number(t.valor))))
  return setErr("En un rango, el segundo valor tiene que ser mayor que el primero.");
if (!config.titulo?.trim()) return setErr("La orden de trabajo necesita un título.");
```

Then call `createAutomatizacion(wsId, input)` or `updateAutomatizacion(id, input)`,
invalidate `["automatizaciones"]`, and call `onGuardada()`.

The `entre` check mirrors the DB constraint `automatizacion_triggers_hasta_solo_en_entre`.
Both exist on purpose: the constraint is the guarantee, this is the readable error.

- [ ] **Step 5: Verify end to end**

With the dev server on an enterprise workspace: create an automation on a manual
meter with `mayor_igual 10`, then register a reading of `12` from `/medidores`.
Confirm a work order appears in `/ordenes` with the configured title, and that
the automation's "Historia de la acción" shows one `ejecutada` row linking to it.
Then register `13` immediately and confirm a second row appears as `omitida`
citing the retrigger.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/pangui
git add components/automatizaciones "app/(app)/automatizaciones/page.tsx"
git commit -m "feat(automatizaciones): constructor de disparador y accion

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Sidebar entry

**Files:**
- Modify: `components/AppSidebar.tsx:31` (icon import), `:267` (feature flag),
  `:456-465` (insert the item after Medidores)

**Interfaces:**
- Consumes: the `automatizaciones` plan flag from Task 1; route from Task 6.
- Produces: nothing.

- [ ] **Step 1: Add the icon import**

In the lucide-react import block (around line 31, where `Gauge` is), add
`Workflow` in alphabetical position.

- [ ] **Step 2: Add the feature flag**

After line 267 (`const hasMedidores = ...`):

```typescript
  const hasAutomatizaciones = !planFeatures || planFeatures.automatizaciones;
```

- [ ] **Step 3: Add the nav item**

Immediately after the Medidores `SidebarMenuItem` (which closes at line 465):

```tsx
              {/* Automatizaciones: la regla que convierte una lectura en trabajo.
                  Va pegada a Medidores porque hoy todo disparador es una lectura.
                  Con gate de admin —igual que Planes de mantención— porque es
                  configuración del espacio, no trabajo del día a día. */}
              {isAdmin && hasAutomatizaciones && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/automatizaciones")} tooltip="Automatizaciones">
                    <Link href="/automatizaciones" prefetch={false} style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <Workflow size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Automatizaciones</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
```

- [ ] **Step 4: Verify**

With the dev server running, confirm: on an enterprise workspace signed in as
owner/admin the item appears under Medidores and highlights when active; on a Pro
workspace it is absent; signed in as a `member` it is absent.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/pangui
git add components/AppSidebar.tsx
git commit -m "feat(automatizaciones): entrada en el sidebar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Retire the thresholds from the manual meter form (web + mobile)

**Files:**
- Modify: `components/medidores/MedidorCrearPanel.tsx:487-566`
- Modify: `C:\dev\pangui-native-stable\app\(stack)\medidor\form.tsx:342-398`
  and `:71-76`, `:87-91`, `:128-190`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Web — make the threshold sections conditional**

In `components/medidores/MedidorCrearPanel.tsx`, wrap **both** the
`Ajustes de umbral` section (starts line 487) and the
`Mantenimiento por uso (opcional)` section (starts line 524) in a single
`{tipo === "automatizado" && ( ... )}` block, with this comment above it:

```tsx
            {/* Los umbrales quedaron solo en los automatizados. En un medidor
                manual la vigilancia se configura en /automatizaciones, que hace
                lo mismo y además deja elegir qué OT se abre y para quién. Dos
                lugares donde escribir "avísame si pasa de 10" era la garantía de
                que un día abrieran dos OT por la misma lectura. */}
            {tipo === "automatizado" && (
              <>
                {/* … las dos secciones tal cual … */}
              </>
            )}
```

**Also fix the help text at line 490.** It currently reads:

> Al superar la alarma, Pangui abre una OT de emergencia sobre este activo.
> Déjalos vacíos si el medidor solo registra.

That is now false for **every** meter type. Task 2 dropped
`fn_medidor_lectura_critica`, so nothing opens a work order from these columns
any more; all they still do is drive `nivelDeLectura()`, which colours the
reading in the chart and the list. Replace it with:

```tsx
                Pintan la lectura en el gráfico y en la lista según en qué franja
                caiga. Para que un valor abra una orden de trabajo, configúralo
                en Automatizaciones. Déjalos vacíos si el medidor solo registra.
```

Leave the `advertencia`/`alarma`/`intervalo` state and the validation at
lines 229-246 untouched: when the section is hidden the values stay `""` and
resolve to `null`, which is the desired write.

- [ ] **Step 2: Mobile — delete the two sections**

In `C:\dev\pangui-native-stable\app\(stack)\medidor\form.tsx`, this form creates
**manual meters only** (there is no `tipo` field), so the sections go away rather
than becoming conditional:

- Delete the `Umbrales` `GroupedSection` (lines 342-363).
- Delete the `Mantenimiento por uso` `GroupedSection` (lines 377-398).
- Delete the now-unused state: `advertencia`, `critico`, `intervalo`,
  `lecturaInicial` (lines 71-76) and their hydration (lines 87-91).
- Delete the threshold validation and the `advertencia` / `critico` /
  `intervalo_ot` keys from the save payload (lines 128-190). Keep the payload's
  other fields exactly as they are.

Add above the remaining sections:

```tsx
        {/* Los umbrales salieron de acá: la vigilancia de un medidor manual se
            configura en Automatizaciones, en la web. Dejar el campo en el móvil
            escribiría una regla que el motor ya no lee. */}
```

- [ ] **Step 3: Verify both compile**

```bash
cd /c/dev/pangui && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
cd /c/dev/pangui-native-stable && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no errors, and specifically no "declared but never read" for the
deleted mobile state.

- [ ] **Step 4: Verify by hand**

Web: open the meter create panel, choose `Manual` — no threshold sections; switch
to `Automatizado` — both appear.
Mobile: open the meter form — no Umbrales, no Mantenimiento por uso; saving a
meter still works.

- [ ] **Step 5: Commit both repos**

```bash
cd /c/dev/pangui
git add components/medidores/MedidorCrearPanel.tsx
git commit -m "refactor(medidores): umbrales solo en medidores automatizados

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"

cd /c/dev/pangui-native-stable
git add "app/(stack)/medidor/form.tsx"
git commit -m "refactor(medidores): retira umbrales del formulario manual

La vigilancia de un medidor manual pasa a Automatizaciones (web).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Apply to production and verify

Migrations have only been applied locally up to here.

**Files:** none.

- [ ] **Step 1: Re-read both migrations before applying**

Read `20260914100000_automatizaciones.sql` and `20260914110000_automatizaciones_motor.sql`
end to end. The second one **drops a live trigger and nulls columns** — confirm
the UPDATE is scoped `WHERE tipo = 'manual'` and nothing else touches existing
rows.

- [ ] **Step 2: Record what the change will destroy**

```sql
SELECT id, nombre, tipo, advertencia, critico, intervalo_ot
  FROM public.medidores WHERE tipo = 'manual'
    AND (advertencia IS NOT NULL OR critico IS NOT NULL OR intervalo_ot IS NOT NULL);
```

Expected today: one row, "Temperatura carcasa" (adv 70, crítico 85). Save the
output in the PR description — it is not recoverable afterwards.

- [ ] **Step 3: Apply**

Use the `apply_migration` MCP tool, one migration at a time, first
`20260914100000_automatizaciones`, then `20260914110000_automatizaciones_motor`.

- [ ] **Step 4: Verify production**

```sql
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.medidor_lecturas'::regclass AND NOT tgisinternal;

SELECT count(*) FROM public.medidores
 WHERE tipo = 'manual' AND (advertencia IS NOT NULL OR critico IS NOT NULL);
```

Expected: only `trg_automatizacion_lectura`; count `0`.

- [ ] **Step 5: Smoke test on the real thing**

On the Test workspace (set it to `enterprise` first if it is not), create an
automation on the "Corriente de motor" meter with `mayor_igual 10`, register a
reading of `12`, confirm the work order and the history row, then delete both and
restore the workspace's plan.

- [ ] **Step 6: Commit and open the PR**

```bash
cd /c/dev/pangui
git push -u origin HEAD
gh pr create --title "Automatizaciones: medidor → orden de trabajo" --body "$(cat <<'EOF'
## Qué hace

Reemplaza el disparo soldado de medidores (`fn_medidor_lectura_critica`) por un
motor configurable trigger → acción, con UI en `/automatizaciones`, gate de plan
Empresa e historial de ejecuciones que registra también las omisiones.

## Qué cambia para quien ya usaba medidores

- Los umbrales (`advertencia`, `critico`, `intervalo_ot`) salen del formulario de
  medidor **manual** en web y móvil. Siguen en los automatizados.
- El disparo medidor → OT pasa de Pro a Empresa.
- Se limpian los umbrales de los medidores manuales existentes (ver abajo).

## Datos afectados

<!-- pegar acá la salida del paso 2 de la Task 10 -->

## Verificación

- `supabase test db` — 9/9 en `automatizaciones.test.sql`
- `npm test`
- Prueba manual: lectura 12 sobre umbral 10 abre la OT; la segunda lectura
  inmediata queda registrada como omitida por retrigger.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:** every section maps to a task — data model → T1; engine → T2;
plan gate → T1 (flag) + T6 (route) + T8 (sidebar) + T2 (engine check); threshold
removal → T2 (data) + T9 (both UIs); UI → T6/T7; verification → T3; ordering →
matches the spec's list, with production apply added as T10.

**Deliberately deviating from the spec in one place:** the spec's order put the
plan flag in step 7; it is in Task 1 because Task 6's gate cannot be written
before the flag exists.

**Known gaps, accepted:** `automatizacion_ejecuciones` has no retention policy —
a chatty gateway will grow it. Not a v1 problem (readings themselves grow faster
and are unpruned too), but worth a `ponytail:` comment if it shows up.
