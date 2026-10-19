-- 1. Los usuarios dados de baja vuelven a ser visibles para su workspace.
--
-- `usuarios_select` exigía `activo = true` (o ser uno mismo), y la baja deja
-- `activo = false`. Resultado: la fila tombstone existía pero nadie más la
-- podía leer, así que el nombre de quien hizo una OT vieja desaparecía de las
-- tarjetas, "Asignado a" no lo ofrecía y el filtro "De usuarios dados de baja"
-- nunca aparecía. Las pantallas ya traen `deleted_at` y lo filtran en los
-- selectores de asignación (OTCrearPanel, OTEditPanel, OTRow); solo faltaba que
-- la RLS dejara pasar la fila.
--
-- Los desactivados (activo = false SIN baja) siguen ocultos como hasta ahora.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using (
    workspace_id = (select my_workspace_id())
    and (activo = true or deleted_at is not null or id = (select auth.uid()))
  );

-- 2. Fotos de perfil: solo owner/admin.
--
-- Antes cada usuario subía su propia foto. Electrilam pidió que las ponga un
-- administrador para evitar fotos inapropiadas en un entorno de trabajo. Rige
-- para todos los workspaces.
--
-- Una sola regla, usada por el trigger de `usuarios` y por storage:
--   - quien cambia es owner o admin del mismo workspace;
--   - un admin cambia la suya y la de miembros/solicitantes, no la de otro
--     admin ni la del owner (igual que puedeGestionarUsuario en lib/usuarios-baja);
--   - el owner cambia cualquiera.
-- Recibe texto porque storage entrega la carpeta (`{user_id}/...`) como texto.
create or replace function public.puede_cambiar_foto(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from usuarios yo
      join usuarios u on u.workspace_id = yo.workspace_id
     where yo.id = (select auth.uid())
       and u.id::text = p_usuario
       and yo.rol in ('owner', 'admin')
       and (yo.rol = 'owner' or u.id = yo.id or u.rol not in ('owner', 'admin'))
  );
$$;

revoke all on function public.puede_cambiar_foto(text) from public, anon;
grant execute on function public.puede_cambiar_foto(text) to authenticated, service_role;

drop policy if exists "avatares_insert_propio" on storage.objects;
drop policy if exists "avatares_select_propio" on storage.objects;
drop policy if exists "avatares_delete_propio" on storage.objects;

create policy "avatares_insert_admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and public.puede_cambiar_foto((storage.foldername(name))[1]));

-- `remove()` de la API de storage necesita SELECT además de DELETE.
create policy "avatares_select_admin" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and public.puede_cambiar_foto((storage.foldername(name))[1]));

create policy "avatares_delete_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and public.puede_cambiar_foto((storage.foldername(name))[1]));

-- Mismo trigger de 20260924210000, más la regla de avatar_url. Sin esto un
-- miembro podría apuntar su avatar_url a cualquier URL pública directo por la API.
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

  if new.avatar_url is distinct from old.avatar_url
     and not puede_cambiar_foto(old.id::text) then
    raise exception 'Solo un administrador puede cambiar la foto de perfil.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
