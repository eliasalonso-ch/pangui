-- Persona de contacto ("Atención:") de la orden de compra.
--
-- El PDF imprimía proveedores.contacto, un nombre en texto que la web ya no
-- edita desde que los contactos viven en proveedor_contactos. La OC elige uno
-- de esos contactos; el correo de envío va a esa persona y al correo del
-- proveedor.
--
-- SET NULL al borrar el contacto: la línea "Atención" no es un dato legal del
-- documento como la razón social o el RUT (ver 20261013190000).

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS contacto_id uuid
    REFERENCES public.proveedor_contactos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ordenes_compra_contacto_idx
  ON public.ordenes_compra (contacto_id) WHERE contacto_id IS NOT NULL;
