-- Varias personas de contacto por proveedor.
--
-- proveedores.contacto era un solo nombre en texto. Se mantiene porque la app
-- móvil 1.5.0 todavía lo escribe; la web lo muestra sólo si el proveedor no
-- tiene contactos. El correo y teléfono del proveedor siguen siendo los de la
-- empresa (al correo se envían las órdenes de compra).
--
-- Sin workspace_id propio: el workspace sale del proveedor, así un contacto no
-- puede quedar colgado de un proveedor de otro workspace.

CREATE TABLE IF NOT EXISTS public.proveedor_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  cargo text,
  email text,
  telefono text,
  anexo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proveedor_contactos_proveedor_idx
  ON public.proveedor_contactos (proveedor_id, created_at);

ALTER TABLE public.proveedor_contactos ENABLE ROW LEVEL SECURITY;

-- Mismas reglas que proveedores: lee el workspace, escriben owner/admin.
DROP POLICY IF EXISTS proveedor_contactos_select ON public.proveedor_contactos;
CREATE POLICY proveedor_contactos_select ON public.proveedor_contactos
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = proveedor_contactos.proveedor_id AND p.workspace_id = (SELECT public.my_workspace_id())
  ));

DROP POLICY IF EXISTS proveedor_contactos_write ON public.proveedor_contactos;
CREATE POLICY proveedor_contactos_write ON public.proveedor_contactos
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.proveedores p
    JOIN public.usuarios u ON u.workspace_id = p.workspace_id
    WHERE p.id = proveedor_contactos.proveedor_id
      AND u.id = (SELECT auth.uid()) AND u.rol IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.proveedores p
    JOIN public.usuarios u ON u.workspace_id = p.workspace_id
    WHERE p.id = proveedor_contactos.proveedor_id
      AND u.id = (SELECT auth.uid()) AND u.rol IN ('owner', 'admin')
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proveedor_contactos TO authenticated;
