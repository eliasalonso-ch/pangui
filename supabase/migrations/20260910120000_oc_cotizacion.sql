-- Cotizacion de respaldo y control de precios confirmados.
--
-- POR QUE: una orden de compra chilena declara "precios ACORDADOS" y tiene
-- valor legal — deja constancia de un acuerdo entre las partes. Pero la OC que
-- genera el plan toma los precios de `partes.precio_unitario`, que es el
-- catalogo interno: el ultimo valor que alguien anoto en inventario, no algo
-- que el proveedor haya cotizado. Enviarla asi afirma un acuerdo que no existe.
--
-- Se resuelve por dos lados:
--   1. `precios_confirmados` marca que un humano reviso los precios contra el
--      proveedor. La UI avisa mientras este en false.
--   2. `cotizacion_numero` / `cotizacion_fecha` dejan el respaldo por escrito,
--      y el PDF los imprime como "Segun cotizacion N° X del DD/MM/YYYY".
--
-- Ninguno es obligatorio: una OC de $5.000 no necesita cotizacion formal, y
-- exigirla haria que nadie use el modulo.

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS cotizacion_numero text,
  ADD COLUMN IF NOT EXISTS cotizacion_fecha date,
  -- Las OCs manuales se dan por confirmadas: quien las escribe a mano esta
  -- tecleando el precio que le pasaron. Las del plan nacen en false.
  ADD COLUMN IF NOT EXISTS precios_confirmados boolean NOT NULL DEFAULT true;

-- Las ya generadas por el cron no fueron confirmadas por nadie.
UPDATE public.ordenes_compra
SET precios_confirmados = false
WHERE origen = 'plan_mantencion' AND estado IN ('borrador', 'pendiente_aprobacion');
