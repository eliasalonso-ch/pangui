
create table if not exists public.uni_solicitudes_vistas (
  id_externo   integer primary key,
  workspace_id uuid not null,
  folio        text,
  fecha        timestamptz,
  estado       text,
  first_seen_at timestamptz not null default now()
);
create index if not exists uni_solicitudes_vistas_ws_idx
  on public.uni_solicitudes_vistas (workspace_id);
alter table public.uni_solicitudes_vistas enable row level security;
;
