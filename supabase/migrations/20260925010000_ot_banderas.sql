-- Bandera por OT (color + nota), solo dueño/admin. Reemplaza el diseño de
-- 20260925000000 (catálogo de etiquetas + asignaciones + nota): se pidió algo
-- más simple, una bandera de color con nota en cada tarjeta. Esas tablas se
-- crearon el mismo día y estaban vacías al borrarlas.

drop table if exists public.ot_etiquetas_asignadas;
drop table if exists public.ot_etiquetas;
drop table if exists public.ot_notas_internas;

create table public.ot_banderas (
  orden_id     uuid primary key references public.ordenes_trabajo(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  color        text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  nota         text check (nota is null or char_length(nota) <= 2000),
  updated_by   uuid default auth.uid() references public.usuarios(id) on delete set null,
  updated_at   timestamptz not null default now()
);
create index ot_banderas_workspace_idx on public.ot_banderas (workspace_id);

alter table public.ot_banderas enable row level security;

-- Privado para dueño/admin del propio workspace: un member/requester no la ve
-- ni la escribe aunque llame a la API directo. La OT tiene que ser del mismo
-- workspace. (select ...) para evaluar las funciones una vez por consulta.
create policy ot_banderas_admin on public.ot_banderas
for all to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
)
with check (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
  and exists (select 1 from public.ordenes_trabajo o where o.id = orden_id and o.workspace_id = ot_banderas.workspace_id)
);
