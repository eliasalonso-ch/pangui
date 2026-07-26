-- Import templates let workspace admins define how a company-standard Excel
-- maps onto Pangui data (e.g. "the materiales table lives at B5:E50, column 1
-- is codigo, column 2 is nombre"). A template is reused on every import so
-- regular users only have to upload the file and confirm a preview.

CREATE TABLE IF NOT EXISTS public.import_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  -- "materiales" for now; the column is here so future tipos (hoja de cálculo,
  -- procedimientos, etc.) can share the same table without a migration.
  tipo          text NOT NULL DEFAULT 'materiales',
  -- Sheet name within the workbook (null = first sheet). Lets a template
  -- target the right tab when files have a cover sheet + a data sheet.
  hoja          text,
  -- A1-style range, e.g. "B5:E50". The first row of the range is data —
  -- header rows are excluded by the admin when picking the range.
  rango         text NOT NULL,
  -- Per-column mapping: [{ col: 0, field: "codigo" }, { col: 1, field: "nombre" }, ...].
  -- `col` is the 0-indexed column offset within the range. `field` is one of
  -- codigo|nombre|unidad|cantidad|precio_unitario|descripcion|ignorar.
  columnas      jsonb NOT NULL,
  created_by    uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_templates_tipo_check CHECK (tipo IN ('materiales'))
);

CREATE INDEX IF NOT EXISTS import_templates_ws_tipo_idx
  ON public.import_templates (workspace_id, tipo);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_import_templates_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_import_templates_touch ON public.import_templates;
CREATE TRIGGER trg_import_templates_touch
  BEFORE UPDATE ON public.import_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_import_templates_touch();

-- RLS: everyone in the workspace can read templates (regular users need them
-- to run imports). Only owners/admins can create, edit, delete.

ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_templates_select ON public.import_templates;
CREATE POLICY import_templates_select ON public.import_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.workspace_id = import_templates.workspace_id
        AND u.activo = true
    )
  );

DROP POLICY IF EXISTS import_templates_insert ON public.import_templates;
CREATE POLICY import_templates_insert ON public.import_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.workspace_id = import_templates.workspace_id
        AND u.activo = true
        AND u.rol IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS import_templates_update ON public.import_templates;
CREATE POLICY import_templates_update ON public.import_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.workspace_id = import_templates.workspace_id
        AND u.activo = true
        AND u.rol IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS import_templates_delete ON public.import_templates;
CREATE POLICY import_templates_delete ON public.import_templates
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.workspace_id = import_templates.workspace_id
        AND u.activo = true
        AND u.rol IN ('owner', 'admin')
    )
  );
