-- Make `completado_en` a reliable completion timestamp.
--
-- Problem: the Órdenes list sorts "Más recientes primero" by created_at, so an
-- OT created weeks ago but closed today sorts far down the Completas tab. The
-- fix is a "Completadas recientemente" sort, but that needs a trustworthy
-- completion time and `completado_en` was only ever written by the v1 command
-- path — the legacy direct-UPDATE path left it NULL (425 of 504 completed OTs).
--
-- This migration stamps it from now on and backfills the history.

-- ── 1. Always stamp completado_en on completion ──────────────────────────────
--
-- A trigger rather than fixing each caller: several paths can complete an OT
-- (the v1 RPC, the legacy update, the recurrence machinery), and the column must
-- be correct regardless of which one ran. It only fills gaps — a value already
-- supplied by the caller wins, so the RPC's clock_timestamp() is preserved.

CREATE OR REPLACE FUNCTION public.set_ot_completado_en()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado IS DISTINCT FROM 'completado' THEN
    IF NEW.completado_en IS NULL THEN
      NEW.completado_en := now();
    END IF;
  -- Reopening clears it so the OT is not treated as completed by later sorts.
  ELSIF NEW.estado IS DISTINCT FROM 'completado' AND OLD.estado = 'completado' THEN
    NEW.completado_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ot_completado_en() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_ot_completado_en ON public.ordenes_trabajo;
CREATE TRIGGER trg_set_ot_completado_en
BEFORE UPDATE OF estado ON public.ordenes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.set_ot_completado_en();

COMMENT ON FUNCTION public.set_ot_completado_en() IS
  'Stamps ordenes_trabajo.completado_en when an OT is completed and clears it on reopen. Only fills gaps: an explicit value from the caller is kept.';

-- ── 2. Backfill existing completed OTs ───────────────────────────────────────
--
-- Preferred source is the 'completado' entry in actividad_ot, which records when
-- the transition actually happened. Where no such entry exists (imported or very
-- old rows) fall back to updated_at, which at least keeps the ordering roughly
-- right. deleted_at IS NULL is deliberately NOT filtered: a trashed OT can be
-- restored, and it should come back with its timestamp intact.

WITH ultima_actividad AS (
  SELECT orden_id, max(created_at) AS completado_ts
  FROM public.actividad_ot
  WHERE tipo = 'completado'
  GROUP BY orden_id
)
UPDATE public.ordenes_trabajo o
SET completado_en = COALESCE(ua.completado_ts, o.updated_at)
FROM (SELECT id FROM public.ordenes_trabajo WHERE estado = 'completado' AND completado_en IS NULL) target
LEFT JOIN ultima_actividad ua ON ua.orden_id = target.id
WHERE o.id = target.id;

-- Supports "Completadas recientemente" without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_completado_en
  ON public.ordenes_trabajo (workspace_id, completado_en DESC)
  WHERE estado = 'completado';

NOTIFY pgrst, 'reload schema';
