-- Hotfix: OT creation was failing with a foreign-key violation when activo_id
-- held a phantom UUID (a deleted/stale activo the client still sent). OTs don't
-- require an activo, so instead of rejecting the insert we coerce an invalid
-- activo_id to NULL — keeping referential integrity (no orphan ids) without
-- blocking work-order creation.
create or replace function sanitize_orden_activo_id() returns trigger as $$
begin
  if new.activo_id is not null
     and not exists (select 1 from activos a where a.id = new.activo_id) then
    new.activo_id := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sanitize_orden_activo_id on ordenes_trabajo;
create trigger trg_sanitize_orden_activo_id
  before insert or update on ordenes_trabajo
  for each row execute function sanitize_orden_activo_id();;
