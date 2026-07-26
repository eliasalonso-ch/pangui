-- Logs asset lifecycle events into actividad_activo.
-- User attribution uses auth.uid() (present when the change comes from an
-- authenticated app client; null for service-role/SQL changes — acceptable).
CREATE OR REPLACE FUNCTION fn_log_actividad_activo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'creado', NEW.nombre);
    RETURN NEW;
  END IF;

  -- UPDATE: status change
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.id, v_user, 'estado_cambiado', NEW.estado,
            jsonb_build_object('de', OLD.estado, 'a', NEW.estado));
  END IF;

  -- UPDATE: soft delete (dado de baja del catálogo)
  IF NEW.activo = false AND OLD.activo = true THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'eliminado', NULL);
    RETURN NEW;
  END IF;

  -- UPDATE: any other field edit (name, codigo, ubicacion, fabricante, etc.)
  -- One "editado" entry per save, regardless of how many fields changed.
  IF (NEW.nombre, NEW.codigo, NEW.descripcion, NEW.ubicacion_id, NEW.sociedad_id,
      NEW.fabricante_id, NEW.modelo_id, NEW.proveedor_id, NEW.responsable_id,
      NEW.activo_padre_id, NEW.criticidad, NEW.numero_serie, NEW.año_fabricacion,
      NEW.codigo_sap, NEW.fecha_garantia, NEW.imagen_url, NEW.adjuntos)
     IS DISTINCT FROM
     (OLD.nombre, OLD.codigo, OLD.descripcion, OLD.ubicacion_id, OLD.sociedad_id,
      OLD.fabricante_id, OLD.modelo_id, OLD.proveedor_id, OLD.responsable_id,
      OLD.activo_padre_id, OLD.criticidad, OLD.numero_serie, OLD.año_fabricacion,
      OLD.codigo_sap, OLD.fecha_garantia, OLD.imagen_url, OLD.adjuntos)
  THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'editado', NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_actividad_activo_ins ON activos;
CREATE TRIGGER trg_log_actividad_activo_ins
  AFTER INSERT ON activos
  FOR EACH ROW EXECUTE FUNCTION fn_log_actividad_activo();

DROP TRIGGER IF EXISTS trg_log_actividad_activo_upd ON activos;
CREATE TRIGGER trg_log_actividad_activo_upd
  AFTER UPDATE ON activos
  FOR EACH ROW EXECUTE FUNCTION fn_log_actividad_activo();;
