-- Stale/cross-table catalog ids reaching ordenes_trabajo cost the user the whole
-- OT: the insert dies on ordenes_trabajo_lugar_id_fkey and the form is lost.
-- sanitize_orden_activo_id already does this for activo_id; lugar_id and
-- ubicacion_id had no equivalent guard.
create or replace function public.sanitize_orden_catalogo_ids()
returns trigger
language plpgsql
as $function$
begin
  if new.activo_id is not null
     and not exists (select 1 from activos a where a.id = new.activo_id) then
    new.activo_id := null;
  end if;

  if new.lugar_id is not null
     and not exists (select 1 from lugares l where l.id = new.lugar_id) then
    new.lugar_id := null;
  end if;

  if new.ubicacion_id is not null
     and not exists (select 1 from ubicaciones u where u.id = new.ubicacion_id) then
    new.ubicacion_id := null;
  end if;

  return new;
end;
$function$;

-- Supersedes the activo-only trigger.
drop trigger if exists trg_sanitize_orden_activo_id on public.ordenes_trabajo;
drop trigger if exists trg_sanitize_orden_catalogo_ids on public.ordenes_trabajo;
create trigger trg_sanitize_orden_catalogo_ids
  before insert or update on public.ordenes_trabajo
  for each row execute function public.sanitize_orden_catalogo_ids();

drop function if exists public.sanitize_orden_activo_id();

-- lugar_id was the only catalog FK without ON DELETE SET NULL, so deleting a
-- referenced lugar would fail outright. Match its siblings.
alter table public.ordenes_trabajo
  drop constraint ordenes_trabajo_lugar_id_fkey;
alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_lugar_id_fkey
  foreign key (lugar_id) references public.lugares(id) on delete set null;
