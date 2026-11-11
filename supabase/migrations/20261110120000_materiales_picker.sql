-- Picker de materiales (Electrilam): alias aprendidos, semilla de usos y las
-- RPC que alimentan el orden del picker y la bandeja de pendientes.
-- Spec: docs/superpowers/specs/2026-11-10-materiales-catalogo-picker-design.md

-- 1) Alias: lo que escribió un maestro → código. Lo escribe Claudio al resolver.
CREATE TABLE IF NOT EXISTS material_alias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  texto_norm   text NOT NULL,
  codigo       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, texto_norm)
);
ALTER TABLE material_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_alias_select ON material_alias FOR SELECT
  USING (workspace_id = my_workspace_id());
CREATE POLICY material_alias_write ON material_alias FOR ALL
  USING (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'))
  WITH CHECK (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));

-- 2) Semilla: usos históricos (texto libre pasado por el diccionario). Se llena
-- una vez (Task 7) y no se vuelve a escribir desde la app.
CREATE TABLE IF NOT EXISTS material_usos_semilla (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL,
  codigo       text NOT NULL,
  veces        int  NOT NULL,
  ultimo_uso   timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, usuario_id, codigo)
);
ALTER TABLE material_usos_semilla ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_usos_semilla_select ON material_usos_semilla FOR SELECT
  USING (workspace_id = my_workspace_id());

-- 3) El catálogo solo lo tocan owner/admin: los maestros eligen, no crean.
DROP POLICY IF EXISTS catalogo_materiales_insert ON catalogo_materiales;
DROP POLICY IF EXISTS catalogo_materiales_update ON catalogo_materiales;
DROP POLICY IF EXISTS catalogo_materiales_delete ON catalogo_materiales;
CREATE POLICY catalogo_materiales_insert ON catalogo_materiales FOR INSERT
  WITH CHECK (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));
CREATE POLICY catalogo_materiales_update ON catalogo_materiales FOR UPDATE
  USING (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'))
  WITH CHECK (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));
CREATE POLICY catalogo_materiales_delete ON catalogo_materiales FOR DELETE
  USING (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));

-- Id de la columna cuyo label, sin tildes ni mayúsculas, es uno de `labels`.
CREATE OR REPLACE FUNCTION hoja_columna_id(p_columnas jsonb, p_labels text[])
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT c->>'id' FROM jsonb_array_elements(coalesce(p_columnas, '[]'::jsonb)) c
  WHERE translate(lower(trim(c->>'label')), 'áéíóú', 'aeiou') = ANY (p_labels)
  LIMIT 1;
$$;

-- 4) Usos por código para ordenar el picker: los míos y los del equipo
-- (hojas con columna Código + semilla). SECURITY INVOKER: RLS de hojas aplica.
CREATE OR REPLACE FUNCTION material_usos()
RETURNS TABLE (codigo text, mios int, equipo int, ultimo_mio timestamptz)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH hojas AS (
    SELECT h.id, h.created_by, hoja_columna_id(h.columnas, ARRAY['codigo']) AS cod
    FROM hojas_inventario h
    WHERE h.workspace_id = my_workspace_id()
      AND h.tipo IN ('materiales_usados', 'materiales_solicitados')
  ), usos AS (
    SELECT h.created_by AS usuario_id, lower(trim(f.celdas->>h.cod)) AS codigo,
           count(*)::int AS veces, max(f.updated_at) AS ultimo
    FROM hojas h JOIN hojas_inventario_filas f ON f.hoja_id = h.id
    WHERE h.cod IS NOT NULL AND coalesce(trim(f.celdas->>h.cod), '') <> ''
    GROUP BY 1, 2
    UNION ALL
    SELECT s.usuario_id, lower(s.codigo), s.veces, s.ultimo_uso
    FROM material_usos_semilla s WHERE s.workspace_id = my_workspace_id()
  )
  SELECT u.codigo,
         coalesce(sum(u.veces) FILTER (WHERE u.usuario_id = auth.uid()), 0)::int,
         sum(u.veces)::int,
         max(u.ultimo) FILTER (WHERE u.usuario_id = auth.uid())
  FROM usos u GROUP BY u.codigo;
$$;

-- 5) Pendientes: filas con Material escrito y Código vacío, en hojas que
-- tienen columna Código (las viejas no la tienen: nunca cuentan).
CREATE OR REPLACE FUNCTION materiales_pendientes()
RETURNS TABLE (fila_id uuid, hoja_id uuid, orden_id uuid, numero int, autor text,
               fecha timestamptz, texto text, cantidad text)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH hojas AS (
    SELECT h.*, hoja_columna_id(h.columnas, ARRAY['codigo']) AS cod,
           hoja_columna_id(h.columnas, ARRAY['material','item','descripcion']) AS mat,
           hoja_columna_id(h.columnas, ARRAY['cantidad']) AS cant
    FROM hojas_inventario h
    WHERE h.workspace_id = my_workspace_id()
      AND h.tipo IN ('materiales_usados', 'materiales_solicitados')
      AND my_rol() IN ('owner', 'admin')
  )
  SELECT f.id, h.id, h.orden_id, o.numero, u.nombre, f.updated_at,
         trim(f.celdas->>h.mat), f.celdas->>h.cant
  FROM hojas h
  JOIN hojas_inventario_filas f ON f.hoja_id = h.id
  LEFT JOIN ordenes_trabajo o ON o.id = h.orden_id
  LEFT JOIN usuarios u ON u.id = h.created_by
  WHERE h.cod IS NOT NULL AND h.mat IS NOT NULL
    AND coalesce(trim(f.celdas->>h.mat), '') <> ''
    AND coalesce(trim(f.celdas->>h.cod), '') = ''
  ORDER BY f.updated_at DESC;
$$;

-- 6) Resolver un pendiente: escribe Material (descripción oficial) + Código en
-- la fila y aprende el alias (texto original → código), en una transacción.
CREATE OR REPLACE FUNCTION resolver_material_pendiente(p_fila_id uuid, p_codigo text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE
  v_fila hojas_inventario_filas;
  v_hoja hojas_inventario;
  v_mat text; v_cod text; v_desc text; v_codigo text;
BEGIN
  IF my_rol() NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'solo owner/admin'; END IF;
  SELECT * INTO v_fila FROM hojas_inventario_filas WHERE id = p_fila_id;
  SELECT * INTO v_hoja FROM hojas_inventario WHERE id = v_fila.hoja_id AND workspace_id = my_workspace_id();
  IF v_hoja.id IS NULL THEN RAISE EXCEPTION 'fila no encontrada'; END IF;
  SELECT codigo, descripcion INTO v_codigo, v_desc FROM catalogo_materiales
    WHERE workspace_id = v_hoja.workspace_id AND lower(codigo) = lower(p_codigo);
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'código % no está en el catálogo', p_codigo; END IF;
  v_mat := hoja_columna_id(v_hoja.columnas, ARRAY['material','item','descripcion']);
  v_cod := hoja_columna_id(v_hoja.columnas, ARRAY['codigo']);
  INSERT INTO material_alias (workspace_id, texto_norm, codigo)
  VALUES (v_hoja.workspace_id,
          translate(lower(trim(v_fila.celdas->>v_mat)), 'áéíóú', 'aeiou'), v_codigo)
  ON CONFLICT (workspace_id, texto_norm) DO UPDATE SET codigo = EXCLUDED.codigo;
  UPDATE hojas_inventario_filas
     SET celdas = celdas || jsonb_build_object(v_mat, v_desc, v_cod, v_codigo)
   WHERE id = p_fila_id;
END;
$$;

GRANT EXECUTE ON FUNCTION material_usos(), materiales_pendientes(),
  resolver_material_pendiente(uuid, text), hoja_columna_id(jsonb, text[]) TO authenticated;
