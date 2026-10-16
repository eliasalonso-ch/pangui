-- El estado del activo sigue a sus OTs preventivas (incluidas las de un plan).
--
-- Que el técnico se acuerde de marcar el activo "en mantención" y de volverlo a
-- "operativo" es justo lo que se olvida (MaintainX solo pregunta al cerrar).
-- Acá lo hace la base, así da igual si la OT se inicia desde la web, el móvil,
-- el outbox offline o un proveedor que la recibió:
--   · la OT pasa a en_curso → el activo operativo pasa a mantención · planeado,
--     en un período ligado a esa OT (activo_estado_periodos.orden_id);
--   · la OT se completa, se cancela o se borra → si el período abierto sigue
--     siendo el de esa OT, el activo vuelve a operativo;
--   · pausar no lo devuelve: el activo sigue en mantención.
-- Solo deshace lo que hizo: si alguien cambió el estado a mano entremedio (p. ej.
-- fuera de servicio por una falla), el período ya no es de la OT y no se toca.
-- Reactivas y emergencias no cambian el estado: el equipo puede seguir andando
-- mientras se diagnostica, y si está detenido lo marcó quien reportó la falla.

alter table public.activo_estado_periodos
  add column if not exists orden_id uuid references public.ordenes_trabajo(id) on delete set null;

create index if not exists idx_activo_estado_periodos_orden
  on public.activo_estado_periodos (orden_id) where orden_id is not null;

create or replace function public.fn_activo_estado_por_ot()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_activo record;
  v_periodo record;
  v_otra uuid;
  v_inicia boolean;
  v_termina boolean;
begin
  if new.activo_id is null or new.tipo_trabajo is distinct from 'preventiva' then
    return new;
  end if;

  v_inicia := new.estado = 'en_curso' and new.deleted_at is null
    and (tg_op = 'INSERT' or old.estado is distinct from 'en_curso');
  v_termina := tg_op = 'UPDATE'
    and (new.estado in ('completado', 'cancelado') or new.deleted_at is not null)
    and not (old.estado in ('completado', 'cancelado') or old.deleted_at is not null);

  if v_inicia then
    select id, workspace_id, estado into v_activo
    from public.activos where id = new.activo_id and coalesce(activo, true)
    for update;
    -- Solo desde operativo: un activo ya detenido (falla, otra OT) queda como está.
    if v_activo.id is null or coalesce(v_activo.estado, 'operativo') <> 'operativo' then
      return new;
    end if;
    -- Un período de duración cero (misma transacción) se borra en vez de cerrarse:
    -- la tabla exige fin > inicio.
    delete from public.activo_estado_periodos
    where activo_id = v_activo.id and fin is null and inicio >= now();
    update public.activo_estado_periodos set fin = now()
    where activo_id = v_activo.id and fin is null;
    insert into public.activo_estado_periodos
      (activo_id, workspace_id, estado, tipo_inactividad, inicio, notas, creado_por, orden_id)
    values
      (v_activo.id, v_activo.workspace_id, 'mantencion', 'planeado', now(),
       'OT preventiva: ' || coalesce(new.titulo, ''), auth.uid(), new.id);
    -- fn_sync_activo_estado_periodo ve el período abierto en mantención y no duplica.
    update public.activos set estado = 'mantencion' where id = v_activo.id;

  elsif v_termina then
    select p.id, p.inicio into v_periodo
    from public.activo_estado_periodos p
    where p.activo_id = new.activo_id and p.fin is null and p.orden_id = new.id
    for update;
    if v_periodo.id is null then
      return new;
    end if;

    -- Otra preventiva del mismo activo sigue en curso: el período pasa a ella.
    select o.id into v_otra
    from public.ordenes_trabajo o
    where o.activo_id = new.activo_id and o.id <> new.id and o.deleted_at is null
      and o.estado = 'en_curso' and o.tipo_trabajo = 'preventiva'
    order by o.iniciado_at desc nulls last
    limit 1;
    if v_otra is not null then
      update public.activo_estado_periodos set orden_id = v_otra where id = v_periodo.id;
      return new;
    end if;

    if v_periodo.inicio < now() then
      update public.activo_estado_periodos set fin = now() where id = v_periodo.id;
    else
      delete from public.activo_estado_periodos where id = v_periodo.id;
    end if;
    insert into public.activo_estado_periodos
      (activo_id, workspace_id, estado, inicio, creado_por)
    select a.id, a.workspace_id, 'operativo', now(), auth.uid()
    from public.activos a where a.id = new.activo_id;
    update public.activos set estado = 'operativo' where id = new.activo_id;
  end if;

  return new;
end;
$$;

revoke all on function public.fn_activo_estado_por_ot() from public, anon, authenticated;

drop trigger if exists trg_activo_estado_por_ot on public.ordenes_trabajo;
create trigger trg_activo_estado_por_ot
  after insert or update of estado, deleted_at on public.ordenes_trabajo
  for each row execute function public.fn_activo_estado_por_ot();
