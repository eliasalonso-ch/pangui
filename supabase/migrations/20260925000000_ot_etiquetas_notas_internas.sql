-- Etiquetas de color y nota interna en las OTs, solo para dueño/admin.
--
-- Pedido: poder marcar OTs ("Incompleta: materiales", "Esperando cliente"...) y
-- dejar una nota que los técnicos no ven. La lista de etiquetas la arma cada
-- workspace (nombre + color) y se reutiliza en cualquier OT.
--
-- Privacidad: el filtro está en RLS, no solo en la UI. Un member/requester no
-- puede leer ni escribir nada de esto aunque llame a la API directo.
-- (select ...) envuelve las funciones para que se evalúen una vez por consulta
-- y no por fila.

create table public.ot_etiquetas (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 40),
  color        text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by   uuid default auth.uid() references public.usuarios(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, nombre)
);

create table public.ot_etiquetas_asignadas (
  orden_id     uuid not null references public.ordenes_trabajo(id) on delete cascade,
  etiqueta_id  uuid not null references public.ot_etiquetas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid default auth.uid() references public.usuarios(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (orden_id, etiqueta_id)
);
create index ot_etiquetas_asignadas_workspace_idx on public.ot_etiquetas_asignadas (workspace_id);
create index ot_etiquetas_asignadas_etiqueta_idx on public.ot_etiquetas_asignadas (etiqueta_id);

create table public.ot_notas_internas (
  orden_id     uuid primary key references public.ordenes_trabajo(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  nota         text not null check (char_length(nota) <= 2000),
  updated_by   uuid default auth.uid() references public.usuarios(id) on delete set null,
  updated_at   timestamptz not null default now()
);
create index ot_notas_internas_workspace_idx on public.ot_notas_internas (workspace_id);

alter table public.ot_etiquetas enable row level security;
alter table public.ot_etiquetas_asignadas enable row level security;
alter table public.ot_notas_internas enable row level security;

-- Catálogo de etiquetas del workspace.
create policy ot_etiquetas_admin on public.ot_etiquetas
for all to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
)
with check (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
);

-- Etiqueta puesta en una OT: la OT y la etiqueta tienen que ser del mismo
-- workspace del usuario (no se puede colgar una etiqueta en una OT ajena).
create policy ot_etiquetas_asignadas_admin on public.ot_etiquetas_asignadas
for all to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
)
with check (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
  and exists (select 1 from public.ordenes_trabajo o where o.id = orden_id and o.workspace_id = ot_etiquetas_asignadas.workspace_id)
  and exists (select 1 from public.ot_etiquetas e where e.id = etiqueta_id and e.workspace_id = ot_etiquetas_asignadas.workspace_id)
);

-- Nota interna, una por OT.
create policy ot_notas_internas_admin on public.ot_notas_internas
for all to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
)
with check (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
  and exists (select 1 from public.ordenes_trabajo o where o.id = orden_id and o.workspace_id = ot_notas_internas.workspace_id)
);
