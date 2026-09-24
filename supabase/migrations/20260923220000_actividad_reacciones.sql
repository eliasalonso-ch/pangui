-- Emoji reactions on OT comments (iMessage-style tapbacks).
--
-- One reaction per person per comment: the primary key is (actividad_id,
-- usuario_id), so picking a different emoji replaces yours (upsert) and
-- picking the same one again removes it (delete). The emoji set is fixed to
-- the six tapbacks the mobile long-press menu offers.
--
-- Access mirrors actividad_ot: anyone who can see the comment (same
-- workspace) can see its reactions; you can only add/change/remove your own.
-- The EXISTS subqueries hit actividad_ot by primary key, and actividad_ot's own
-- SELECT policy applies inside them, so this can't reach another workspace.

create table public.actividad_reacciones (
  actividad_id uuid not null references public.actividad_ot(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references public.usuarios(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '👍', '👎', '😂', '‼️', '❓')),
  created_at timestamptz not null default now(),
  primary key (actividad_id, usuario_id)
);

alter table public.actividad_reacciones enable row level security;

create policy reacciones_select on public.actividad_reacciones
for select to authenticated
using (
  exists (
    select 1 from public.actividad_ot a
    where a.id = actividad_id
      and a.workspace_id = (select public.my_workspace_id())
  )
);

create policy reacciones_insert_own on public.actividad_reacciones
for insert to authenticated
with check (
  usuario_id = (select auth.uid())
  and exists (
    select 1 from public.actividad_ot a
    where a.id = actividad_id
      and a.tipo = 'comentario'
      and a.workspace_id = (select public.my_workspace_id())
  )
);

create policy reacciones_update_own on public.actividad_reacciones
for update to authenticated
using (usuario_id = (select auth.uid()))
with check (
  usuario_id = (select auth.uid())
  and exists (
    select 1 from public.actividad_ot a
    where a.id = actividad_id
      and a.tipo = 'comentario'
      and a.workspace_id = (select public.my_workspace_id())
  )
);

create policy reacciones_delete_own on public.actividad_reacciones
for delete to authenticated
using (usuario_id = (select auth.uid()));

grant select, insert, update, delete on public.actividad_reacciones to authenticated;
