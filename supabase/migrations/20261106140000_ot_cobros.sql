-- Cobro de cada OT (Electrilam): si ya salió en un Excel de cobros y si ya se cobró.
--
-- exportada_at: la primera vez que la OT salió en un Excel ("Descargar" o
--   "Actualizar mi Excel"). Un Excel nuevo la marca "ya salió en otro Excel"
--   para que Claudio no la cobre dos veces.
-- cobrada_at: botón de la card. Las cobradas no salen en un Excel nuevo y, al
--   actualizar, el bloque que ya estaba queda marcado "COBRADA".
--
-- Tabla aparte y no columnas en ordenes_trabajo: marcar no debe mover
-- updated_at, que es el token de concurrencia de los comandos v1.

create table public.ot_cobros (
  orden_id     uuid primary key references public.ordenes_trabajo(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  exportada_at timestamptz,
  cobrada_at   timestamptz,
  cobrada_por  uuid references public.usuarios(id) on delete set null
);
create index ot_cobros_workspace_idx on public.ot_cobros (workspace_id);

alter table public.ot_cobros enable row level security;

-- Solo dueño/admin: los mismos que ven el botón Cobros. Sin policies de
-- escritura: se escribe por las dos funciones de abajo.
create policy ot_cobros_select on public.ot_cobros
for select to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.fn_mi_rol()) in ('owner', 'admin')
);

-- Marca o desmarca la OT como cobrada. Solo se marca una completada;
-- desmarcar se puede siempre. Devuelve false si no se pudo.
create or replace function public.marcar_ot_cobrada(p_orden_id uuid, p_cobrada boolean)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marcada as (
    insert into public.ot_cobros (orden_id, workspace_id, cobrada_at, cobrada_por)
    select o.id, o.workspace_id,
           case when p_cobrada then now() end,
           case when p_cobrada then (select auth.uid()) end
      from public.ordenes_trabajo o
     where o.id = p_orden_id
       and o.workspace_id = (select public.my_workspace_id())
       and (select public.fn_mi_rol()) in ('owner', 'admin')
       and (not p_cobrada or (o.estado = 'completado' and o.deleted_at is null))
    on conflict (orden_id) do update
      set cobrada_at = excluded.cobrada_at, cobrada_por = excluded.cobrada_por
    returning 1
  )
  select exists (select 1 from marcada);
$$;
revoke all on function public.marcar_ot_cobrada(uuid, boolean) from public, anon;
grant execute on function public.marcar_ot_cobrada(uuid, boolean) to authenticated;

-- Las OTs que salieron en un Excel. La primera vez manda: es el Excel que
-- tiene el trabajo de Claudio.
create or replace function public.registrar_ots_exportadas(p_orden_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ot_cobros as c (orden_id, workspace_id, exportada_at)
  select o.id, o.workspace_id, now()
    from public.ordenes_trabajo o
   where o.id = any(p_orden_ids)
     and o.workspace_id = (select public.my_workspace_id())
     and (select public.fn_mi_rol()) in ('owner', 'admin')
  on conflict (orden_id) do update
    set exportada_at = coalesce(c.exportada_at, excluded.exportada_at);
$$;
revoke all on function public.registrar_ots_exportadas(uuid[]) from public, anon;
grant execute on function public.registrar_ots_exportadas(uuid[]) to authenticated;
