-- Materiales que consume cada ejecucion del plan.
--
-- Es la pieza que hace posible la orden de compra: cuando una ocurrencia entra
-- en su ventana de aviso se sabe QUE se necesita y CUANTO, se compara contra
-- partes.stock_actual y lo que falta es lo que hay que comprar.
--
-- Va ligado al catalogo (parte_id) y no a texto libre justamente por eso: un
-- material escrito a mano no se puede descontar de stock ni tiene proveedor.
CREATE TABLE IF NOT EXISTS public.plan_materiales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.planes_mantencion(id) ON DELETE CASCADE,
  parte_id uuid NOT NULL REFERENCES public.partes(id) ON DELETE RESTRICT,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_materiales_unico UNIQUE (plan_id, parte_id)
);

CREATE INDEX IF NOT EXISTS plan_materiales_plan_idx
  ON public.plan_materiales (plan_id);

ALTER TABLE public.plan_materiales ENABLE ROW LEVEL SECURITY;

-- Se hereda el permiso del plan: si puedes ver el plan, ves sus materiales.
DROP POLICY IF EXISTS plan_materiales_select ON public.plan_materiales;
CREATE POLICY plan_materiales_select ON public.plan_materiales
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.planes_mantencion p
    JOIN public.usuarios u ON u.workspace_id = p.workspace_id
    WHERE p.id = plan_id AND u.id = auth.uid()
  ));

DROP POLICY IF EXISTS plan_materiales_write ON public.plan_materiales;
CREATE POLICY plan_materiales_write ON public.plan_materiales
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.planes_mantencion p
    JOIN public.usuarios u ON u.workspace_id = p.workspace_id
    WHERE p.id = plan_id AND u.id = auth.uid() AND u.rol IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.planes_mantencion p
    JOIN public.usuarios u ON u.workspace_id = p.workspace_id
    WHERE p.id = plan_id AND u.id = auth.uid() AND u.rol IN ('owner','admin')
  ));

-- Proveedor preferido del plan. Opcional: sin el, la orden de compra usa el
-- proveedor que ya tiene cada material en el catalogo (material_proveedores).
ALTER TABLE public.planes_mantencion
  ADD COLUMN IF NOT EXISTS proveedor_id uuid
    REFERENCES public.proveedores(id) ON DELETE SET NULL;

-- Imagenes y archivos que hereda cada OT generada (planos, manuales, fotos de
-- referencia). Mismo formato jsonb que activos.adjuntos.
ALTER TABLE public.planes_mantencion
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.planes_mantencion
  ADD COLUMN IF NOT EXISTS imagen_url text;
