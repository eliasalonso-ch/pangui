-- Enforce mandatory OT photos at the source of truth. Client-side checks are
-- kept for immediate UX, but no client or direct API update may bypass this.
CREATE OR REPLACE FUNCTION public.enforce_ot_photo_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photos_required boolean := false;
  v_has_server_photo boolean := false;
BEGIN
  IF NEW.estado = 'completado'
     AND OLD.estado IS DISTINCT FROM 'completado' THEN
    SELECT COALESCE(NEW.requiere_fotos, false)
           OR COALESCE(w.fotos_obligatorias_todas, false)
      INTO v_photos_required
    FROM public.workspaces w
    WHERE w.id = NEW.workspace_id;

    v_photos_required := COALESCE(v_photos_required, COALESCE(NEW.requiere_fotos, false));

    IF v_photos_required THEN
      v_has_server_photo := COALESCE(cardinality(NEW.fotos_urls), 0) > 0
        OR EXISTS (
          SELECT 1
          FROM public.foto_grupos fg
          JOIN public.foto_grupo_items fgi ON fgi.grupo_id = fg.id
          WHERE fg.orden_id = NEW.id
            AND fg.tipo = 'evidencia'
        );

      IF NOT v_has_server_photo THEN
        RAISE EXCEPTION 'Esta OT requiere al menos una foto subida antes de completarse'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ot_photo_completion ON public.ordenes_trabajo;
CREATE TRIGGER trg_enforce_ot_photo_completion
BEFORE UPDATE OF estado ON public.ordenes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ot_photo_completion();

REVOKE ALL ON FUNCTION public.enforce_ot_photo_completion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_ot_photo_completion() FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
