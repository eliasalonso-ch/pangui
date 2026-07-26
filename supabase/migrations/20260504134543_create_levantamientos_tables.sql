
-- ── levantamientos ────────────────────────────────────────────────────────────
create table public.levantamientos (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  numero           serial,
  titulo           text not null,
  descripcion      text,
  estado           text not null default 'creado'
                     check (estado in ('creado','en_terreno','en_revision','aprobado','no_viable','requiere_info')),
  sociedad_id      uuid references public.sociedades(id) on delete set null,
  ubicacion_id     uuid references public.ubicaciones(id) on delete set null,
  lugar            text,
  creado_por       uuid references public.usuarios(id) on delete set null,
  asignado_a       uuid references public.usuarios(id) on delete set null,
  resultado_notas  text,
  orden_id         uuid references public.ordenes_trabajo(id) on delete set null,
  enviado_revision_at timestamptz,
  revisado_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);

-- ── levantamiento_secciones ───────────────────────────────────────────────────
create table public.levantamiento_secciones (
  id                 uuid primary key default gen_random_uuid(),
  levantamiento_id   uuid not null references public.levantamientos(id) on delete cascade,
  titulo             text not null,
  orden_display      int not null default 0,
  created_at         timestamptz not null default now()
);

-- ── levantamiento_items ───────────────────────────────────────────────────────
create table public.levantamiento_items (
  id             uuid primary key default gen_random_uuid(),
  seccion_id     uuid not null references public.levantamiento_secciones(id) on delete cascade,
  campo          text not null,
  tipo           text not null default 'texto'
                   check (tipo in ('texto','numero','si_no','opcion','medicion')),
  valor_texto    text,
  valor_numero   numeric,
  valor_bool     boolean,
  unidad         text,
  orden_display  int not null default 0,
  created_at     timestamptz not null default now()
);

-- ── levantamiento_foto_grupos ─────────────────────────────────────────────────
create table public.levantamiento_foto_grupos (
  id               uuid primary key default gen_random_uuid(),
  levantamiento_id uuid not null references public.levantamientos(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  titulo           text not null,
  descripcion      text not null default '',
  orden_display    int not null default 0,
  created_by       uuid references public.usuarios(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ── levantamiento_foto_items ──────────────────────────────────────────────────
create table public.levantamiento_foto_items (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.levantamiento_foto_grupos(id) on delete cascade,
  url           text not null,
  orden_display int not null default 0,
  created_at    timestamptz not null default now()
);

-- ── levantamiento_actividad ───────────────────────────────────────────────────
create table public.levantamiento_actividad (
  id               uuid primary key default gen_random_uuid(),
  levantamiento_id uuid not null references public.levantamientos(id) on delete cascade,
  tipo             text not null
                     check (tipo in ('creado','asignado','estado_cambiado','enviado_revision',
                                     'aprobado','no_viable','requiere_info','ot_creada','comentario')),
  comentario       text,
  usuario_id       uuid references public.usuarios(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ── levantamiento_materiales ──────────────────────────────────────────────────
create table public.levantamiento_materiales (
  id               uuid primary key default gen_random_uuid(),
  levantamiento_id uuid not null references public.levantamientos(id) on delete cascade,
  parte_id         uuid not null references public.partes(id) on delete cascade,
  cantidad         numeric not null default 1,
  notas            text,
  created_at       timestamptz not null default now(),
  unique (levantamiento_id, parte_id)
);

-- ── indexes ───────────────────────────────────────────────────────────────────
create index on public.levantamientos (workspace_id, created_at desc);
create index on public.levantamientos (estado);
create index on public.levantamiento_secciones (levantamiento_id);
create index on public.levantamiento_items (seccion_id);
create index on public.levantamiento_foto_grupos (levantamiento_id);
create index on public.levantamiento_foto_items (grupo_id);
create index on public.levantamiento_actividad (levantamiento_id, created_at desc);
create index on public.levantamiento_materiales (levantamiento_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger levantamientos_updated_at
  before update on public.levantamientos
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.levantamientos           enable row level security;
alter table public.levantamiento_secciones  enable row level security;
alter table public.levantamiento_items      enable row level security;
alter table public.levantamiento_foto_grupos enable row level security;
alter table public.levantamiento_foto_items  enable row level security;
alter table public.levantamiento_actividad  enable row level security;
alter table public.levantamiento_materiales enable row level security;

-- workspace-scoped policies via usuarios join
create policy "workspace members can read levantamientos"
  on public.levantamientos for select
  using (workspace_id in (
    select workspace_id from public.usuarios where id = auth.uid()
  ));

create policy "workspace members can insert levantamientos"
  on public.levantamientos for insert
  with check (workspace_id in (
    select workspace_id from public.usuarios where id = auth.uid()
  ));

create policy "workspace members can update levantamientos"
  on public.levantamientos for update
  using (workspace_id in (
    select workspace_id from public.usuarios where id = auth.uid()
  ));

-- child tables inherit access via levantamiento_id → levantamientos

create policy "workspace members can read secciones"
  on public.levantamiento_secciones for all
  using (levantamiento_id in (
    select l.id from public.levantamientos l
    join public.usuarios u on u.workspace_id = l.workspace_id
    where u.id = auth.uid()
  ));

create policy "workspace members can read items"
  on public.levantamiento_items for all
  using (seccion_id in (
    select s.id from public.levantamiento_secciones s
    join public.levantamientos l on l.id = s.levantamiento_id
    join public.usuarios u on u.workspace_id = l.workspace_id
    where u.id = auth.uid()
  ));

create policy "workspace members can access foto_grupos"
  on public.levantamiento_foto_grupos for all
  using (workspace_id in (
    select workspace_id from public.usuarios where id = auth.uid()
  ));

create policy "workspace members can access foto_items"
  on public.levantamiento_foto_items for all
  using (grupo_id in (
    select g.id from public.levantamiento_foto_grupos g
    join public.usuarios u on u.workspace_id = g.workspace_id
    where u.id = auth.uid()
  ));

create policy "workspace members can access actividad"
  on public.levantamiento_actividad for all
  using (levantamiento_id in (
    select l.id from public.levantamientos l
    join public.usuarios u on u.workspace_id = l.workspace_id
    where u.id = auth.uid()
  ));

create policy "workspace members can access materiales"
  on public.levantamiento_materiales for all
  using (levantamiento_id in (
    select l.id from public.levantamientos l
    join public.usuarios u on u.workspace_id = l.workspace_id
    where u.id = auth.uid()
  ));
;
