-- Índices para las FK que apuntan a ordenes_trabajo y no tenían.
--
-- Al borrar una OT, Postgres busca las filas hijas de cada FK; sin índice es
-- un seq scan por tabla (el DELETE de una OT promedia 110 ms en prod). Hoy las
-- tablas son chicas; esto evita que el borrado crezca con ellas.
--
-- Solo las FK hacia ordenes_trabajo. Las columnas *_por (-> usuarios) quedan
-- sin índice a propósito: solo importan al borrar un usuario, que casi no pasa.

create index if not exists idx_plan_ocurrencias_orden_id
  on public.plan_ocurrencias (orden_id) where orden_id is not null;
create index if not exists idx_ordenes_compra_orden_trabajo_id
  on public.ordenes_compra (orden_trabajo_id) where orden_trabajo_id is not null;
create index if not exists idx_automatizacion_ejecuciones_orden_id
  on public.automatizacion_ejecuciones (orden_id) where orden_id is not null;
create index if not exists idx_wo_notification_outbox_aggregate_id
  on public.work_order_notification_outbox (aggregate_id);
