-- Verifica que 20260817120000_facturacion_spa_iva.sql quedó aplicada.
--
-- Correr en el SQL Editor de Supabase DESPUÉS de aplicar la migración.
-- Todas las filas deben decir OK. Si alguna dice FALTA, esa parte no se aplicó.

select 'columnas de billing_profiles' as verificacion,
       case when count(*) = 3 then 'OK' else 'FALTA (' || count(*) || '/3)' end as resultado,
       string_agg(column_name, ', ' order by column_name) as detalle
  from information_schema.columns
 where table_name = 'billing_profiles'
   and column_name in ('giro', 'ciudad', 'tipo_receptor')

union all

select 'tabla documentos_tributarios',
       case when count(*) = 1 then 'OK' else 'FALTA' end,
       null
  from information_schema.tables
 where table_name = 'documentos_tributarios'

union all

select 'columnas de documentos_tributarios',
       case when count(*) >= 20 then 'OK' else 'FALTA (' || count(*) || ')' end,
       count(*)::text || ' columnas'
  from information_schema.columns
 where table_name = 'documentos_tributarios'

union all

select 'constraint de cuadre neto+iva=total',
       case when count(*) = 1 then 'OK' else 'FALTA' end,
       null
  from pg_constraint
 where conname = 'documentos_tributarios_cuadra'

union all

select 'índices de documentos_tributarios',
       case when count(*) >= 5 then 'OK' else 'FALTA (' || count(*) || '/5)' end,
       string_agg(indexname, ', ' order by indexname)
  from pg_indexes
 where tablename = 'documentos_tributarios'

union all

select 'RLS activo en documentos_tributarios',
       case when bool_and(relrowsecurity) then 'OK' else 'FALTA' end,
       null
  from pg_class
 where relname = 'documentos_tributarios'

union all

select 'política de lectura por workspace',
       case when count(*) = 1 then 'OK' else 'FALTA' end,
       null
  from pg_policies
 where tablename = 'documentos_tributarios'

union all

select 'idempotency_key en subscription_events',
       case when count(*) = 1 then 'OK' else 'FALTA' end,
       null
  from information_schema.columns
 where table_name = 'subscription_events'
   and column_name = 'idempotency_key'

union all

select 'índice único de idempotencia',
       case when count(*) = 1 then 'OK' else 'FALTA' end,
       null
  from pg_indexes
 where indexname = 'uniq_sub_events_idempotency';
