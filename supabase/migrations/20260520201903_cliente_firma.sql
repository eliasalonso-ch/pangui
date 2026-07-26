-- Client signature on OT completion (subcontratista mode only). All optional —
-- the technician can complete an OT without collecting a client signature when
-- the client rep isn't physically present.
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS cliente_firma_url text,
  ADD COLUMN IF NOT EXISTS cliente_firma_nombre text,
  ADD COLUMN IF NOT EXISTS cliente_firma_at timestamptz;;
