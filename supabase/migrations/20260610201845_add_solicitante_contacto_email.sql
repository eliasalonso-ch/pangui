-- Solicitante (requester) contact info.
-- Catalog table holds reusable contact info for autocomplete; the OT snapshots
-- the chosen contact at create/edit time so historical PDFs stay frozen.

ALTER TABLE public.solicitantes
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS solicitante_telefono text,
  ADD COLUMN IF NOT EXISTS solicitante_email text;;
