-- The mobile app upserts procedure step answers with:
--   onConflict: "ejecucion_id,paso_id"
-- PostgREST requires a matching unique/exclusion constraint for that conflict
-- target. Keep only the newest duplicate answer, then add the unique index.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY ejecucion_id, paso_id
      ORDER BY respondido_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.paso_respuestas
)
DELETE FROM public.paso_respuestas pr
USING ranked r
WHERE pr.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS paso_respuestas_ejecucion_id_paso_id_key
  ON public.paso_respuestas (ejecucion_id, paso_id);

NOTIFY pgrst, 'reload schema';;
