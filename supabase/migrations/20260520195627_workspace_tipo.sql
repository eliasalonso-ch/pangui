-- Workspace tipo: drives the UI's conditional client/sociedad concept.
-- 'propietario'    = owns the assets being maintained (in-house facility / plant)
-- 'subcontratista' = maintains assets owned by clients (current customer)
-- 'hibrido'        = both — surfaces every UI affordance
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'subcontratista'
  CHECK (tipo IN ('propietario', 'subcontratista', 'hibrido'));;
