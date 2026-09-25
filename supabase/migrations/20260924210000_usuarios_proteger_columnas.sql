-- Cierra la autoescalada de privilegios en `usuarios`.
--
-- `usuarios_update` deja a cada uno editar SU fila (id = auth.uid()) y el rol
-- `authenticated` tiene UPDATE sobre todas las columnas, así que cualquier
-- técnico podía hacer desde la API:
--   update usuarios set rol = 'owner', plan = 'pro' where id = <yo>
-- La UI no lo ofrece, pero la UI no es la barrera.
--
-- Este trigger solo mira escrituras directas por PostgREST (current_user =
-- 'authenticated'). No toca:
--   - service_role: webhooks de Flow, registro, onboarding, /api/usuarios/[id].
--   - RPC SECURITY DEFINER (corren como su dueño): transferir_propiedad,
--     abandonar_organizacion, dar_de_baja_usuario, deactivate_usuario,
--     set_solo_asignadas, eliminar_workspace.
--
-- Reglas para la escritura directa:
--   1. Facturación, workspace y baja: nunca desde el cliente.
--   2. rol / activo / solo_asignadas: solo owner/admin, nunca sobre sí mismo,
--      y nunca sobre el owner ni hacia 'owner' (eso es transferir_propiedad).
-- Lo demás (nombre, cargo, oficio, teléfono, foto, push token, guías...) sigue
-- editable por el propio usuario y por los admins como hasta ahora.

create or replace function public.fn_usuarios_proteger_columnas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.plan is distinct from old.plan
     or new.plan_status is distinct from old.plan_status
     or new.trial_end is distinct from old.trial_end
     or new.excluir_de_facturacion is distinct from old.excluir_de_facturacion
     or new.deleted_at is distinct from old.deleted_at
     or new.deleted_by is distinct from old.deleted_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Este campo no se puede modificar desde la app.'
      using errcode = '42501';
  end if;

  if new.rol is distinct from old.rol
     or new.activo is distinct from old.activo
     or new.solo_asignadas is distinct from old.solo_asignadas then
    if coalesce(fn_mi_rol(), '') not in ('owner', 'admin') then
      raise exception 'Solo un administrador puede cambiar el rol o el acceso de un usuario.'
        using errcode = '42501';
    end if;
    if old.id = (select auth.uid()) then
      raise exception 'No puedes cambiar tu propio rol o acceso.'
        using errcode = '42501';
    end if;
    if old.rol = 'owner' or new.rol = 'owner' then
      raise exception 'La propiedad solo se transfiere desde Espacio de trabajo.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_usuarios_proteger_columnas on public.usuarios;
create trigger trg_usuarios_proteger_columnas
  before update on public.usuarios
  for each row execute function public.fn_usuarios_proteger_columnas();
