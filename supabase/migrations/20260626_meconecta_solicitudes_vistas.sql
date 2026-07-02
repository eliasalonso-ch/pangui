-- Tracks meconecta (UdeC) maintenance requests already seen by the scraper cron,
-- so we only notify on genuinely new ones. Exclusive to the Electrilam workspace.
create table if not exists public.uni_solicitudes_vistas (
  id_externo   integer primary key,          -- decoded base64 ids= from the meconecta table (e.g. 27986)
  workspace_id uuid not null,                 -- always Electrilam; kept for scoping/clarity
  folio        text,                          -- e.g. SF920260627986
  fecha        timestamptz,                   -- order date/time from column 1
  estado       text,                          -- e.g. EN PROCESO RESOLUTOR
  first_seen_at timestamptz not null default now()
);

create index if not exists uni_solicitudes_vistas_ws_idx
  on public.uni_solicitudes_vistas (workspace_id);

-- Only the service role (the cron edge function) touches this table.
alter table public.uni_solicitudes_vistas enable row level security;
-- No policies => no anon/auth access; service role bypasses RLS.
