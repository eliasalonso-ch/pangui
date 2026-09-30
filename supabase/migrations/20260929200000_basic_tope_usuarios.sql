-- Tope de 3 usuarios en el plan Basic (gratis).
--
-- Hasta acá el límite solo aparecía en /precios: nada impedía que un workspace
-- en Basic sumara a toda la cuadrilla gratis. La edge function invite-user
-- revisa antes de mandar el correo (mensaje claro); este trigger es el
-- respaldo para todo otro camino, como reactivar un usuario desde la lista.
--
-- Cuenta igual que usuariosCobrables (lib/flow-sync.ts): activos, sin staff
-- excluido, sin dados de baja y sin solicitantes.
--
-- Solo mira las altas: no desactiva a nadie de un workspace que ya excede el
-- tope (p.ej. uno que venía de la prueba con más usuarios).
-- ponytail: dos altas simultáneas pueden pasar el tope por uno; si importa,
-- serializar con pg_advisory_xact_lock(hashtext(workspace_id::text)).

create or replace function public.enforce_basic_tope_usuarios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta_nuevo boolean;
  v_cuenta_viejo boolean;
  v_con_plan     boolean;
  v_usuarios     integer;
begin
  v_cuenta_nuevo := coalesce(new.activo, false)
    and not coalesce(new.excluir_de_facturacion, false)
    and new.deleted_at is null
    and coalesce(new.rol, '') <> 'requester';

  if not v_cuenta_nuevo or new.workspace_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_cuenta_viejo := coalesce(old.activo, false)
      and not coalesce(old.excluir_de_facturacion, false)
      and old.deleted_at is null
      and coalesce(old.rol, '') <> 'requester';
    if v_cuenta_viejo and old.workspace_id is not distinct from new.workspace_id then
      return new;  -- ya contaba en este workspace: no es un alta
    end if;
  end if;

  -- En prueba, en un plan pagado o en Empresa no hay tope de usuarios.
  select exists (
    select 1 from public.subscriptions s
    where s.workspace_id = new.workspace_id
      and s.status in ('trialing', 'active', 'past_due')
      and s.plan_key <> 'basic'
  ) into v_con_plan;

  if v_con_plan then
    return new;
  end if;

  select count(*) into v_usuarios
  from public.usuarios u
  where u.workspace_id = new.workspace_id
    and u.id <> new.id
    and u.activo
    and not u.excluir_de_facturacion
    and u.deleted_at is null
    and u.rol <> 'requester';

  if v_usuarios >= 3 then
    raise exception 'El plan Basic permite hasta 3 usuarios. Elige un plan en Suscripción para sumar a más personas.'
      using errcode = 'P0001', hint = 'basic_tope_usuarios';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_basic_tope_usuarios() from public, anon, authenticated;

drop trigger if exists trg_basic_tope_usuarios on public.usuarios;
create trigger trg_basic_tope_usuarios
  before insert or update of activo, rol, deleted_at, excluir_de_facturacion, workspace_id
  on public.usuarios
  for each row
  execute function public.enforce_basic_tope_usuarios();
