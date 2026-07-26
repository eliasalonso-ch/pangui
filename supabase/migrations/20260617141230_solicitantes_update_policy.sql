-- solicitantes had SELECT/INSERT/DELETE policies but no UPDATE policy, so
-- updating an existing solicitante's contact info (upsertSolicitante's update
-- path on web + mobile) was silently denied by RLS and returned 406 on the
-- .select().single() that followed. Mirror ubicaciones_update: workspace-scoped.
create policy solicitantes_update
  on public.solicitantes
  for update
  using (workspace_id = my_workspace_id())
  with check (workspace_id = my_workspace_id());;
