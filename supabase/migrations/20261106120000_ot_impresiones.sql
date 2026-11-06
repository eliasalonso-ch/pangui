-- PDF de la solicitud MeConecta por OT y si ya se imprimió.
--
-- Las filas las crea meconecta-scrape-cron (service_role) junto con la OT, así
-- que el botón de imprimir de la bandeja aparece solo en las OTs que crea la
-- integración, de ahora en adelante, y no en las antiguas.
--
-- Tabla aparte y no columnas en ordenes_trabajo: marcar "impresa" no debe mover
-- updated_at, que es el token de concurrencia de los comandos v1.

create table public.ot_impresiones (
  orden_id     uuid primary key references public.ordenes_trabajo(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pdf_url      text not null,
  impresa_at   timestamptz,
  impresa_por  uuid references public.usuarios(id) on delete set null
);
create index ot_impresiones_workspace_idx on public.ot_impresiones (workspace_id);

alter table public.ot_impresiones enable row level security;

-- Lectura: el propio workspace, sin solicitantes (no usan la bandeja). Sin
-- policies de escritura: authenticated solo marca vía marcar_ot_impresa().
create policy ot_impresiones_select on public.ot_impresiones
for select to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin', 'member')
);

-- Marca la OT como impresa. La primera impresión manda: reimprimir no cambia
-- quién ni cuándo. Devuelve false si la OT no es del workspace o no hay PDF.
create or replace function public.marcar_ot_impresa(p_orden_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marcada as (
    update public.ot_impresiones
       set impresa_at  = coalesce(impresa_at, now()),
           impresa_por = coalesce(impresa_por, (select auth.uid()))
     where orden_id = p_orden_id
       and workspace_id = (select public.my_workspace_id())
       and (select public.fn_mi_rol()) in ('owner', 'admin', 'member')
    returning 1
  )
  select exists (select 1 from marcada);
$$;
revoke all on function public.marcar_ot_impresa(uuid) from public, anon;
grant execute on function public.marcar_ot_impresa(uuid) to authenticated;

-- OTs que la integración ya creó (#1382 y #1383, prueba del 2026-11-06).
insert into public.ot_impresiones (orden_id, workspace_id, pdf_url)
select o.id, o.workspace_id, l->>'url'
from public.ordenes_trabajo o
cross join lateral jsonb_array_elements(o.links) l
where o.origen = 'meconecta'
  and l->>'nombre' like 'Solicitud\_%.pdf'
on conflict (orden_id) do nothing;
