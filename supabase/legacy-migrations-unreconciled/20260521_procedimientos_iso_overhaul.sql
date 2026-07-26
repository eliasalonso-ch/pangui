-- =============================================================================
-- PROCEDIMIENTOS ISO OVERHAUL — Phase 1
-- Extends procedimientos, procedimiento_pasos, paso_respuestas with the
-- field set required for MaintainX-style + ISO-grade auditable procedures
-- (ISO 9001 cl. 7.5 / 8.5.2, ISO 14224, ISO 55001, ISO 17020).
--
-- New tables:
--   paso_respuesta_historial           — immutable edit log (ISO 9001 cl. 7.5.3)
--   procedimiento_subprocedimientos    — nested reusable blocks
--   procedimiento_plantillas           — starter templates (global + per-ws)
--   workspace_taxonomias               — per-workspace ISO 14224 / unit / categoria lists
--
-- Schema-only. Idempotent (IF NOT EXISTS guards). Additive — does not
-- rename or drop existing columns. Mobile + web clients can keep working
-- against the existing columns while new features opt in to the new ones.
-- =============================================================================

-- ── 1. procedimientos ─────────────────────────────────────────────────────────

ALTER TABLE public.procedimientos
  ADD COLUMN IF NOT EXISTS version        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS iso_categoria  text    NULL,
  ADD COLUMN IF NOT EXISTS puntaje_minimo integer NULL,
  ADD COLUMN IF NOT EXISTS puntaje_maximo integer NULL,
  ADD COLUMN IF NOT EXISTS hereda_a_hijos boolean NOT NULL DEFAULT false;

-- Soft check — iso_categoria is open-ended (workspace_taxonomias can extend it)
-- but we default-suggest a known set. Stored as plain text, validated client-side.
COMMENT ON COLUMN public.procedimientos.iso_categoria IS
  'Suggested: inspeccion | mantenimiento | seguridad | calibracion | otro. Open-ended, validated via workspace_taxonomias.';
COMMENT ON COLUMN public.procedimientos.version IS
  'Template revision counter (ISO 9001 cl. 7.5.3). Bumped on structural edits by the app.';
COMMENT ON COLUMN public.procedimientos.hereda_a_hijos IS
  'When true, attaching this procedure to a parent OT also attaches it to any sub-OT created afterwards.';


-- ── 2. procedimiento_pasos ────────────────────────────────────────────────────
--
-- New tipo values added to the toolbox (validated client-side; stored as text):
--   medidor, archivo, fecha, hora, fecha_hora, escaneo,
--   falla_iso14224, sub_procedimiento, seccion, puntuacion
--
-- Existing tipos preserved: instruccion, advertencia, texto, numero, monto,
-- si_no_na, opcion_multiple, lista_verificacion, inspeccion, imagen, firma

ALTER TABLE public.procedimiento_pasos
  ADD COLUMN IF NOT EXISTS peso                 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condicion_paso_id    uuid    NULL REFERENCES public.procedimiento_pasos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condicion_operador   text    NULL,
  ADD COLUMN IF NOT EXISTS condicion_valor      jsonb   NULL,
  ADD COLUMN IF NOT EXISTS requiere_nota_si     jsonb   NULL,
  ADD COLUMN IF NOT EXISTS requiere_foto_si     jsonb   NULL,
  ADD COLUMN IF NOT EXISTS genera_correctiva    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correctiva_plantilla jsonb   NULL,
  ADD COLUMN IF NOT EXISTS medidor_id           uuid    NULL,
  ADD COLUMN IF NOT EXISTS iso14224_taxonomia   text    NULL,
  ADD COLUMN IF NOT EXISTS sub_procedimiento_id uuid    NULL REFERENCES public.procedimientos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS multimedia_url       text    NULL;

CREATE INDEX IF NOT EXISTS pasos_condicion_paso_idx
  ON public.procedimiento_pasos (condicion_paso_id)
  WHERE condicion_paso_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pasos_sub_procedimiento_idx
  ON public.procedimiento_pasos (sub_procedimiento_id)
  WHERE sub_procedimiento_id IS NOT NULL;

COMMENT ON COLUMN public.procedimiento_pasos.peso IS 'Score weight (0 = not scored).';
COMMENT ON COLUMN public.procedimiento_pasos.condicion_paso_id IS 'If set, this step only renders when the referenced paso evaluates to condicion_valor under condicion_operador.';
COMMENT ON COLUMN public.procedimiento_pasos.condicion_operador IS 'eq | ne | in | gt | lt | gte | lte | contains';
COMMENT ON COLUMN public.procedimiento_pasos.requiere_nota_si IS 'jsonb shape: {"on":["fail","no","poor","replace"]} — values that force a note.';
COMMENT ON COLUMN public.procedimiento_pasos.requiere_foto_si IS 'Same shape as requiere_nota_si but for required photo evidence.';
COMMENT ON COLUMN public.procedimiento_pasos.correctiva_plantilla IS 'jsonb: defaults for the auto-created corrective sub-OT (titulo, descripcion, prioridad, tipo, asignado_a).';
COMMENT ON COLUMN public.procedimiento_pasos.medidor_id IS 'FK to a future medidores table. Left nullable + unconstrained for now.';
COMMENT ON COLUMN public.procedimiento_pasos.iso14224_taxonomia IS 'Slug into workspace_taxonomias for the failure-code picker.';


-- ── 3. paso_respuestas ────────────────────────────────────────────────────────

ALTER TABLE public.paso_respuestas
  ADD COLUMN IF NOT EXISTS valor_fecha        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archivo_url        text        NULL,
  ADD COLUMN IF NOT EXISTS archivo_nombre     text        NULL,
  ADD COLUMN IF NOT EXISTS archivo_mime       text        NULL,
  ADD COLUMN IF NOT EXISTS escaneo_valor      text        NULL,
  ADD COLUMN IF NOT EXISTS escaneo_asset_id   uuid        NULL,
  ADD COLUMN IF NOT EXISTS iso14224_modo      text        NULL,
  ADD COLUMN IF NOT EXISTS iso14224_causa     text        NULL,
  ADD COLUMN IF NOT EXISTS iso14224_mecanismo text        NULL,
  ADD COLUMN IF NOT EXISTS iso14224_accion    text        NULL,
  ADD COLUMN IF NOT EXISTS lectura_anterior   numeric     NULL,
  ADD COLUMN IF NOT EXISTS lectura_delta      numeric     NULL,
  ADD COLUMN IF NOT EXISTS geo_lat            numeric     NULL,
  ADD COLUMN IF NOT EXISTS geo_lng            numeric     NULL,
  ADD COLUMN IF NOT EXISTS device_id          text        NULL,
  ADD COLUMN IF NOT EXISTS puntaje_obtenido   integer     NULL,
  ADD COLUMN IF NOT EXISTS revision_paso      integer     NULL,
  ADD COLUMN IF NOT EXISTS editado_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS editado_por        uuid        NULL,
  ADD COLUMN IF NOT EXISTS correctiva_ot_id   uuid        NULL;

COMMENT ON COLUMN public.paso_respuestas.revision_paso IS 'Snapshot of procedimiento_pasos.version at the moment this respuesta was first written (ISO 9001 traceability).';
COMMENT ON COLUMN public.paso_respuestas.correctiva_ot_id IS 'FK to the sub-OT auto-created by crear_correctiva_desde_paso(). Null if no corrective was triggered.';


-- ── 4. paso_respuesta_historial — immutable edit log ──────────────────────────

CREATE TABLE IF NOT EXISTS public.paso_respuesta_historial (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  respuesta_id   uuid NOT NULL REFERENCES public.paso_respuestas(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL,
  valor_anterior jsonb NOT NULL,
  valor_nuevo    jsonb NOT NULL,
  editado_por    uuid NULL,
  editado_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prh_respuesta_idx ON public.paso_respuesta_historial (respuesta_id, editado_at);
CREATE INDEX IF NOT EXISTS prh_workspace_idx ON public.paso_respuesta_historial (workspace_id);

ALTER TABLE public.paso_respuesta_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prh_select ON public.paso_respuesta_historial;
CREATE POLICY prh_select ON public.paso_respuesta_historial
  FOR SELECT TO authenticated
  USING (workspace_id = public.my_workspace_id());

-- Insert-only via trigger (no client writes, no updates, no deletes).
DROP POLICY IF EXISTS prh_insert ON public.paso_respuesta_historial;
CREATE POLICY prh_insert ON public.paso_respuesta_historial
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.my_workspace_id());


-- Trigger: on UPDATE of paso_respuestas, append a historial row capturing
-- the old vs new value blobs. Skipped for INSERT (first write isn't an "edit").
CREATE OR REPLACE FUNCTION public.fn_paso_respuesta_historial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws uuid;
BEGIN
  -- Resolve workspace via the ejecucion → orden_trabajo → workspace_id chain.
  SELECT ot.workspace_id INTO ws
  FROM public.procedimiento_ejecuciones pe
  JOIN public.ordenes_trabajo ot ON ot.id = pe.orden_id
  WHERE pe.id = NEW.ejecucion_id
  LIMIT 1;

  INSERT INTO public.paso_respuesta_historial
    (respuesta_id, workspace_id, valor_anterior, valor_nuevo, editado_por)
  VALUES (
    NEW.id,
    ws,
    to_jsonb(OLD),
    to_jsonb(NEW),
    COALESCE(NEW.editado_por, NEW.respondido_por, auth.uid())
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_paso_respuesta_historial ON public.paso_respuestas;
CREATE TRIGGER trg_paso_respuesta_historial
  AFTER UPDATE ON public.paso_respuestas
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.fn_paso_respuesta_historial();


-- ── 5. procedimiento_subprocedimientos — explicit nesting table ───────────────
--
-- Two ways to nest a procedure as a step:
--   (a) procedimiento_pasos.sub_procedimiento_id (inline single child)
--   (b) this table — when one paso embeds an ordered list of sub-procedures
-- We support both; (a) covers the simple case, (b) covers reusable composite blocks.

CREATE TABLE IF NOT EXISTS public.procedimiento_subprocedimientos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_paso_id         uuid NOT NULL REFERENCES public.procedimiento_pasos(id) ON DELETE CASCADE,
  child_procedimiento_id uuid NOT NULL REFERENCES public.procedimientos(id) ON DELETE CASCADE,
  orden                  integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proc_subproc_unique UNIQUE (parent_paso_id, child_procedimiento_id)
);

CREATE INDEX IF NOT EXISTS proc_subproc_parent_idx ON public.procedimiento_subprocedimientos (parent_paso_id);

ALTER TABLE public.procedimiento_subprocedimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_subproc_select ON public.procedimiento_subprocedimientos;
CREATE POLICY proc_subproc_select ON public.procedimiento_subprocedimientos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.procedimiento_pasos pp
      JOIN public.procedimientos p ON p.id = pp.procedimiento_id
      WHERE pp.id = parent_paso_id AND p.workspace_id = public.my_workspace_id()
    )
  );

DROP POLICY IF EXISTS proc_subproc_write ON public.procedimiento_subprocedimientos;
CREATE POLICY proc_subproc_write ON public.procedimiento_subprocedimientos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.procedimiento_pasos pp
      JOIN public.procedimientos p ON p.id = pp.procedimiento_id
      WHERE pp.id = parent_paso_id AND p.workspace_id = public.my_workspace_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.procedimiento_pasos pp
      JOIN public.procedimientos p ON p.id = pp.procedimiento_id
      WHERE pp.id = parent_paso_id AND p.workspace_id = public.my_workspace_id()
    )
  );


-- ── 6. procedimiento_plantillas — starter templates ───────────────────────────
--
-- workspace_id NULL  = global template, readable by everyone, editable only by service role.
-- workspace_id <ws>  = workspace-scoped template, readable + editable in that workspace.
-- pasos_json is a snapshot — selecting a template duplicates its steps into a
-- fresh draft, no FK link back, so editing one never mutates the source.

CREATE TABLE IF NOT EXISTS public.procedimiento_plantillas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  descripcion   text NULL,
  iso_categoria text NULL,
  pasos_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by    uuid NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plantillas_workspace_idx ON public.procedimiento_plantillas (workspace_id);

ALTER TABLE public.procedimiento_plantillas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plantillas_select ON public.procedimiento_plantillas;
CREATE POLICY plantillas_select ON public.procedimiento_plantillas
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id = public.my_workspace_id());

DROP POLICY IF EXISTS plantillas_insert ON public.procedimiento_plantillas;
CREATE POLICY plantillas_insert ON public.procedimiento_plantillas
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.my_workspace_id());

DROP POLICY IF EXISTS plantillas_update ON public.procedimiento_plantillas;
CREATE POLICY plantillas_update ON public.procedimiento_plantillas
  FOR UPDATE TO authenticated
  USING (workspace_id = public.my_workspace_id())
  WITH CHECK (workspace_id = public.my_workspace_id());

DROP POLICY IF EXISTS plantillas_delete ON public.procedimiento_plantillas;
CREATE POLICY plantillas_delete ON public.procedimiento_plantillas
  FOR DELETE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND public.fn_mi_rol() IN ('owner','admin')
  );


-- ── 7. workspace_taxonomias — extensible enum-like value lists ────────────────
--
-- tipo in: iso14224_modo | iso14224_causa | iso14224_mecanismo | iso14224_accion |
--          unidad_medidor | iso_categoria
-- valores is a jsonb array of {slug, etiqueta, padre_slug?, orden?}.

CREATE TABLE IF NOT EXISTS public.workspace_taxonomias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tipo         text NOT NULL,
  valores      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ws_tax_unique UNIQUE NULLS NOT DISTINCT (workspace_id, tipo)
);

CREATE INDEX IF NOT EXISTS ws_tax_workspace_idx ON public.workspace_taxonomias (workspace_id);

ALTER TABLE public.workspace_taxonomias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_tax_select ON public.workspace_taxonomias;
CREATE POLICY ws_tax_select ON public.workspace_taxonomias
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id = public.my_workspace_id());

DROP POLICY IF EXISTS ws_tax_write ON public.workspace_taxonomias;
CREATE POLICY ws_tax_write ON public.workspace_taxonomias
  FOR ALL TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND public.fn_mi_rol() IN ('owner','admin')
  )
  WITH CHECK (
    workspace_id = public.my_workspace_id()
    AND public.fn_mi_rol() IN ('owner','admin')
  );


-- ── 8. ordenes_trabajo — origen column (for corrective-action traceability) ───

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS origen          text NULL,
  ADD COLUMN IF NOT EXISTS origen_paso_id  uuid NULL,
  ADD COLUMN IF NOT EXISTS origen_ejecucion_id uuid NULL;

COMMENT ON COLUMN public.ordenes_trabajo.origen IS
  'Provenance of this OT. Examples: manual | correctiva_procedimiento | inspeccion_ruta | recurrente.';

CREATE INDEX IF NOT EXISTS ot_origen_paso_idx
  ON public.ordenes_trabajo (origen_paso_id)
  WHERE origen_paso_id IS NOT NULL;


-- ── 9. ot_procedimientos — per-attachment inheritance flag ────────────────────

ALTER TABLE public.ot_procedimientos
  ADD COLUMN IF NOT EXISTS hereda_a_hijos boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ot_procedimientos.hereda_a_hijos IS
  'When true, new sub-OTs created under this OT auto-receive a row referencing the same procedimiento_id.';


-- ── 10. Seed: minimal global ISO 14224 taxonomy ───────────────────────────────
--
-- Inserted only if no global (workspace_id IS NULL) taxonomy of this tipo exists.
-- Workspaces can extend or override per-workspace.

INSERT INTO public.workspace_taxonomias (workspace_id, tipo, valores)
SELECT NULL, 'iso14224_modo', jsonb_build_array(
    jsonb_build_object('slug','fuga',       'etiqueta','Fuga'),
    jsonb_build_object('slug','rotura',     'etiqueta','Rotura / fractura'),
    jsonb_build_object('slug','obstruccion','etiqueta','Obstrucción'),
    jsonb_build_object('slug','desgaste',   'etiqueta','Desgaste'),
    jsonb_build_object('slug','sobrecalentamiento','etiqueta','Sobrecalentamiento'),
    jsonb_build_object('slug','vibracion',  'etiqueta','Vibración anómala'),
    jsonb_build_object('slug','ruido',      'etiqueta','Ruido anómalo'),
    jsonb_build_object('slug','no_arranca', 'etiqueta','No arranca'),
    jsonb_build_object('slug','no_detiene', 'etiqueta','No detiene'),
    jsonb_build_object('slug','salida_fuera_rango','etiqueta','Salida fuera de rango'),
    jsonb_build_object('slug','sin_alimentacion','etiqueta','Sin alimentación'),
    jsonb_build_object('slug','fallo_control','etiqueta','Fallo de control'),
    jsonb_build_object('slug','otro',       'etiqueta','Otro')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_taxonomias
  WHERE workspace_id IS NULL AND tipo = 'iso14224_modo'
);

INSERT INTO public.workspace_taxonomias (workspace_id, tipo, valores)
SELECT NULL, 'iso14224_causa', jsonb_build_array(
    jsonb_build_object('slug','diseno',         'etiqueta','Diseño'),
    jsonb_build_object('slug','fabricacion',    'etiqueta','Fabricación / instalación'),
    jsonb_build_object('slug','operacion',      'etiqueta','Operación / uso'),
    jsonb_build_object('slug','mantenimiento',  'etiqueta','Mantenimiento (deficiente o ausente)'),
    jsonb_build_object('slug','material',       'etiqueta','Material / componente'),
    jsonb_build_object('slug','ambiental',      'etiqueta','Condiciones ambientales'),
    jsonb_build_object('slug','humana',         'etiqueta','Error humano'),
    jsonb_build_object('slug','desconocida',    'etiqueta','Desconocida')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_taxonomias
  WHERE workspace_id IS NULL AND tipo = 'iso14224_causa'
);

INSERT INTO public.workspace_taxonomias (workspace_id, tipo, valores)
SELECT NULL, 'iso14224_mecanismo', jsonb_build_array(
    jsonb_build_object('slug','corrosion',      'etiqueta','Corrosión'),
    jsonb_build_object('slug','erosion',        'etiqueta','Erosión'),
    jsonb_build_object('slug','fatiga',         'etiqueta','Fatiga'),
    jsonb_build_object('slug','sobrecarga',     'etiqueta','Sobrecarga mecánica'),
    jsonb_build_object('slug','contaminacion',  'etiqueta','Contaminación'),
    jsonb_build_object('slug','envejecimiento', 'etiqueta','Envejecimiento / vida útil'),
    jsonb_build_object('slug','cortocircuito',  'etiqueta','Cortocircuito'),
    jsonb_build_object('slug','fuga_aislamiento','etiqueta','Fuga de aislamiento'),
    jsonb_build_object('slug','otro',           'etiqueta','Otro')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_taxonomias
  WHERE workspace_id IS NULL AND tipo = 'iso14224_mecanismo'
);

INSERT INTO public.workspace_taxonomias (workspace_id, tipo, valores)
SELECT NULL, 'iso14224_accion', jsonb_build_array(
    jsonb_build_object('slug','reemplazo',  'etiqueta','Reemplazo'),
    jsonb_build_object('slug','reparacion', 'etiqueta','Reparación'),
    jsonb_build_object('slug','ajuste',     'etiqueta','Ajuste / calibración'),
    jsonb_build_object('slug','limpieza',   'etiqueta','Limpieza'),
    jsonb_build_object('slug','lubricacion','etiqueta','Lubricación'),
    jsonb_build_object('slug','inspeccion', 'etiqueta','Inspección'),
    jsonb_build_object('slug','revision',   'etiqueta','Revisión general'),
    jsonb_build_object('slug','sin_accion', 'etiqueta','Sin acción inmediata')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_taxonomias
  WHERE workspace_id IS NULL AND tipo = 'iso14224_accion'
);

INSERT INTO public.workspace_taxonomias (workspace_id, tipo, valores)
SELECT NULL, 'iso_categoria', jsonb_build_array(
    jsonb_build_object('slug','inspeccion',   'etiqueta','Inspección'),
    jsonb_build_object('slug','mantenimiento','etiqueta','Mantenimiento'),
    jsonb_build_object('slug','seguridad',    'etiqueta','Seguridad'),
    jsonb_build_object('slug','calibracion',  'etiqueta','Calibración'),
    jsonb_build_object('slug','calidad',      'etiqueta','Calidad / 9001'),
    jsonb_build_object('slug','otro',         'etiqueta','Otro')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_taxonomias
  WHERE workspace_id IS NULL AND tipo = 'iso_categoria'
);

INSERT INTO public.workspace_taxonomias (workspace_id, tipo, valores)
SELECT NULL, 'unidad_medidor', jsonb_build_array(
    jsonb_build_object('slug','hr',   'etiqueta','horas'),
    jsonb_build_object('slug','km',   'etiqueta','km'),
    jsonb_build_object('slug','mi',   'etiqueta','millas'),
    jsonb_build_object('slug','rpm',  'etiqueta','RPM'),
    jsonb_build_object('slug','psi',  'etiqueta','PSI'),
    jsonb_build_object('slug','bar',  'etiqueta','bar'),
    jsonb_build_object('slug','kpa',  'etiqueta','kPa'),
    jsonb_build_object('slug','c',    'etiqueta','°C'),
    jsonb_build_object('slug','f',    'etiqueta','°F'),
    jsonb_build_object('slug','l',    'etiqueta','litros'),
    jsonb_build_object('slug','gal',  'etiqueta','galones'),
    jsonb_build_object('slug','kwh',  'etiqueta','kWh'),
    jsonb_build_object('slug','ciclos','etiqueta','ciclos'),
    jsonb_build_object('slug','unidades','etiqueta','unidades')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_taxonomias
  WHERE workspace_id IS NULL AND tipo = 'unidad_medidor'
);


-- ── 11. Reload PostgREST schema cache ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
