
CREATE OR REPLACE FUNCTION check_n_serie_unique()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  existing_titulo TEXT;
BEGIN
  IF NEW.n_serie IS NULL OR NEW.n_serie = '' THEN
    RETURN NEW;
  END IF;

  SELECT titulo INTO existing_titulo
  FROM ordenes_trabajo
  WHERE workspace_id = NEW.workspace_id
    AND n_serie = NEW.n_serie
    AND id <> NEW.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una OT con este número: "%"', existing_titulo;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_check_n_serie_unique
  BEFORE INSERT OR UPDATE ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION check_n_serie_unique();
;
