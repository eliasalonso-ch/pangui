-- Add jsonb config for 'personalizada' recurrencia and extend the CHECK to include it.
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS recurrencia_config jsonb;

ALTER TABLE public.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ot_recurrencia_check;

ALTER TABLE public.ordenes_trabajo
  ADD CONSTRAINT ot_recurrencia_check
  CHECK (recurrencia = ANY (ARRAY[
    'ninguna'::text,
    'diaria'::text,
    'semanal'::text,
    'mensual_fecha'::text,
    'mensual_dia'::text,
    'anual'::text,
    'personalizada'::text
  ]));

-- When recurrencia='personalizada' the config must be present and have an interval+unit.
ALTER TABLE public.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ot_recurrencia_config_required;

ALTER TABLE public.ordenes_trabajo
  ADD CONSTRAINT ot_recurrencia_config_required
  CHECK (
    recurrencia <> 'personalizada'
    OR (
      recurrencia_config IS NOT NULL
      AND (recurrencia_config ? 'interval')
      AND (recurrencia_config ? 'unit')
    )
  );;
