-- ---------------------------------------------------------------------------
-- Teardown for scripts/demo/seed-activo-reliability-demo.sql
-- ---------------------------------------------------------------------------
-- Removes every row the demo seed created, and nothing else. The demo OTs are
-- identified by the '[DEMO-RELIABILITY]' marker in `observacion`; the demo
-- asset by the '(DEMO)' suffix in its name.
--
-- Run this before a real customer demo, or any time the fake reliability
-- history should stop showing up in Electrilam.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

begin;

-- actividad_activo rows are written by fn_log_actividad_activo_from_ot when an
-- OT is linked/completed, so they must go too -- they cascade off the asset in
-- most schemas, but delete explicitly in case the FK is not ON DELETE CASCADE.
delete from actividad_activo
 where activo_id in (
   select id from activos
    where workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7'
      and nombre like '%(DEMO)%'
 );

delete from ordenes_trabajo
 where workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7'
   and observacion like '[DEMO-RELIABILITY]%';

delete from activos
 where workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7'
   and nombre like '%(DEMO)%';

commit;

select 'Demo data removed' as resultado,
       (select count(*) from activos
         where workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7'
           and nombre like '%(DEMO)%') as activos_demo_restantes,
       (select count(*) from ordenes_trabajo
         where observacion like '[DEMO-RELIABILITY]%') as ots_demo_restantes;
