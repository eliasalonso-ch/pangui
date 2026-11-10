-- Resolver un pendiente también escribe la Unidad del catálogo (si la hoja tiene
-- esa columna y el catálogo la trae), igual que elegir en el picker.
CREATE OR REPLACE FUNCTION resolver_material_pendiente(p_fila_id uuid, p_codigo text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE
  v_fila hojas_inventario_filas;
  v_hoja hojas_inventario;
  v_mat text; v_cod text; v_uni text; v_desc text; v_codigo text; v_unidad text;
BEGIN
  IF my_rol() NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'solo owner/admin'; END IF;
  SELECT * INTO v_fila FROM hojas_inventario_filas WHERE id = p_fila_id;
  SELECT * INTO v_hoja FROM hojas_inventario WHERE id = v_fila.hoja_id AND workspace_id = my_workspace_id();
  IF v_hoja.id IS NULL THEN RAISE EXCEPTION 'fila no encontrada'; END IF;
  SELECT codigo, descripcion, unidad INTO v_codigo, v_desc, v_unidad FROM catalogo_materiales
    WHERE workspace_id = v_hoja.workspace_id AND lower(codigo) = lower(p_codigo);
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'código % no está en el catálogo', p_codigo; END IF;
  v_mat := hoja_columna_id(v_hoja.columnas, ARRAY['material','item','descripcion']);
  v_cod := hoja_columna_id(v_hoja.columnas, ARRAY['codigo']);
  v_uni := hoja_columna_id(v_hoja.columnas, ARRAY['unidad']);
  INSERT INTO material_alias (workspace_id, texto_norm, codigo)
  VALUES (v_hoja.workspace_id,
          translate(lower(trim(v_fila.celdas->>v_mat)), 'áéíóú', 'aeiou'), v_codigo)
  ON CONFLICT (workspace_id, texto_norm) DO UPDATE SET codigo = EXCLUDED.codigo;
  UPDATE hojas_inventario_filas
     SET celdas = celdas || jsonb_build_object(v_mat, v_desc, v_cod, v_codigo)
                 || CASE WHEN v_uni IS NOT NULL AND coalesce(trim(v_unidad), '') <> ''
                         THEN jsonb_build_object(v_uni, v_unidad) ELSE '{}'::jsonb END
   WHERE id = p_fila_id;
END;
$$;
