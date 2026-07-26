-- Replace the generic "editado" with a list of which fields changed.
CREATE OR REPLACE FUNCTION fn_log_actividad_activo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campos text[] := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'creado', NEW.nombre);
    RETURN NEW;
  END IF;

  -- Status change (handled separately so it keeps its de→a meta).
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.id, v_user, 'estado_cambiado', NEW.estado,
            jsonb_build_object('de', OLD.estado, 'a', NEW.estado));
  END IF;

  -- Soft delete.
  IF NEW.activo = false AND OLD.activo = true THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'eliminado', NULL);
    RETURN NEW;
  END IF;

  -- Build the list of changed fields (human labels), one entry per field.
  IF NEW.nombre          IS DISTINCT FROM OLD.nombre          THEN v_campos := v_campos || 'Nombre'; END IF;
  IF NEW.codigo          IS DISTINCT FROM OLD.codigo          THEN v_campos := v_campos || 'Código'; END IF;
  IF NEW.descripcion     IS DISTINCT FROM OLD.descripcion     THEN v_campos := v_campos || 'Descripción'; END IF;
  IF NEW.ubicacion_id    IS DISTINCT FROM OLD.ubicacion_id    THEN v_campos := v_campos || 'Ubicación'; END IF;
  IF NEW.sociedad_id     IS DISTINCT FROM OLD.sociedad_id     THEN v_campos := v_campos || 'Cliente'; END IF;
  IF NEW.fabricante_id   IS DISTINCT FROM OLD.fabricante_id   THEN v_campos := v_campos || 'Fabricante'; END IF;
  IF NEW.modelo_id       IS DISTINCT FROM OLD.modelo_id       THEN v_campos := v_campos || 'Modelo'; END IF;
  IF NEW.proveedor_id    IS DISTINCT FROM OLD.proveedor_id    THEN v_campos := v_campos || 'Proveedor'; END IF;
  IF NEW.responsable_id  IS DISTINCT FROM OLD.responsable_id  THEN v_campos := v_campos || 'Responsable'; END IF;
  IF NEW.activo_padre_id IS DISTINCT FROM OLD.activo_padre_id THEN v_campos := v_campos || 'Activo padre'; END IF;
  IF NEW.criticidad      IS DISTINCT FROM OLD.criticidad      THEN v_campos := v_campos || 'Criticidad'; END IF;
  IF NEW.numero_serie    IS DISTINCT FROM OLD.numero_serie    THEN v_campos := v_campos || 'N° de serie'; END IF;
  IF NEW.año_fabricacion IS DISTINCT FROM OLD.año_fabricacion THEN v_campos := v_campos || 'Año'; END IF;
  IF NEW.codigo_sap      IS DISTINCT FROM OLD.codigo_sap      THEN v_campos := v_campos || 'Código SAP'; END IF;
  IF NEW.fecha_garantia  IS DISTINCT FROM OLD.fecha_garantia  THEN v_campos := v_campos || 'Garantía'; END IF;
  IF NEW.imagen_url      IS DISTINCT FROM OLD.imagen_url      THEN v_campos := v_campos || 'Foto'; END IF;
  IF NEW.adjuntos        IS DISTINCT FROM OLD.adjuntos        THEN v_campos := v_campos || 'Adjuntos'; END IF;

  IF array_length(v_campos, 1) > 0 THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.id, v_user, 'editado',
            array_to_string(v_campos, ', '),
            jsonb_build_object('campos', v_campos));
  END IF;

  RETURN NEW;
END;
$$;;
