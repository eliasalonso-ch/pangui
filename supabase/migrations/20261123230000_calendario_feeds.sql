-- Calendario del equipo: un link secreto por workspace con un feed iCalendar
-- (.ics) de los pendientes abiertos de TODO el workspace. Se agrega en Google
-- Calendar ("Desde URL"), Apple o Outlook; quien tenga el link ve los eventos.
--
-- Solo owner/admin pueden ver, crear o regenerar el link (regenerar = borrar y
-- crear: el link anterior deja de funcionar). El feed lo sirve la edge function
-- pendientes-ics con service role, buscando por token.
--
-- Etapa 1 de la integración con calendarios. La etapa 2 (Google OAuth, escribir
-- en el calendario al instante) está en docs/superpowers/plans/2026-11-23-google-calendar-oauth.md.

create table public.calendario_feeds (
  workspace_id uuid primary key default public.my_workspace_id()
               references public.workspaces(id) on delete cascade,
  -- 64 hex = 244 bits al azar: no se adivina.
  token        text not null unique
               default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  creado_por   uuid default auth.uid() references public.usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index calendario_feeds_creado_por_idx on public.calendario_feeds (creado_por);

alter table public.calendario_feeds enable row level security;

create policy calendario_feeds_admin on public.calendario_feeds
for all to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.my_rol()) in ('owner', 'admin')
)
with check (
  workspace_id = (select public.my_workspace_id())
  and (select public.my_rol()) in ('owner', 'admin')
);

grant select, insert, delete on public.calendario_feeds to authenticated;
