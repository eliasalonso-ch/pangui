-- Templates now store the sample file so exports can fill it with OT data.
ALTER TABLE public.import_templates
  ADD COLUMN IF NOT EXISTS archivo_url    text,
  ADD COLUMN IF NOT EXISTS archivo_nombre text;
