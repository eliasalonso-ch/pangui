-- Envío de OTs entre workspaces: el dueño de los activos (p. ej. la UdeC) envía
-- una OT a un contratista que tiene su propio workspace (p. ej. Electrilam).
--
-- Modelo: la OT NUNCA se copia. Vive en el workspace dueño y el contratista la
-- ve y la ejecuta a través de ot_envios. Todo lo que el contratista escribe en
-- ella (actividad, procedimientos, fotos, hojas) queda con el workspace_id del
-- dueño, así el dueño lo ve en vivo con sus políticas de siempre.
--
-- Todas las políticas nuevas son PERMISIVAS y aditivas (se suman con OR a las
-- existentes). Para un workspace sin envíos, ots_recibidas() es '{}' y ninguna
-- consulta cambia de resultado.
--
-- Flujo: dueño agrega proveedor → invitar_contratista (email) → el owner/admin
-- del contratista acepta → enviar_ot_contratista → el contratista ejecuta y
-- pasa la OT a en_revision → el dueño la aprueba (completado) o la observa
-- (en_espera con comentario). El contratista no puede cerrar ni cancelar.

-- ── 1. Vínculos dueño ↔ contratista ─────────────────────────────────────────

create table public.vinculos_contratista (
  id uuid primary key default gen_random_uuid(),
  workspace_dueno uuid not null references public.workspaces(id) on delete cascade,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  email_invitado text not null
    check (email_invitado = lower(btrim(email_invitado)) and email_invitado like '%_@_%'),
  workspace_contratista uuid references public.workspaces(id) on delete cascade,
  estado text not null default 'invitado' check (estado in ('invitado', 'activo', 'revocado')),
  invitado_por uuid references auth.users(id) on delete set null,
  aceptado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  aceptado_at timestamptz,
  revocado_at timestamptz,
  check (estado <> 'activo' or workspace_contratista is not null),
  check (workspace_contratista is distinct from workspace_dueno)
);

-- Un proveedor tiene a lo más un vínculo vivo, y un par de workspaces a lo más
-- uno activo.
create unique index vinculos_contratista_proveedor_vivo
  on public.vinculos_contratista (proveedor_id) where estado <> 'revocado';
create unique index vinculos_contratista_par_activo
  on public.vinculos_contratista (workspace_dueno, workspace_contratista) where estado = 'activo';
create index vinculos_contratista_contratista
  on public.vinculos_contratista (workspace_contratista) where estado = 'activo';
create index vinculos_contratista_email
  on public.vinculos_contratista (email_invitado) where estado = 'invitado';

alter table public.vinculos_contratista enable row level security;

-- Solo lectura directa; toda escritura pasa por las RPC de abajo. El invitado
-- ve su invitación con mis_invitaciones_contratista(), no con esta política.
create policy vinculos_select on public.vinculos_contratista
  for select to authenticated
  using (
    workspace_dueno = (select public.my_workspace_id())
    or workspace_contratista = (select public.my_workspace_id())
  );

-- ── 2. Envíos de OT ─────────────────────────────────────────────────────────

create table public.ot_envios (
  orden_id uuid primary key references public.ordenes_trabajo(id) on delete cascade,
  vinculo_id uuid not null references public.vinculos_contratista(id) on delete cascade,
  workspace_origen uuid not null references public.workspaces(id) on delete cascade,
  workspace_destino uuid not null references public.workspaces(id) on delete cascade,
  activo boolean not null default true,
  nota text,
  -- Nombres congelados al enviar: cada lado no puede leer la ficha del otro.
  nombre_origen text not null,
  nombre_destino text not null,
  enviado_por uuid references auth.users(id) on delete set null,
  enviado_at timestamptz not null default now()
);

create index ot_envios_destino on public.ot_envios (workspace_destino) where activo;
create index ot_envios_origen on public.ot_envios (workspace_origen);
create index ot_envios_vinculo on public.ot_envios (vinculo_id);

alter table public.ot_envios enable row level security;

create policy ot_envios_select on public.ot_envios
  for select to authenticated
  using (
    workspace_origen = (select public.my_workspace_id())
    or (activo and workspace_destino = (select public.my_workspace_id()))
  );

-- ── 3. Qué puede ver el contratista ─────────────────────────────────────────
-- Funciones que devuelven arreglos: dentro de una política se usan como
-- `col = any((select f())::uuid[])`, que Postgres evalúa una sola vez por consulta
-- (initplan). El cast es obligatorio: sin él, `any((select ...))` se lee como
-- subconsulta y compara uuid contra uuid[].

create or replace function public.ots_recibidas()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(e.orden_id), '{}'::uuid[])
  from public.ot_envios e
  where e.activo and e.workspace_destino = public.my_workspace_id();
$$;

-- Catálogo del dueño referenciado por las OTs recibidas (solo esas filas).
create or replace function public.catalogo_recibido(p_tipo text)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}'::uuid[])
  from public.ordenes_trabajo o
  cross join lateral unnest(
    case p_tipo
      when 'activo' then array[o.activo_id]
      when 'ubicacion' then array[o.ubicacion_id]
      when 'lugar' then array[o.lugar_id]
      when 'sociedad' then array[o.sociedad_id]
      when 'categoria' then array[o.categoria_id] || coalesce(o.categoria_ids, '{}'::uuid[])
      when 'medidor' then array[o.medidor_id]
      else '{}'::uuid[]
    end
  ) x
  where o.id = any(public.ots_recibidas());
$$;

-- Procedimientos adjuntos a OTs recibidas, más sus subprocedimientos.
create or replace function public.procedimientos_recibidos()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  with recursive procs(id) as (
    select op.procedimiento_id
    from public.ot_procedimientos op
    where op.orden_id = any(public.ots_recibidas())
    union
    select pe.procedimiento_id
    from public.procedimiento_ejecuciones pe
    where pe.orden_id = any(public.ots_recibidas())
    union
    select x
    from procs
    join public.procedimiento_pasos pp on pp.procedimiento_id = procs.id
    left join public.procedimiento_subprocedimientos ps on ps.parent_paso_id = pp.id
    cross join lateral unnest(array[pp.sub_procedimiento_id, ps.child_procedimiento_id]) x
    where x is not null
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from procs where id is not null;
$$;

create or replace function public.medidores_recibidos()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m) filter (where m is not null), '{}'::uuid[])
  from (
    select unnest(public.catalogo_recibido('medidor')) m
    union all
    select pp.medidor_id
    from public.procedimiento_pasos pp
    where pp.procedimiento_id = any(public.procedimientos_recibidos())
  ) s;
$$;

revoke all on function public.ots_recibidas() from public, anon;
revoke all on function public.catalogo_recibido(text) from public, anon;
revoke all on function public.procedimientos_recibidos() from public, anon;
revoke all on function public.medidores_recibidos() from public, anon;
grant execute on function public.ots_recibidas() to authenticated;
grant execute on function public.catalogo_recibido(text) to authenticated;
grant execute on function public.procedimientos_recibidos() to authenticated;
grant execute on function public.medidores_recibidos() to authenticated;

-- ── 4. Políticas aditivas para el contratista ───────────────────────────────

-- La OT: respeta solo_asignadas igual que ordenes_select.
create policy ordenes_select_envio on public.ordenes_trabajo
  for select to authenticated
  using (
    id = any((select public.ots_recibidas())::uuid[])
    and (
      not (select public.solo_asignadas_para_mi())
      or (select auth.uid()) = any(coalesce(asignados_ids, '{}'::uuid[]))
    )
  );

-- Cerrar, cancelar, mover o borrar lo bloquea trg_guardia_ot_recibida.
create policy ordenes_update_envio on public.ordenes_trabajo
  for update to authenticated
  using (
    id = any((select public.ots_recibidas())::uuid[])
    and public.my_rol() = any (array['owner', 'admin', 'member'])
  )
  with check (id = any((select public.ots_recibidas())::uuid[]));

create policy actividad_select_envio on public.actividad_ot
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy actividad_insert_envio on public.actividad_ot
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy actividad_update_own_envio on public.actividad_ot
  for update to authenticated
  using (
    tipo = 'comentario' and usuario_id = (select auth.uid())
    and orden_id = any((select public.ots_recibidas())::uuid[])
  );
create policy actividad_delete_own_envio on public.actividad_ot
  for delete to authenticated
  using (
    tipo = 'comentario' and usuario_id = (select auth.uid())
    and orden_id = any((select public.ots_recibidas())::uuid[])
  );

create policy reacciones_select_envio on public.actividad_reacciones
  for select to authenticated
  using (exists (
    select 1 from public.actividad_ot a
    where a.id = actividad_reacciones.actividad_id
      and a.orden_id = any((select public.ots_recibidas())::uuid[])
  ));
create policy reacciones_insert_envio on public.actividad_reacciones
  for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (
      select 1 from public.actividad_ot a
      where a.id = actividad_reacciones.actividad_id
        and a.orden_id = any((select public.ots_recibidas())::uuid[])
    )
  );

create policy comentarios_select_envio on public.comentarios_orden
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy comentarios_insert_envio on public.comentarios_orden
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy foto_grupos_select_envio on public.foto_grupos
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy foto_grupos_insert_envio on public.foto_grupos
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy foto_grupo_items_select_envio on public.foto_grupo_items
  for select to authenticated
  using (exists (
    select 1 from public.foto_grupos g
    where g.id = foto_grupo_items.grupo_id
      and g.orden_id = any((select public.ots_recibidas())::uuid[])
  ));
create policy foto_grupo_items_insert_envio on public.foto_grupo_items
  for insert to authenticated
  with check (exists (
    select 1 from public.foto_grupos g
    where g.id = foto_grupo_items.grupo_id
      and g.orden_id = any((select public.ots_recibidas())::uuid[])
  ));

create policy archivos_orden_select_envio on public.archivos_orden
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy archivos_orden_insert_envio on public.archivos_orden
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy auditoria_select_envio on public.auditoria_ot
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy auditoria_insert_envio on public.auditoria_ot
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy otproc_select_envio on public.ot_procedimientos
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy ejec_select_envio on public.procedimiento_ejecuciones
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy ejec_insert_envio on public.procedimiento_ejecuciones
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy ejec_update_envio on public.procedimiento_ejecuciones
  for update to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy resp_select_envio on public.paso_respuestas
  for select to authenticated
  using (ejecucion_id in (
    select pe.id from public.procedimiento_ejecuciones pe
    where pe.orden_id = any((select public.ots_recibidas())::uuid[])
  ));
create policy resp_insert_envio on public.paso_respuestas
  for insert to authenticated
  with check (ejecucion_id in (
    select pe.id from public.procedimiento_ejecuciones pe
    where pe.orden_id = any((select public.ots_recibidas())::uuid[])
  ));
create policy resp_update_envio on public.paso_respuestas
  for update to authenticated
  using (ejecucion_id in (
    select pe.id from public.procedimiento_ejecuciones pe
    where pe.orden_id = any((select public.ots_recibidas())::uuid[])
  ));

create policy hojas_select_envio on public.hojas_inventario
  for select to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy hojas_insert_envio on public.hojas_inventario
  for insert to authenticated
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));
create policy hojas_update_envio on public.hojas_inventario
  for update to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy filas_all_envio on public.hojas_inventario_filas
  for all to authenticated
  using (hoja_id in (
    select h.id from public.hojas_inventario h
    where h.orden_id = any((select public.ots_recibidas())::uuid[])
  ))
  with check (hoja_id in (
    select h.id from public.hojas_inventario h
    where h.orden_id = any((select public.ots_recibidas())::uuid[])
  ));

-- Materiales: salen del inventario del contratista (sus `partes`). El dueño no
-- recibe acceso a `partes`, así que no ve precios ni stock del contratista.
create policy orden_partes_all_envio on public.orden_partes
  for all to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]))
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));

create policy mat_all_envio on public.materiales_usados
  for all to authenticated
  using (orden_id = any((select public.ots_recibidas())::uuid[]))
  with check (orden_id = any((select public.ots_recibidas())::uuid[]));

-- Catálogo del dueño: solo lectura y solo las filas que tocan las OTs recibidas.
create policy activos_select_envio on public.activos
  for select to authenticated
  using (id = any((select public.catalogo_recibido('activo'))::uuid[]));
create policy ubicaciones_select_envio on public.ubicaciones
  for select to authenticated
  using (id = any((select public.catalogo_recibido('ubicacion'))::uuid[]));
create policy lugares_select_envio on public.lugares
  for select to authenticated
  using (id = any((select public.catalogo_recibido('lugar'))::uuid[]));
create policy sociedades_select_envio on public.sociedades
  for select to authenticated
  using (id = any((select public.catalogo_recibido('sociedad'))::uuid[]));
create policy categorias_select_envio on public.categorias_ot
  for select to authenticated
  using (id = any((select public.catalogo_recibido('categoria'))::uuid[]));
create policy proc_select_envio on public.procedimientos
  for select to authenticated
  using (id = any((select public.procedimientos_recibidos())::uuid[]));
create policy pasos_select_envio on public.procedimiento_pasos
  for select to authenticated
  using (procedimiento_id = any((select public.procedimientos_recibidos())::uuid[]));
create policy proc_subproc_select_envio on public.procedimiento_subprocedimientos
  for select to authenticated
  using (exists (
    select 1 from public.procedimiento_pasos pp
    where pp.id = procedimiento_subprocedimientos.parent_paso_id
      and pp.procedimiento_id = any((select public.procedimientos_recibidos())::uuid[])
  ));
create policy medidores_select_envio on public.medidores
  for select to authenticated
  using (id = any((select public.medidores_recibidos())::uuid[]));
create policy medidor_lecturas_select_envio on public.medidor_lecturas
  for select to authenticated
  using (medidor_id = any((select public.medidores_recibidos())::uuid[]));

-- ── 5. Triggers ─────────────────────────────────────────────────────────────

-- Lo que el contratista escribe en una OT recibida queda con el workspace del
-- dueño. Sin esto, los clientes graban su propio workspace_id y el dueño no lo
-- vería. Solo actúa si la OT tiene envío: para el resto no cambia nada.
create or replace function public.fn_ws_de_ot_enviada()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden uuid;
  v_ws uuid;
begin
  if tg_table_name = 'paso_respuestas' then
    select pe.orden_id into v_orden from public.procedimiento_ejecuciones pe where pe.id = new.ejecucion_id;
  elsif tg_table_name = 'hojas_inventario_filas' then
    select h.orden_id into v_orden from public.hojas_inventario h where h.id = new.hoja_id;
  else
    v_orden := new.orden_id;
  end if;
  if v_orden is null then
    return new;
  end if;
  select e.workspace_origen into v_ws from public.ot_envios e where e.orden_id = v_orden;
  if v_ws is not null then
    new.workspace_id := v_ws;
  end if;
  return new;
end;
$$;

create trigger trg_ws_de_ot_enviada before insert on public.actividad_ot
  for each row execute function public.fn_ws_de_ot_enviada();
create trigger trg_ws_de_ot_enviada before insert on public.procedimiento_ejecuciones
  for each row execute function public.fn_ws_de_ot_enviada();
create trigger trg_ws_de_ot_enviada before insert on public.paso_respuestas
  for each row execute function public.fn_ws_de_ot_enviada();
create trigger trg_ws_de_ot_enviada before insert on public.foto_grupos
  for each row execute function public.fn_ws_de_ot_enviada();
create trigger trg_ws_de_ot_enviada before insert on public.hojas_inventario
  for each row execute function public.fn_ws_de_ot_enviada();
create trigger trg_ws_de_ot_enviada before insert on public.hojas_inventario_filas
  for each row execute function public.fn_ws_de_ot_enviada();

-- El contratista ejecuta y envía a revisión; cerrar es del dueño.
create or replace function public.fn_guardia_ot_recibida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Sin sesión (cron, service role) o dentro del propio workspace: nada que hacer.
  if auth.uid() is null or old.workspace_id is not distinct from public.my_workspace_id() then
    return new;
  end if;
  if old.estado in ('completado', 'cancelado') then
    raise exception 'La OT ya fue cerrada por el cliente.' using errcode = '42501';
  end if;
  if new.workspace_id is distinct from old.workspace_id
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Una OT recibida no se puede mover ni eliminar.' using errcode = '42501';
  end if;
  if new.estado is distinct from old.estado and new.estado in ('completado', 'cancelado') then
    raise exception 'Envía la OT a revisión: la aprobación es del cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_guardia_ot_recibida before update on public.ordenes_trabajo
  for each row execute function public.fn_guardia_ot_recibida();

-- ── 6. Crear un envío (uso interno) ─────────────────────────────────────────

create or replace function public.crear_envio_ot(
  p_orden_id uuid, p_vinculo_id uuid, p_por uuid, p_nota text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.vinculos_contratista%rowtype;
  v_ot public.ordenes_trabajo%rowtype;
  v_destino_previo uuid;
  v_nombre_destino text;
begin
  select * into v from public.vinculos_contratista where id = p_vinculo_id and estado = 'activo';
  if v.id is null then
    raise exception 'El contratista no está conectado.' using errcode = '22023';
  end if;
  select * into v_ot from public.ordenes_trabajo where id = p_orden_id;
  if v_ot.id is null or v_ot.deleted_at is not null then
    raise exception 'La OT no existe.' using errcode = '22023';
  end if;
  if v_ot.workspace_id is distinct from v.workspace_dueno then
    raise exception 'La OT no es de este cliente.' using errcode = '42501';
  end if;
  if v_ot.estado in ('completado', 'cancelado') then
    raise exception 'La OT ya está cerrada.' using errcode = '22023';
  end if;

  select e.workspace_destino into v_destino_previo
  from public.ot_envios e where e.orden_id = p_orden_id and e.activo;
  select p.nombre into v_nombre_destino from public.proveedores p where p.id = v.proveedor_id;

  insert into public.ot_envios (
    orden_id, vinculo_id, workspace_origen, workspace_destino, activo, nota,
    nombre_origen, nombre_destino, enviado_por, enviado_at
  ) values (
    p_orden_id, v.id, v.workspace_dueno, v.workspace_contratista, true, nullif(btrim(p_nota), ''),
    (select w.nombre from public.workspaces w where w.id = v.workspace_dueno),
    v_nombre_destino, p_por, now()
  )
  on conflict (orden_id) do update set
    vinculo_id = excluded.vinculo_id,
    workspace_destino = excluded.workspace_destino,
    activo = true,
    nota = excluded.nota,
    nombre_origen = excluded.nombre_origen,
    nombre_destino = excluded.nombre_destino,
    enviado_por = excluded.enviado_por,
    enviado_at = excluded.enviado_at;

  -- Cambiar de contratista suelta a los técnicos del anterior: el nuevo
  -- supervisor decide quién va.
  if v_destino_previo is not null and v_destino_previo <> v.workspace_contratista then
    update public.ordenes_trabajo set asignados_ids = '{}'::uuid[] where id = p_orden_id;
  end if;

  insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
  values (p_orden_id, p_por, 'editado', 'Enviada a ' || coalesce(v_nombre_destino, 'contratista'));
end;
$$;

revoke all on function public.crear_envio_ot(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Envío automático: la siguiente OT de una recurrencia hereda el contratista de
-- su cadena, y la OT que genera un plan va al proveedor del plan si está
-- conectado.
create or replace function public.fn_envio_automatico_ot()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_vinculo uuid;
begin
  if tg_table_name = 'ordenes_trabajo' then
    if new.recurrencia_origen_id is null then
      return new;
    end if;
    select e.vinculo_id into v_vinculo
    from public.ot_envios e
    join public.ordenes_trabajo o on o.id = e.orden_id
    join public.vinculos_contratista v on v.id = e.vinculo_id and v.estado = 'activo'
    where e.activo
      and o.id <> new.id
      and (o.id = new.recurrencia_origen_id or o.recurrencia_origen_id = new.recurrencia_origen_id)
    order by e.enviado_at desc
    limit 1;
    if v_vinculo is not null then
      perform public.crear_envio_ot(new.id, v_vinculo, null, null);
    end if;
  else
    if new.orden_id is null
       or (tg_op = 'UPDATE' and old.orden_id is not distinct from new.orden_id) then
      return new;
    end if;
    select v.id into v_vinculo
    from public.planes_mantencion p
    join public.vinculos_contratista v on v.proveedor_id = p.proveedor_id and v.estado = 'activo'
    where p.id = new.plan_id;
    if v_vinculo is not null and not exists (
      select 1 from public.ot_envios e where e.orden_id = new.orden_id and e.activo
    ) then
      perform public.crear_envio_ot(new.orden_id, v_vinculo, null, 'Plan de mantención');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_envio_automatico_ot() from public, anon, authenticated;
revoke all on function public.fn_ws_de_ot_enviada() from public, anon, authenticated;

create trigger trg_envio_automatico_ot after insert on public.ordenes_trabajo
  for each row execute function public.fn_envio_automatico_ot();
create trigger trg_envio_automatico_ot after insert or update of orden_id on public.plan_ocurrencias
  for each row execute function public.fn_envio_automatico_ot();

-- ── 7. RPC ──────────────────────────────────────────────────────────────────

create or replace function public.invitar_contratista(p_proveedor_id uuid, p_email text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_prov public.proveedores%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  select * into v_prov from public.proveedores where id = p_proveedor_id;
  if v_prov.id is null
     or v_prov.workspace_id is distinct from public.my_workspace_id()
     or public.my_rol() not in ('owner', 'admin') then
    raise exception 'Solo un owner o admin puede conectar proveedores.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from auth.users au join public.usuarios u on u.id = au.id
    where lower(au.email) = v_email and u.workspace_id = v_prov.workspace_id
  ) then
    raise exception 'Ese correo es de alguien de tu propio workspace.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.vinculos_contratista
    where proveedor_id = p_proveedor_id and estado = 'activo'
  ) then
    raise exception 'Este proveedor ya está conectado.' using errcode = '22023';
  end if;

  update public.vinculos_contratista
  set email_invitado = v_email, invitado_por = auth.uid(), created_at = now()
  where proveedor_id = p_proveedor_id and estado = 'invitado'
  returning id into v_id;
  if v_id is null then
    insert into public.vinculos_contratista (workspace_dueno, proveedor_id, email_invitado, invitado_por)
    values (v_prov.workspace_id, p_proveedor_id, v_email, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Invitaciones pendientes para el correo con el que inició sesión.
create or replace function public.mis_invitaciones_contratista()
returns table (id uuid, cliente text, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select v.id, w.nombre, v.created_at
  from public.vinculos_contratista v
  join public.workspaces w on w.id = v.workspace_dueno
  where v.estado = 'invitado'
    and v.email_invitado = (select lower(au.email) from auth.users au where au.id = auth.uid())
    and v.workspace_dueno is distinct from public.my_workspace_id()
  order by v.created_at desc;
$$;

create or replace function public.aceptar_vinculo_contratista(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.vinculos_contratista%rowtype;
  v_ws uuid := public.my_workspace_id();
  v_email text;
begin
  select lower(au.email) into v_email from auth.users au where au.id = auth.uid();
  select * into v from public.vinculos_contratista where id = p_id for update;
  if v.id is null or v.estado <> 'invitado' or v.email_invitado is distinct from v_email then
    raise exception 'La invitación no es válida.' using errcode = '42501';
  end if;
  if v_ws is null or v_ws = v.workspace_dueno then
    raise exception 'La invitación no es válida para este workspace.' using errcode = '42501';
  end if;
  if public.my_rol() not in ('owner', 'admin') then
    raise exception 'Solo un owner o admin puede aceptar la conexión.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.vinculos_contratista
    where workspace_dueno = v.workspace_dueno and workspace_contratista = v_ws and estado = 'activo'
  ) then
    raise exception 'Ya están conectados con este cliente.' using errcode = '22023';
  end if;
  update public.vinculos_contratista
  set estado = 'activo', workspace_contratista = v_ws, aceptado_por = auth.uid(), aceptado_at = now()
  where id = p_id;
end;
$$;

-- Cualquiera de los dos lados corta la conexión. Las OTs abiertas dejan de
-- verse; las cerradas quedan visibles para que el contratista pueda cobrarlas.
create or replace function public.revocar_vinculo_contratista(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.vinculos_contratista%rowtype;
  v_ws uuid := public.my_workspace_id();
begin
  select * into v from public.vinculos_contratista where id = p_id for update;
  if v.id is null or v.estado = 'revocado'
     or v_ws is null or v_ws not in (v.workspace_dueno, coalesce(v.workspace_contratista, v.workspace_dueno))
     or public.my_rol() not in ('owner', 'admin') then
    raise exception 'No puedes desconectar este vínculo.' using errcode = '42501';
  end if;
  update public.vinculos_contratista set estado = 'revocado', revocado_at = now() where id = p_id;
  update public.ot_envios e set activo = false
  from public.ordenes_trabajo o
  where o.id = e.orden_id and e.vinculo_id = p_id and o.estado not in ('completado', 'cancelado');
end;
$$;

create or replace function public.enviar_ot_contratista(p_orden_id uuid, p_vinculo_id uuid, p_nota text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.ordenes_trabajo o
    where o.id = p_orden_id and o.workspace_id = public.my_workspace_id()
  ) or public.my_rol() not in ('owner', 'admin', 'member') then
    raise exception 'No puedes enviar esta OT.' using errcode = '42501';
  end if;
  perform public.crear_envio_ot(p_orden_id, p_vinculo_id, auth.uid(), p_nota);
end;
$$;

create or replace function public.retirar_envio_ot(p_orden_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not exists (
    select 1 from public.ordenes_trabajo o
    where o.id = p_orden_id and o.workspace_id = public.my_workspace_id()
  ) or public.my_rol() not in ('owner', 'admin', 'member') then
    raise exception 'No puedes retirar esta OT.' using errcode = '42501';
  end if;
  update public.ot_envios set activo = false
  where orden_id = p_orden_id and activo
  returning nombre_destino into v_nombre;
  if v_nombre is null then
    return;
  end if;
  -- Los asignados eran técnicos del contratista.
  update public.ordenes_trabajo set asignados_ids = '{}'::uuid[] where id = p_orden_id;
  insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
  values (p_orden_id, auth.uid(), 'editado', 'Retirada de ' || v_nombre);
end;
$$;

revoke all on function public.invitar_contratista(uuid, text) from public, anon;
revoke all on function public.mis_invitaciones_contratista() from public, anon;
revoke all on function public.aceptar_vinculo_contratista(uuid) from public, anon;
revoke all on function public.revocar_vinculo_contratista(uuid) from public, anon;
revoke all on function public.enviar_ot_contratista(uuid, uuid, text) from public, anon;
revoke all on function public.retirar_envio_ot(uuid) from public, anon;
grant execute on function public.invitar_contratista(uuid, text) to authenticated;
grant execute on function public.mis_invitaciones_contratista() to authenticated;
grant execute on function public.aceptar_vinculo_contratista(uuid) to authenticated;
grant execute on function public.revocar_vinculo_contratista(uuid) to authenticated;
grant execute on function public.enviar_ot_contratista(uuid, uuid, text) to authenticated;
grant execute on function public.retirar_envio_ot(uuid) to authenticated;

grant select on public.vinculos_contratista to authenticated;
grant select on public.ot_envios to authenticated;
