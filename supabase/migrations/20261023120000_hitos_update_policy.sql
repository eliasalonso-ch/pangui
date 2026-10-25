-- ITOs: faltaba la policy de UPDATE.
--
-- 20260815120000_catalogos_archivada.sql pasó el "eliminar" de la web a un
-- `update({ archivada: true })`, pero `hitos` solo tenía policies de SELECT,
-- INSERT y DELETE. Sin policy de UPDATE, RLS filtra todas las filas: PostgREST
-- responde 204 y no cambia nada, así que el ITO nunca se archivaba.
--
-- Mismo predicado que las demás policies de `hitos`; el WITH CHECK impide
-- mover un ITO a otro workspace.

drop policy if exists "workspace members update hitos" on public.hitos;

create policy "workspace members update hitos" on public.hitos
  for update
  using (workspace_id in (select usuarios.workspace_id from usuarios where usuarios.id = (select auth.uid())))
  with check (workspace_id in (select usuarios.workspace_id from usuarios where usuarios.id = (select auth.uid())));
