-- Ocultar categorías por defecto por espacio de trabajo.
--
-- Las 16 categorías por defecto viven con `workspace_id = NULL` y las comparten
-- todos los espacios. Marcarlas `archivada` las escondería para todos, así que
-- no se puede usar esa bandera para que un cliente saque una del selector.
--
-- Esta tabla guarda "este workspace no quiere ver esta categoría". Las propias
-- se siguen archivando con `categorias_ot.archivada`; esto es solo para las
-- compartidas.
--
-- Aditiva e idempotente: tabla nueva, sin tocar nada existente.

create table if not exists public.categorias_ocultas (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  categoria_id  uuid not null references public.categorias_ot(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, categoria_id)
);

comment on table public.categorias_ocultas is
  'Categorías por defecto (workspace_id NULL) que un espacio de trabajo decidió no mostrar. Las OTs que ya las usan las conservan.';

alter table public.categorias_ocultas enable row level security;

-- Cada espacio ve y administra solo sus propias ocultas.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categorias_ocultas'
      and policyname = 'categorias_ocultas_por_workspace'
  ) then
    create policy categorias_ocultas_por_workspace
      on public.categorias_ocultas
      for all
      using (
        workspace_id in (select workspace_id from public.usuarios where id = auth.uid())
      )
      with check (
        workspace_id in (select workspace_id from public.usuarios where id = auth.uid())
      );
  end if;
end $$;
