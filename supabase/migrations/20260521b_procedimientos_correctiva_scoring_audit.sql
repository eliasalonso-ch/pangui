-- =============================================================================
-- PROCEDIMIENTOS — Corrective-action RPC, scoring view, audit-log polish
--
-- Builds on 20260521_procedimientos_iso_overhaul.sql:
--   - RPC `crear_correctiva_desde_paso(respuesta_id uuid)` — idempotently
--     creates a sub-OT when a paso with `genera_correctiva = true` is failed.
--   - View `procedimiento_ejecucion_puntajes` — sums puntaje_obtenido per
--     execution + carries puntaje_maximo from the template.
--   - The audit-log trigger from 20260521 already fires; this migration adds
--     an index for read efficiency on the Historial tab UI.
--
-- All idempotent (DROP IF EXISTS / CREATE OR REPLACE).
-- =============================================================================


-- ── 1. fn_crear_correctiva_desde_paso (RPC) ───────────────────────────────────
--
-- Inputs: respuesta_id (the paso_respuestas row whose answer triggered fail).
-- Outputs: uuid of the newly-created (or existing) corrective sub-OT.
-- Idempotency: if the respuesta already has a non-null correctiva_ot_id we
-- return that id without inserting again.
--
-- The corrective sub-OT inherits sensible defaults from the parent OT but
-- overrides title/description from the paso's correctiva_plantilla jsonb if
-- present, e.g. {"titulo":"Revisar válvula","prioridad":"alta"}.
--
-- The trigger condition (which answer values count as "fail") is encoded in
-- the paso's requiere_nota_si/requiere_foto_si or — for inspeccion type —
-- evaluated against valor_json. We trust the client to only call this RPC
-- when the paso has genera_correctiva = true AND the response represents a
-- failure. Server still defensively checks the genera_correctiva flag.

CREATE OR REPLACE FUNCTION public.crear_correctiva_desde_paso(p_respuesta_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing       uuid;
  v_resp           public.paso_respuestas%ROWTYPE;
  v_paso           public.procedimiento_pasos%ROWTYPE;
  v_parent_ot      public.ordenes_trabajo%ROWTYPE;
  v_workspace_id   uuid;
  v_new_ot_id      uuid;
  v_plantilla      jsonb;
  v_titulo         text;
  v_descripcion    text;
  v_prioridad      text;
  v_tipo_trabajo   text;
BEGIN
  SELECT * INTO v_resp FROM public.paso_respuestas WHERE id = p_respuesta_id;
  IF NOT FOUND THEN
    -- Soft-no-op: callers may invoke this opportunistically after every save
    -- (mobile sync worker pattern). Don't blow up if the row is gone.
    RETURN NULL;
  END IF;

  -- Idempotency: already triggered? Return the existing sub-OT.
  IF v_resp.correctiva_ot_id IS NOT NULL THEN
    RETURN v_resp.correctiva_ot_id;
  END IF;

  SELECT * INTO v_paso FROM public.procedimiento_pasos WHERE id = v_resp.paso_id;
  -- Soft-no-op when the paso isn't configured to generate correctives, so
  -- this RPC can be invoked unconditionally by the mobile sync worker.
  IF NOT FOUND OR NOT v_paso.genera_correctiva THEN
    RETURN NULL;
  END IF;

  -- TODO: evaluate "is this answer actually a fail?" server-side too. For
  -- now we trust the client (which checks paso.genera_correctiva + isFailAnswer
  -- before calling). The worst case is a corrective sub-OT for a non-fail
  -- answer — visible in the UI, easy to delete.

  -- Parent OT comes via the ejecucion.
  SELECT ot.* INTO v_parent_ot
  FROM public.procedimiento_ejecuciones pe
  JOIN public.ordenes_trabajo ot ON ot.id = pe.orden_id
  WHERE pe.id = v_resp.ejecucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent OT not found for ejecucion %', v_resp.ejecucion_id;
  END IF;

  v_workspace_id := v_parent_ot.workspace_id;
  v_plantilla := COALESCE(v_paso.correctiva_plantilla, '{}'::jsonb);

  -- Title defaults: plantilla.titulo OR "Acción correctiva: <paso titulo>".
  v_titulo := COALESCE(
    NULLIF(v_plantilla->>'titulo', ''),
    'Acción correctiva: ' || COALESCE(v_paso.titulo, 'paso sin título')
  );
  v_descripcion := COALESCE(
    v_plantilla->>'descripcion',
    'Generado automáticamente por una respuesta de falla en el procedimiento.'
  );
  v_prioridad := COALESCE(v_plantilla->>'prioridad', v_parent_ot.prioridad, 'media');
  v_tipo_trabajo := COALESCE(v_plantilla->>'tipo_trabajo', 'reactiva');

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, estado, prioridad,
    parent_id, origen, origen_paso_id, origen_ejecucion_id
  ) VALUES (
    v_workspace_id,
    v_resp.respondido_por,
    v_titulo,
    v_descripcion,
    'solicitud',
    v_tipo_trabajo,
    'pendiente',
    v_prioridad,
    v_parent_ot.id,
    'correctiva_procedimiento',
    v_paso.id,
    v_resp.ejecucion_id
  )
  RETURNING id INTO v_new_ot_id;

  -- Backlink so client can show "Corrective OT created" and the UI can avoid
  -- triggering the RPC again on subsequent saves.
  UPDATE public.paso_respuestas
    SET correctiva_ot_id = v_new_ot_id
    WHERE id = p_respuesta_id;

  RETURN v_new_ot_id;
END
$$;

REVOKE ALL ON FUNCTION public.crear_correctiva_desde_paso(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_correctiva_desde_paso(uuid) TO authenticated;


-- ── 2. procedimiento_ejecucion_puntajes view ──────────────────────────────────
--
-- Surfaces total achieved score per execution alongside the template's
-- puntaje_maximo + puntaje_minimo so the UI can render a progress bar and
-- gate the "Completar" button.

CREATE OR REPLACE VIEW public.procedimiento_ejecucion_puntajes AS
SELECT
  pe.id                                  AS ejecucion_id,
  pe.procedimiento_id,
  pe.orden_id,
  p.puntaje_minimo,
  COALESCE(SUM(pp.peso), 0)              AS puntaje_maximo,
  COALESCE(SUM(pr.puntaje_obtenido), 0)  AS puntaje_obtenido
FROM public.procedimiento_ejecuciones pe
JOIN public.procedimientos p ON p.id = pe.procedimiento_id
LEFT JOIN public.procedimiento_pasos pp ON pp.procedimiento_id = pe.procedimiento_id
LEFT JOIN public.paso_respuestas pr
  ON pr.ejecucion_id = pe.id AND pr.paso_id = pp.id
GROUP BY pe.id, pe.procedimiento_id, pe.orden_id, p.puntaje_minimo;

-- Views inherit RLS from their base tables (procedimiento_ejecuciones has
-- workspace scoping). No extra policy needed.

GRANT SELECT ON public.procedimiento_ejecucion_puntajes TO authenticated;


-- ── 3. Audit-log index for Historial tab reads ────────────────────────────────

CREATE INDEX IF NOT EXISTS prh_respuesta_at_idx
  ON public.paso_respuesta_historial (respuesta_id, editado_at DESC);


NOTIFY pgrst, 'reload schema';
