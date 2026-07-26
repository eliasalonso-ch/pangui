-- Multi-attachment list (R2 URLs + metadata) for activos.
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;;
