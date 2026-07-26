-- =============================================================================
-- OFICIOS, CARGOS & COMPLETION MESSAGES
-- =============================================================================

-- ── 1. OFICIOS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.oficios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  slug          text NOT NULL,
  icono         text,
  color         text,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oficios_slug_global_unique UNIQUE NULLS NOT DISTINCT (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS oficios_workspace_idx ON public.oficios (workspace_id);
CREATE INDEX IF NOT EXISTS oficios_slug_idx ON public.oficios (slug);

ALTER TABLE public.oficios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oficios_select" ON public.oficios FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id = public.my_workspace_id());

CREATE POLICY "oficios_insert" ON public.oficios FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  );

CREATE POLICY "oficios_update" ON public.oficios FOR UPDATE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  )
  WITH CHECK (workspace_id = public.my_workspace_id());

CREATE POLICY "oficios_delete" ON public.oficios FOR DELETE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  );


-- ── 2. CARGOS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cargos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  slug          text NOT NULL,
  nivel         smallint NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 5),
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargos_slug_global_unique UNIQUE NULLS NOT DISTINCT (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS cargos_workspace_idx ON public.cargos (workspace_id);
CREATE INDEX IF NOT EXISTS cargos_slug_idx ON public.cargos (slug);
CREATE INDEX IF NOT EXISTS cargos_nivel_idx ON public.cargos (nivel);

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cargos_select" ON public.cargos FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id = public.my_workspace_id());

CREATE POLICY "cargos_insert" ON public.cargos FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  );

CREATE POLICY "cargos_update" ON public.cargos FOR UPDATE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  )
  WITH CHECK (workspace_id = public.my_workspace_id());

CREATE POLICY "cargos_delete" ON public.cargos FOR DELETE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  );


-- ── 3. COMPLETION MESSAGES ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.message_rarity AS ENUM ('common', 'rare', 'legendary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.completion_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rol_target    text,
  cargo_id      uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  oficio_id     uuid REFERENCES public.oficios(id) ON DELETE SET NULL,
  message       text NOT NULL,
  rarity        public.message_rarity NOT NULL DEFAULT 'common',
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS completion_messages_workspace_idx  ON public.completion_messages (workspace_id);
CREATE INDEX IF NOT EXISTS completion_messages_oficio_idx     ON public.completion_messages (oficio_id);
CREATE INDEX IF NOT EXISTS completion_messages_cargo_idx      ON public.completion_messages (cargo_id);
CREATE INDEX IF NOT EXISTS completion_messages_rol_target_idx ON public.completion_messages (rol_target);
CREATE INDEX IF NOT EXISTS completion_messages_rarity_idx     ON public.completion_messages (rarity);

ALTER TABLE public.completion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "completion_messages_select" ON public.completion_messages FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id = public.my_workspace_id());

CREATE POLICY "completion_messages_insert" ON public.completion_messages FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  );

CREATE POLICY "completion_messages_update" ON public.completion_messages FOR UPDATE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  )
  WITH CHECK (workspace_id = public.my_workspace_id());

CREATE POLICY "completion_messages_delete" ON public.completion_messages FOR DELETE TO authenticated
  USING (
    workspace_id = public.my_workspace_id()
    AND (SELECT rol FROM public.usuarios WHERE id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  );


-- ── 4. ALTER USUARIOS ─────────────────────────────────────────────────────────

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS cargo_id  uuid REFERENCES public.cargos(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS oficio_id uuid REFERENCES public.oficios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS usuarios_cargo_id_idx  ON public.usuarios (cargo_id);
CREATE INDEX IF NOT EXISTS usuarios_oficio_id_idx ON public.usuarios (oficio_id);


-- ── 5. RPC: get_completion_message ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_completion_message(
  p_workspace_id  uuid,
  p_oficio_id     uuid DEFAULT NULL,
  p_cargo_id      uuid DEFAULT NULL,
  p_rol           text DEFAULT NULL
)
RETURNS TABLE (id uuid, message text, rarity public.message_rarity)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      cm.id, cm.message, cm.rarity,
      CASE
        WHEN cm.oficio_id = p_oficio_id AND cm.cargo_id = p_cargo_id AND cm.rol_target = p_rol THEN 4
        WHEN cm.oficio_id = p_oficio_id AND cm.rol_target = p_rol AND cm.cargo_id IS NULL       THEN 3
        WHEN cm.cargo_id = p_cargo_id AND cm.rol_target = p_rol AND cm.oficio_id IS NULL        THEN 2
        WHEN cm.rol_target = p_rol AND cm.oficio_id IS NULL AND cm.cargo_id IS NULL             THEN 1
        WHEN cm.oficio_id = p_oficio_id AND cm.cargo_id IS NULL AND cm.rol_target IS NULL       THEN 1
        WHEN cm.cargo_id = p_cargo_id AND cm.oficio_id IS NULL AND cm.rol_target IS NULL        THEN 1
        ELSE 0
      END AS priority,
      CASE cm.rarity WHEN 'legendary' THEN 10 WHEN 'rare' THEN 3 ELSE 1 END AS weight
    FROM public.completion_messages cm
    WHERE cm.activo = true
      AND (cm.workspace_id IS NULL OR cm.workspace_id = p_workspace_id)
  ),
  best_priority AS (SELECT MAX(priority) AS max_p FROM candidates WHERE priority > 0),
  eligible AS (
    SELECT c.id, c.message, c.rarity, c.weight
    FROM candidates c, best_priority bp
    WHERE c.priority = bp.max_p
  ),
  weighted AS (SELECT id, message, rarity, random() * weight AS score FROM eligible)
  SELECT id, message, rarity FROM weighted ORDER BY score DESC LIMIT 1;
$$;
;
