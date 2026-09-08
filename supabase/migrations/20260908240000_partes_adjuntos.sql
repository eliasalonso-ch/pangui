-- Adjuntos del material (manuales, fichas tecnicas, fotos extra).
--
-- Mismo formato jsonb que activos.adjuntos: [{url, nombre, tipo, mime, size,
-- uploaded_at}]. `partes` ya tenia archivo_url/archivo_nombre, pero eso guarda
-- UN solo archivo; un repuesto suele traer ficha + manual + certificado.
--
-- Los archivo_url que ya existen se migran a la primera entrada del arreglo
-- para no perderlos, y las columnas viejas se dejan en su sitio: siguen siendo
-- la fuente de ese dato para cualquier cliente que aun las lea.
ALTER TABLE public.partes
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.partes
SET adjuntos = jsonb_build_array(
      jsonb_build_object(
        'url', archivo_url,
        'nombre', COALESCE(archivo_nombre, 'Adjunto'),
        'tipo', 'archivo',
        'mime', NULL,
        'size', NULL,
        'uploaded_at', COALESCE(updated_at, now())
      )
    )
WHERE archivo_url IS NOT NULL
  AND adjuntos = '[]'::jsonb;
