
CREATE OR REPLACE FUNCTION public.set_requiere_materiales_from_workspace()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    SELECT requiere_materiales_global INTO NEW.requiere_materiales
    FROM public.workspaces
    WHERE id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_requiere_materiales ON public.ordenes_trabajo;

CREATE TRIGGER trg_set_requiere_materiales
  BEFORE INSERT ON public.ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_requiere_materiales_from_workspace();
;
