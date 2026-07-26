-- Ingeniero como oficio global
INSERT INTO public.oficios (id, workspace_id, nombre, slug, icono, color, activo)
VALUES
  ('00000000-0f01-0000-0000-000000000010', NULL, 'Ingeniero', 'ingeniero', 'school-outline', '#6366F1', true)
ON CONFLICT (workspace_id, slug) DO NOTHING;

-- Update RPC to give mythic weight=50
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
        -- mythic: always eligible regardless of oficio/cargo/rol
        WHEN cm.rarity = 'mythic'                                                               THEN 1
        ELSE 0
      END AS priority,
      CASE cm.rarity
        WHEN 'mythic'    THEN 50
        WHEN 'legendary' THEN 10
        WHEN 'rare'      THEN 3
        ELSE 1
      END AS weight
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

-- THE mythic message
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, NULL, NULL, NULL, 'Eres el más mejor.', 'mythic');
;
