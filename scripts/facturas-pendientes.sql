-- Documentos tributarios pendientes de emitir.
--
-- Reemplaza a scripts/boletas-pendientes.sql: Pangui factura como SpA (primera
-- categoría), así que el documento es la FACTURA ELECTRÓNICA AFECTA A IVA
-- (DTE 33), no la boleta de honorarios. Una SpA no puede emitir BHE.
--
-- Uso (PowerShell):
--   cd C:\dev\pangui
--   npx supabase db query --linked (Get-Content scripts/facturas-pendientes.sql -Raw)
--
-- Emisión: https://www.sii.cl → Servicios online → Factura electrónica →
-- Sistema de facturación gratuito del SII → Emitir factura electrónica.
--
-- Tras emitir, registra el folio para que el período quede cerrado:
--   update documentos_tributarios
--      set folio = <folio>, estado = 'emitido', emitido_at = now()
--    where id = '<id>';
--
-- IMPORTANTE SOBRE LOS MONTOS
-- Los precios del catálogo son BRUTOS (IVA incluido). El desglose que aparece
-- acá replica lib/tributario.ts: neto = round(bruto / 1.19) e IVA = la RESTA
-- contra el bruto. Nunca calcules el IVA como round(neto * 0.19): descuadra en
-- $1 para ciertos montos y el SII rechaza el documento.

-- ── 1. Documentos ya registrados que faltan emitir ─────────────────────────
select
  dt.id,
  dt.tipo_dte,
  case dt.tipo_dte when 33 then 'Factura afecta'
                   when 39 then 'Boleta de venta'
                   when 61 then 'Nota de crédito' end          as documento,
  w.nombre                                                     as workspace,
  dt.receptor_razon_social                                     as receptor,
  dt.receptor_rut                                              as rut,
  dt.receptor_giro                                             as giro,
  dt.receptor_direccion                                        as direccion,
  dt.receptor_comuna                                           as comuna,
  dt.receptor_ciudad                                           as ciudad,
  dt.receptor_email                                            as enviar_a,
  dt.usuarios_facturados                                       as usuarios,
  dt.precio_unitario_clp                                       as precio_bruto_unitario,
  dt.neto_clp                                                  as neto,
  dt.iva_clp                                                   as iva,
  dt.total_clp                                                 as total,
  dt.periodo_inicio,
  dt.periodo_fin,
  dt.estado
from documentos_tributarios dt
join workspaces w on w.id = dt.workspace_id
where dt.estado in ('pendiente', 'error')
order by dt.periodo_inicio, w.nombre;

-- ── 2. Períodos cobrados que aún no tienen documento registrado ────────────
--
-- Red de seguridad: si el webhook no alcanzó a registrar el documento, el
-- período aparece acá. Los montos se calculan igual que lib/tributario.ts.
-- `⚠` marca los datos que faltan en el perfil de facturación y que el SII
-- exige — sin ellos no se puede emitir.
with cobros as (
  select
    s.id                                    as subscription_id,
    s.workspace_id,
    s.current_period_start::date            as periodo_inicio,
    s.current_period_end::date              as periodo_fin,
    s.price_per_user_clp                    as precio_unitario,
    (select count(*) from usuarios u
      where u.workspace_id = s.workspace_id
        and u.activo
        and u.excluir_de_facturacion = false
        and u.deleted_at is null)           as usuarios
  from subscriptions s
  where s.flow_subscription_id is not null
    and s.status in ('active', 'past_due')
)
select
  w.nombre                                              as workspace,
  coalesce(bp.razon_social, '⚠ SIN RAZÓN SOCIAL')       as receptor,
  coalesce(bp.rut,          '⚠ SIN RUT')                as rut,
  coalesce(bp.giro,         '⚠ SIN GIRO')               as giro,
  coalesce(bp.domicilio,    '⚠ SIN DIRECCIÓN')          as direccion,
  coalesce(bp.comuna,       '⚠ SIN COMUNA')             as comuna,
  coalesce(bp.ciudad,       '⚠ SIN CIUDAD')             as ciudad,
  coalesce(bp.billing_email,'⚠ SIN EMAIL')              as enviar_a,
  coalesce(bp.tipo_receptor, 'empresa')                 as tipo_receptor,
  c.usuarios,
  c.precio_unitario                                     as precio_bruto_unitario,
  round((c.precio_unitario * c.usuarios) / 1.19)::int   as neto,
  (c.precio_unitario * c.usuarios)
    - round((c.precio_unitario * c.usuarios) / 1.19)::int as iva,
  (c.precio_unitario * c.usuarios)                      as total,
  c.periodo_inicio,
  c.periodo_fin
from cobros c
join workspaces w             on w.id = c.workspace_id
left join billing_profiles bp on bp.workspace_id = c.workspace_id
where not exists (
  select 1 from documentos_tributarios dt
   where dt.subscription_id = c.subscription_id
     and dt.periodo_inicio  = c.periodo_inicio
     and dt.periodo_fin     = c.periodo_fin
     and dt.estado <> 'anulado'
)
order by c.periodo_inicio desc, w.nombre;
