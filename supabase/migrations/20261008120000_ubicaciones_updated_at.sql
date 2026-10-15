-- "Última actualización" for an ubicación (mobile: ubicacion/detalles, the
-- "Más información" screen). ubicaciones only had created_at.
-- Existing rows have no change history, so they start at their creation time;
-- from now on the shared trigger function (same as ordenes_trabajo) stamps
-- every UPDATE. The backfill runs before the trigger exists, so it doesn't
-- stamp everything with now().

alter table public.ubicaciones add column if not exists updated_at timestamptz;

update public.ubicaciones set updated_at = created_at where updated_at is null;

alter table public.ubicaciones alter column updated_at set default now();

drop trigger if exists trg_ubicaciones_updated_at on public.ubicaciones;
create trigger trg_ubicaciones_updated_at
  before update on public.ubicaciones
  for each row execute function public.fn_set_updated_at();
