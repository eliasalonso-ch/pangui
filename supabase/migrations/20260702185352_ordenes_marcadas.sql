CREATE TABLE IF NOT EXISTS public.ordenes_marcadas (
  orden_id   uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.usuarios(id)        ON DELETE CASCADE,
  marcada_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (orden_id, user_id)
);

CREATE INDEX IF NOT EXISTS ordenes_marcadas_user_idx
  ON public.ordenes_marcadas (user_id);

ALTER TABLE public.ordenes_marcadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordenes_marcadas_select ON public.ordenes_marcadas;
CREATE POLICY ordenes_marcadas_select ON public.ordenes_marcadas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS ordenes_marcadas_insert ON public.ordenes_marcadas;
CREATE POLICY ordenes_marcadas_insert ON public.ordenes_marcadas
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ordenes_marcadas_delete ON public.ordenes_marcadas;
CREATE POLICY ordenes_marcadas_delete ON public.ordenes_marcadas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());;
