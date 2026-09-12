-- Motivos de parada imprevista + su captura obligatoria al registrar una avería.
--
-- El gráfico de Pareto ("qué causa detiene más veces la línea") necesita agrupar
-- fallas por causa, y para eso la causa tiene que ser un valor de catálogo, no
-- texto libre: "aserrin", "aserrín", "acumulacion de polvo" y "sawdust" son
-- cuatro barras distintas para el mismo problema, y el Pareto deja de decir
-- nada. `activo_estado_periodos.notas` sigue existiendo para el detalle de cada
-- evento; esto es la clasificación.
--
-- El catálogo es por workspace y editable desde la UI —el desplegable permite
-- crear lo que no existe—, porque cada planta tiene su propio vocabulario de
-- fallas. Los valores que se siembran son un punto de partida, no una lista
-- cerrada: lo que no se puede nombrar termina cayendo en "Otro", que es donde
-- el Pareto deja de servir.
--
-- Mismo patrón que `oficios` y `cargos`: catálogo por workspace, con `activo`
-- para poder retirar un motivo sin romper el historial que ya lo usa.

CREATE TABLE IF NOT EXISTS public.motivos_inactividad (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  slug         text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motivos_inactividad_nombre_no_vacio CHECK (btrim(nombre) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS motivos_inactividad_ws_slug_uniq
  ON public.motivos_inactividad (workspace_id, slug);

CREATE INDEX IF NOT EXISTS idx_motivos_inactividad_ws
  ON public.motivos_inactividad (workspace_id) WHERE activo;

ALTER TABLE public.motivos_inactividad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS motivos_inactividad_select ON public.motivos_inactividad;
CREATE POLICY motivos_inactividad_select ON public.motivos_inactividad
  FOR SELECT USING (workspace_id = public.my_workspace_id());

DROP POLICY IF EXISTS motivos_inactividad_insert ON public.motivos_inactividad;
CREATE POLICY motivos_inactividad_insert ON public.motivos_inactividad
  FOR INSERT WITH CHECK (workspace_id = public.my_workspace_id());

DROP POLICY IF EXISTS motivos_inactividad_update ON public.motivos_inactividad;
CREATE POLICY motivos_inactividad_update ON public.motivos_inactividad
  FOR UPDATE USING (workspace_id = public.my_workspace_id());

-- El motivo se guarda en el período de parada.
--
-- Nullable a propósito: los períodos que ya existen no tienen motivo y siguen
-- siendo válidos. La obligatoriedad se aplica en `cambiar_estado_activo`, que es
-- el único camino de escritura de la UI; un NOT NULL invalidaría el historial
-- anterior.
ALTER TABLE public.activo_estado_periodos
  ADD COLUMN IF NOT EXISTS motivo_id uuid REFERENCES public.motivos_inactividad(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activo_estado_periodos_motivo
  ON public.activo_estado_periodos (motivo_id) WHERE motivo_id IS NOT NULL;

COMMENT ON COLUMN public.activo_estado_periodos.motivo_id IS
  'Causa de la parada imprevista, de catálogo. Alimenta el Pareto de motivos.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Semilla de motivos para los workspaces que ya existen.
--
-- Sin esto el desplegable arranca vacío y el primer técnico que registre una
-- avería tiene que inventar la taxonomía él solo, apurado, con la máquina
-- parada. Se siembran los modos de falla comunes de una planta; cada workspace
-- los edita después.
INSERT INTO public.motivos_inactividad (workspace_id, nombre, slug)
SELECT w.id, v.nombre, v.slug
FROM public.workspaces w
CROSS JOIN (VALUES
  ('Acumulacion de aserrin / limpieza','aserrin'),
  ('Falla electrica / motor','electrica-motor'),
  ('Rodamiento o lubricacion','rodamiento'),
  ('Sensor o instrumentacion','sensor'),
  ('Atasco de material','atasco'),
  ('Falla hidraulica / neumatica','hidraulica'),
  ('Error de operacion','operacion'),
  ('Falta de repuesto','falta-repuesto'),
  ('Otro','otro')
) AS v(nombre, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivos_inactividad m
   WHERE m.workspace_id = w.id AND m.slug = v.slug
);
