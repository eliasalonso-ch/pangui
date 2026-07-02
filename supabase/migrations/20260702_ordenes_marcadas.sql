-- Per-user "marcar como leída/vista" for work orders. A generic per-user read
-- marker (like an email's read/unread) — the app doesn't dictate the meaning.
-- Concrete use: a biller marks each OT once he's added it to his own Excel /
-- invoiced it, so he knows what's still pending. Marker is PER USER: one person
-- marking an OT does not affect what a teammate sees.
--
-- Row exists = marked for that user. No row = unmarked. Toggle = insert/delete.
-- No boolean/nullable column needed.

CREATE TABLE IF NOT EXISTS public.ordenes_marcadas (
  orden_id   uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.usuarios(id)        ON DELETE CASCADE,
  marcada_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (orden_id, user_id)
);

-- List/export reads "which of these OTs has the current user marked" — index by user.
CREATE INDEX IF NOT EXISTS ordenes_marcadas_user_idx
  ON public.ordenes_marcadas (user_id);

-- RLS: a user only ever sees and writes THEIR OWN markers. No workspace-admin
-- override — this is private per-user state, not shared workspace data.
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
  USING (user_id = auth.uid());
