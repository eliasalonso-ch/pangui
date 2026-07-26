-- Mandatory-before-starting procedimiento: the mirror of bloquea_cierre_ot.
-- When true, the procedimiento must be completed before work on the OT can
-- start (and the OT cannot be closed). It also auto-attaches to every new OT
-- in the workspace, like auto_adjuntar.
ALTER TABLE public.procedimientos
  ADD COLUMN IF NOT EXISTS bloquea_inicio boolean NOT NULL DEFAULT false;

-- Auto-attach procedimientos that are either auto_adjuntar OR bloquea_inicio.
CREATE OR REPLACE FUNCTION public.auto_adjuntar_procedimientos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO ot_procedimientos (orden_id, procedimiento_id)
  SELECT NEW.id, p.id
  FROM procedimientos p
  WHERE p.workspace_id = NEW.workspace_id
    AND p.activo = true
    AND (p.auto_adjuntar = true OR p.bloquea_inicio = true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;;
