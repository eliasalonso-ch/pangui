drop policy if exists "foto_grupo_items_select" on public.foto_grupo_items;

create policy "foto_grupo_items_select" on public.foto_grupo_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.foto_grupos g
      join public.usuarios u on u.workspace_id = g.workspace_id
      where g.id = foto_grupo_items.grupo_id
        and u.id = auth.uid()
        and u.activo = true
    )
  );

drop policy if exists "foto_grupo_items_delete" on public.foto_grupo_items;

create policy "foto_grupo_items_delete" on public.foto_grupo_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.foto_grupos g
      join public.usuarios u on u.workspace_id = g.workspace_id
      where g.id = foto_grupo_items.grupo_id
        and u.id = auth.uid()
        and u.activo = true
        and (
          g.locked = false
          or u.rol in ('owner', 'admin')
        )
    )
  );
