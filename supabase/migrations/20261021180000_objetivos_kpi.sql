-- Objetivos de KPI de confiabilidad (plan Empresa).
--
-- Como los "Asset Health Goals" de MaintainX: por cada KPI se fija un valor
-- "bueno" y uno "malo", más un umbral opcional de "alerta" entre ambos para
-- avisar antes de llegar a malo:
--   bueno ── aceptable ── alerta ── en riesgo ── malo
-- Se configura desde el engranaje de cada gráfico. Una meta por KPI para todo
-- el workspace, como MaintainX: metas por criticidad o por activo serían más
-- finas, pero un cliente con cientos de activos no las mantiene. Sin meta
-- configurada, la app usa una de referencia de la industria.
--
-- KPIs y unidades:
--   disponibilidad  %  más es mejor
--   mtbf            h  más es mejor
--   mttr            h  menos es mejor
--   planificada     %  más es mejor (parte de la parada total que fue planificada)
--
-- Leer: cualquiera del workspace. Escribir: owner/admin, y solo con plan Empresa
-- (también se valida acá, no solo escondiendo el botón).

create table if not exists public.objetivos_kpi (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kpi          text not null check (kpi in ('disponibilidad', 'mtbf', 'mttr', 'planificada')),
  bueno        numeric not null check (bueno >= 0),
  alerta       numeric check (alerta >= 0),            -- null = sin nivel "en riesgo"
  malo         numeric not null check (malo >= 0),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.usuarios(id) on delete set null,
  -- La dirección depende del KPI: en MTTR menos es mejor.
  constraint objetivos_kpi_direccion
    check (case when kpi = 'mttr' then bueno < malo else bueno > malo end),
  -- La alerta, si está, queda estrictamente entre bueno y malo.
  constraint objetivos_kpi_alerta_entre
    check (alerta is null or case when kpi = 'mttr' then bueno < alerta and alerta < malo
                                  else bueno > alerta and alerta > malo end),
  constraint objetivos_kpi_porcentaje
    check (kpi not in ('disponibilidad', 'planificada')
           or (bueno <= 100 and malo <= 100 and coalesce(alerta, 0) <= 100)),
  -- Una meta por KPI en cada workspace.
  constraint objetivos_kpi_uno unique (workspace_id, kpi)
);

-- Quién y cuándo, puesto por la base para que no dependa del cliente.
create or replace function public.fn_objetivos_kpi_sello()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_objetivos_kpi_sello on public.objetivos_kpi;
create trigger trg_objetivos_kpi_sello
  before insert or update on public.objetivos_kpi
  for each row execute function public.fn_objetivos_kpi_sello();

alter table public.objetivos_kpi enable row level security;

drop policy if exists objetivos_kpi_select on public.objetivos_kpi;
create policy objetivos_kpi_select on public.objetivos_kpi
  for select to authenticated
  using (workspace_id = (select my_workspace_id()));

-- owner/admin del workspace y plan Empresa. fn_effective_plan es security
-- invoker: lee `subscriptions`, que el usuario ya puede ver de su workspace.
drop policy if exists objetivos_kpi_escribir on public.objetivos_kpi;
create policy objetivos_kpi_escribir on public.objetivos_kpi
  for all to authenticated
  using (
    workspace_id = (select my_workspace_id())
    and exists (select 1 from public.usuarios u
                 where u.id = (select auth.uid()) and u.rol in ('owner', 'admin'))
    and public.fn_effective_plan(workspace_id) = 'enterprise'
  )
  with check (
    workspace_id = (select my_workspace_id())
    and exists (select 1 from public.usuarios u
                 where u.id = (select auth.uid()) and u.rol in ('owner', 'admin'))
    and public.fn_effective_plan(workspace_id) = 'enterprise'
  );

revoke all on public.objetivos_kpi from anon;
