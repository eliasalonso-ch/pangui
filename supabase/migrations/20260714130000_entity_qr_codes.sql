ALTER TABLE public.sociedades ADD COLUMN IF NOT EXISTS qr_code text;
ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS qr_code text;
ALTER TABLE public.lugares ADD COLUMN IF NOT EXISTS qr_code text;

UPDATE public.sociedades SET qr_code = 'ASO-' || upper(substr(replace(id::text, '-', ''), 1, 10)) WHERE qr_code IS NULL OR btrim(qr_code) = '';
UPDATE public.ubicaciones SET qr_code = 'UBI-' || upper(substr(replace(id::text, '-', ''), 1, 10)) WHERE qr_code IS NULL OR btrim(qr_code) = '';
UPDATE public.lugares SET qr_code = 'LUG-' || upper(substr(replace(id::text, '-', ''), 1, 10)) WHERE qr_code IS NULL OR btrim(qr_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS sociedades_qr_code_workspace_unique ON public.sociedades(workspace_id, qr_code) WHERE qr_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ubicaciones_qr_code_workspace_unique ON public.ubicaciones(workspace_id, qr_code) WHERE qr_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lugares_qr_code_workspace_unique ON public.lugares(workspace_id, qr_code) WHERE qr_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_entity_qr_code() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE prefix text;
BEGIN
  prefix := CASE TG_TABLE_NAME WHEN 'sociedades' THEN 'ASO-' WHEN 'ubicaciones' THEN 'UBI-' ELSE 'LUG-' END;
  NEW.qr_code := nullif(btrim(NEW.qr_code), '');
  IF NEW.qr_code IS NULL THEN NEW.qr_code := prefix || upper(substr(replace(NEW.id::text, '-', ''), 1, 10)); END IF;
  IF EXISTS (SELECT 1 FROM public.sociedades x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND (TG_TABLE_NAME <> 'sociedades' OR x.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.ubicaciones x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND (TG_TABLE_NAME <> 'ubicaciones' OR x.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.lugares x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND (TG_TABLE_NAME <> 'lugares' OR x.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.partes x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND x.activo = true)
  THEN RAISE EXCEPTION 'Este código QR ya está asignado a otro elemento' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS sociedades_assign_qr_code ON public.sociedades;
CREATE TRIGGER sociedades_assign_qr_code BEFORE INSERT OR UPDATE OF qr_code ON public.sociedades FOR EACH ROW EXECUTE FUNCTION public.assign_entity_qr_code();
DROP TRIGGER IF EXISTS ubicaciones_assign_qr_code ON public.ubicaciones;
CREATE TRIGGER ubicaciones_assign_qr_code BEFORE INSERT OR UPDATE OF qr_code ON public.ubicaciones FOR EACH ROW EXECUTE FUNCTION public.assign_entity_qr_code();
DROP TRIGGER IF EXISTS lugares_assign_qr_code ON public.lugares;
CREATE TRIGGER lugares_assign_qr_code BEFORE INSERT OR UPDATE OF qr_code ON public.lugares FOR EACH ROW EXECUTE FUNCTION public.assign_entity_qr_code();
