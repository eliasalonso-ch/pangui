-- Retire the last two dead tipo_trabajo values.
--
-- `mejora` and `inspeccion` were dropped from the product vocabulary but the
-- CHECK still allowed them. 3 live `mejora` rows (#320, #322, #391, June 2026)
-- surfaced as an "Otro" bucket on the analitica "Ordenes de trabajo por tipo"
-- chart, and 1 soft-deleted `inspeccion` row was still on the table.
--
-- Mapped to `reactiva`, not `emergencia`: the titles are improvement work
-- ("Mejora iluminacion Gea", "Instalacion de 2 ctos enchufes"), which is
-- unplanned corrective work rather than an emergency.
--
-- The soft-deleted row is migrated too. The CHECK applies to every row on the
-- table regardless of deleted_at, so leaving it would block the tightening.

UPDATE public.ordenes_trabajo
SET tipo_trabajo = 'reactiva'
WHERE tipo_trabajo IN ('mejora', 'inspeccion');

ALTER TABLE public.ordenes_trabajo DROP CONSTRAINT ot_tipo_trabajo_check;

ALTER TABLE public.ordenes_trabajo ADD CONSTRAINT ot_tipo_trabajo_check
  CHECK (
    tipo_trabajo IS NULL
    OR tipo_trabajo = ANY (ARRAY['reactiva'::text, 'preventiva'::text, 'emergencia'::text, 'levantamiento'::text, 'presupuesto'::text])
  );
