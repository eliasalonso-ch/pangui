-- Los proveedores ahora se pueden borrar (antes sólo se archivaban). Una orden
-- de compra no guarda copia de los datos del proveedor (razón social, RUT,
-- dirección del bloque "SEÑORES:"), así que con SET NULL borrar al proveedor
-- dejaba OCs emitidas sin destinatario. RESTRICT hace que la base lo rechace;
-- la web ofrece archivarlo en su lugar.
--
-- El resto de las referencias quedan como estaban: activos, materiales,
-- planes e ingresos de stock pasan a "sin proveedor" (SET NULL) y los
-- contactos y vínculos de materiales se borran (CASCADE).

ALTER TABLE public.ordenes_compra
  DROP CONSTRAINT IF EXISTS ordenes_compra_proveedor_id_fkey,
  ADD CONSTRAINT ordenes_compra_proveedor_id_fkey
    FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT;
