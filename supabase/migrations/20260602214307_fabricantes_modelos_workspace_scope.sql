-- Make the global catalog tables support private per-workspace entries.
-- workspace_id IS NULL  => global seed, visible to everyone.
-- workspace_id = X      => private to workspace X (only they see it).

alter table public.fabricantes add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.fabricantes add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.modelos add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.modelos add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Prevent duplicate names within the same scope (case-insensitive).
-- Two partial indexes: one for globals (workspace_id null), one per-workspace.
create unique index if not exists fabricantes_global_nombre_uniq
  on public.fabricantes (lower(nombre)) where workspace_id is null;
create unique index if not exists fabricantes_ws_nombre_uniq
  on public.fabricantes (workspace_id, lower(nombre)) where workspace_id is not null;

create unique index if not exists modelos_global_nombre_uniq
  on public.modelos (fabricante_id, lower(nombre)) where workspace_id is null;
create unique index if not exists modelos_ws_nombre_uniq
  on public.modelos (workspace_id, fabricante_id, lower(nombre)) where workspace_id is not null;

-- ── RLS: see globals + your own; create only rows owned by your workspace ──────
drop policy if exists fabricantes_select on public.fabricantes;
drop policy if exists fabricantes_insert on public.fabricantes;

create policy fabricantes_select on public.fabricantes
  for select to public
  using (workspace_id is null or workspace_id = public.my_workspace_id());

create policy fabricantes_insert on public.fabricantes
  for insert to public
  with check (workspace_id = public.my_workspace_id());

drop policy if exists modelos_select on public.modelos;
drop policy if exists modelos_insert on public.modelos;

create policy modelos_select on public.modelos
  for select to public
  using (workspace_id is null or workspace_id = public.my_workspace_id());

create policy modelos_insert on public.modelos
  for insert to public
  with check (workspace_id = public.my_workspace_id());;
