-- Logs OT milestones onto the asset's timeline: when an OT gets linked to an
-- asset, and when an OT tied to an asset is completed.
CREATE OR REPLACE FUNCTION fn_log_actividad_activo_from_ot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- OT created already linked to an asset.
    IF NEW.activo_id IS NOT NULL THEN
      INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
      VALUES (NEW.activo_id, NEW.creado_por, 'ot_vinculada',
              COALESCE(NEW.titulo, 'OT #' || COALESCE(NEW.numero::text, '')),
              jsonb_build_object('orden_id', NEW.id, 'numero', NEW.numero));
    END IF;
    RETURN NEW;
  END IF;

  -- OT linked to an asset after the fact (activo_id changed to non-null).
  IF NEW.activo_id IS DISTINCT FROM OLD.activo_id AND NEW.activo_id IS NOT NULL THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.activo_id, NEW.creado_por, 'ot_vinculada',
            COALESCE(NEW.titulo, 'OT #' || COALESCE(NEW.numero::text, '')),
            jsonb_build_object('orden_id', NEW.id, 'numero', NEW.numero));
  END IF;

  -- OT completed while tied to an asset.
  IF NEW.estado = 'completado' AND OLD.estado IS DISTINCT FROM 'completado'
     AND NEW.activo_id IS NOT NULL THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.activo_id, NEW.completado_por, 'ot_completada',
            COALESCE(NEW.titulo, 'OT #' || COALESCE(NEW.numero::text, '')),
            jsonb_build_object('orden_id', NEW.id, 'numero', NEW.numero));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_actividad_activo_from_ot_ins ON ordenes_trabajo;
CREATE TRIGGER trg_log_actividad_activo_from_ot_ins
  AFTER INSERT ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION fn_log_actividad_activo_from_ot();

DROP TRIGGER IF EXISTS trg_log_actividad_activo_from_ot_upd ON ordenes_trabajo;
CREATE TRIGGER trg_log_actividad_activo_from_ot_upd
  AFTER UPDATE ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION fn_log_actividad_activo_from_ot();;
