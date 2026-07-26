alter policy "solicitudes_update" on public.solicitudes
  with check (
    (workspace_id in (
      select usuarios.workspace_id from usuarios
      where usuarios.id = (select auth.uid())
    ))
    and (
      (
        (creado_por = (select auth.uid()))
        and (estado in ('pendiente', 'cancelada'))
      )
      or (
        (select usuarios.rol from usuarios where usuarios.id = (select auth.uid()))
        in ('owner', 'admin')
      )
    )
  );;
