-- Google Calendar: regla de aviso por workspace.
--
-- Sigue a 20261124000000_calendario_google.sql (aplicada). Por defecto cada
-- evento usaba el aviso predeterminado del calendario (30 min). Ahora el
-- owner/admin elige: aviso_minutos
--   null = el predeterminado del calendario (como antes)
--   -1   = sin aviso
--   0..40320 = minutos antes (el máximo de Google: 4 semanas)
--
-- OJO: la Calendar API fija los avisos solo para la cuenta conectada. El resto
-- del equipo recibe los suyos según su configuración de ese calendario.

alter table public.calendario_google
  add column aviso_minutos integer
  check (aviso_minutos is null or aviso_minutos = -1 or aviso_minutos between 0 and 40320);

-- Owner/admin. Re-encola los pendientes abiertos con evento para que el sync
-- les actualice el aviso.
create or replace function public.gcal_cambiar_aviso(p_minutos integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := public.my_workspace_id();
begin
  if coalesce(public.my_rol(), '') not in ('owner', 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.calendario_google set aviso_minutos = p_minutos, updated_at = now() where workspace_id = v_ws;
  if not found then
    raise exception 'Primero conecta Google Calendar' using errcode = '22023';
  end if;
  update public.ot_pendientes
     set gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where workspace_id = v_ws and gcal_event_id is not null and estado in ('por_hacer', 'en_curso');
end $$;

revoke all on function public.gcal_cambiar_aviso(integer) from public, anon;
grant execute on function public.gcal_cambiar_aviso(integer) to authenticated;
