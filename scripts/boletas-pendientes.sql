-- Datos para emitir las boletas de honorarios electrónicas del mes.
--
-- Uso (PowerShell):
--   cd C:\dev\pangui
--   npx supabase db query --linked (Get-Content scripts/boletas-pendientes.sql -Raw)
--
-- Devuelve una fila por suscripción activa con todo lo que pide el formulario
-- del SII (sii.cl → Boleta de Honorarios Electrónica → Emitir boletas):
-- RUT y nombre del receptor, monto bruto, y el correo al que hay que enviarla.
--
-- Recordatorio: al emitir, usar la opción "Enviar Boleta por e-mail" del SII
-- con el billing_email de esta consulta. La app le promete al cliente que la
-- boleta llega a ese correo (ver el "Resumen legal y de cobro" en
-- /configuracion/suscripcion).
--
-- El monto es bruto. Si el receptor es una empresa obligada a retener, la
-- retención del impuesto de segunda categoría se aplica sobre ese monto y la
-- entera el receptor, no el emisor.

select
  w.nombre                                            as workspace,
  coalesce(bp.razon_social, '⚠ SIN DATOS')            as receptor,
  coalesce(bp.rut, '⚠ SIN RUT')                       as rut_receptor,
  coalesce(bp.billing_email, '⚠ SIN EMAIL')           as enviar_a,
  s.price_per_user_clp * (
    select count(*) from usuarios u
    where u.workspace_id = s.workspace_id and u.activo
  )                                                   as monto_bruto_clp,
  (select count(*) from usuarios u
   where u.workspace_id = s.workspace_id and u.activo) as usuarios_activos,
  s.current_period_start::date                        as periodo_desde,
  s.current_period_end::date                          as periodo_hasta,
  s.status
from subscriptions s
join workspaces w        on w.id = s.workspace_id
left join billing_profiles bp on bp.workspace_id = s.workspace_id
where s.flow_subscription_id is not null
  and s.status in ('active', 'past_due')
order by s.current_period_start desc;
