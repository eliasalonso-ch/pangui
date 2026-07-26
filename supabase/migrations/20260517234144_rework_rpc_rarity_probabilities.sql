-- =============================================================================
-- REWORK: get_completion_message con probabilidades reales por rareza
--
-- Flujo:
--   1. Filtra mensajes elegibles por oficio/cargo/rol (misma prioridad que antes)
--   2. Sortea rareza según probabilidades fijas:
--        mythic    0.01%  (1 en 10.000)
--        legendary 0.75%
--        rare      12%
--        common    resto
--   3. Si no hay mensajes de esa rareza en el pool elegible, baja al siguiente
--      nivel (mythic→legendary→rare→common)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_completion_message(
  p_workspace_id  uuid,
  p_oficio_id     uuid DEFAULT NULL,
  p_cargo_id      uuid DEFAULT NULL,
  p_rol           text DEFAULT NULL
)
RETURNS TABLE (id uuid, message text, rarity public.message_rarity)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roll        float := random();
  v_target      public.message_rarity;
  v_result      RECORD;
BEGIN
  -- ── 1. Pick target rarity by probability ────────────────────────────────
  -- mythic    0.0001  (0.01%)
  -- legendary 0.0075  (0.75%)
  -- rare      0.12    (12%)
  -- common    rest    (~87%)
  IF    v_roll < 0.0001 THEN v_target := 'mythic';
  ELSIF v_roll < 0.0076 THEN v_target := 'legendary';
  ELSIF v_roll < 0.1276 THEN v_target := 'rare';
  ELSE                       v_target := 'common';
  END IF;

  -- ── 2. Try to return a message of that rarity, falling back down ─────────
  -- Mythic messages are always global (no oficio/cargo filter)
  IF v_target = 'mythic' THEN
    SELECT cm.id, cm.message, cm.rarity INTO v_result
    FROM public.completion_messages cm
    WHERE cm.activo = true
      AND cm.rarity = 'mythic'
      AND (cm.workspace_id IS NULL OR cm.workspace_id = p_workspace_id)
    ORDER BY random()
    LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN QUERY SELECT v_result.id, v_result.message, v_result.rarity;
      RETURN;
    END IF;
    -- fallthrough to legendary
    v_target := 'legendary';
  END IF;

  -- For legendary / rare / common: filter by oficio/cargo/rol priority
  -- then pick from that rarity. If none found, fall to next lower rarity.
  WHILE v_target IS NOT NULL LOOP
    SELECT cm.id, cm.message, cm.rarity INTO v_result
    FROM public.completion_messages cm
    WHERE cm.activo = true
      AND cm.rarity = v_target
      AND (cm.workspace_id IS NULL OR cm.workspace_id = p_workspace_id)
      AND (
        -- specific combo
        (cm.oficio_id = p_oficio_id AND cm.cargo_id = p_cargo_id AND cm.rol_target = p_rol)
        OR
        -- oficio + rol
        (cm.oficio_id = p_oficio_id AND cm.rol_target = p_rol AND cm.cargo_id IS NULL)
        OR
        -- cargo + rol
        (cm.cargo_id = p_cargo_id AND cm.rol_target = p_rol AND cm.oficio_id IS NULL)
        OR
        -- rol only
        (cm.rol_target = p_rol AND cm.oficio_id IS NULL AND cm.cargo_id IS NULL)
        OR
        -- oficio only
        (cm.oficio_id = p_oficio_id AND cm.cargo_id IS NULL AND cm.rol_target IS NULL)
        OR
        -- cargo only
        (cm.cargo_id = p_cargo_id AND cm.oficio_id IS NULL AND cm.rol_target IS NULL)
        OR
        -- fallback general
        (cm.oficio_id IS NULL AND cm.cargo_id IS NULL AND cm.rol_target IS NULL)
      )
    ORDER BY random()
    LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN QUERY SELECT v_result.id, v_result.message, v_result.rarity;
      RETURN;
    END IF;

    -- Fall to next lower rarity
    v_target := CASE v_target
      WHEN 'legendary' THEN 'rare'::public.message_rarity
      WHEN 'rare'      THEN 'common'::public.message_rarity
      ELSE NULL
    END;
  END LOOP;

  -- Nothing found at all (shouldn't happen if seed is complete)
  RETURN;
END;
$$;

-- Second mythic message
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES (NULL, NULL, NULL, NULL, 'Ahora te poni bueno.', 'mythic')
ON CONFLICT DO NOTHING;
;
