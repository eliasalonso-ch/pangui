
CREATE TABLE IF NOT EXISTS public.foto_grupos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id     uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  titulo       text NOT NULL DEFAULT '',
  descripcion  text NOT NULL DEFAULT '',
  orden_display integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.foto_grupo_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id     uuid NOT NULL REFERENCES public.foto_grupos(id) ON DELETE CASCADE,
  url          text NOT NULL,
  orden_display integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.foto_grupos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foto_grupo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can manage foto_grupos"
  ON public.foto_grupos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.workspace_id = foto_grupos.workspace_id
    )
  );

CREATE POLICY "workspace members can manage foto_grupo_items"
  ON public.foto_grupo_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.foto_grupos g
      JOIN public.usuarios u ON u.workspace_id = g.workspace_id
      WHERE g.id = foto_grupo_items.grupo_id AND u.id = auth.uid()
    )
  );
;
