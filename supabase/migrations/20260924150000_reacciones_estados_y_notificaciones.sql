-- Reactions: also on status events, a notification to the author, and a live
-- broadcast so an open OT panel sees them.
--
-- 1. Reactable rows: comments plus status events (the web shows the emoji
--    picker on both). Creation, assignment, edits and photo uploads stay out.
-- 2. on_actividad_reaccion: the author of the reacted row gets a notification
--    (tipo 'reaccion'), like Messages' "X reaccionó ❤️ a …". Not for reacting
--    to your own row, and not when an upsert keeps the same emoji. Removing a
--    reaction notifies nobody. on_notification_insert turns it into a push;
--    send-push-notification gates 'reaccion' under notif_comentario.
-- 3. broadcast_actividad_reaccion: sends to the same `ot:<orden_id>` topic
--    trg_broadcast_actividad_ot uses, so listeners refetch the feed.

-- ── 1. Policies ──────────────────────────────────────────────────────────────
drop policy if exists reacciones_insert_own on public.actividad_reacciones;
create policy reacciones_insert_own on public.actividad_reacciones
for insert to authenticated
with check (
  usuario_id = (select auth.uid())
  and exists (
    select 1 from public.actividad_ot a
    where a.id = actividad_id
      and a.tipo in ('comentario', 'estado_cambiado', 'iniciado', 'pausado', 'reanudado', 'completado', 'cancelado')
      and a.workspace_id = (select public.my_workspace_id())
  )
);

drop policy if exists reacciones_update_own on public.actividad_reacciones;
create policy reacciones_update_own on public.actividad_reacciones
for update to authenticated
using (usuario_id = (select auth.uid()))
with check (
  usuario_id = (select auth.uid())
  and exists (
    select 1 from public.actividad_ot a
    where a.id = actividad_id
      and a.tipo in ('comentario', 'estado_cambiado', 'iniciado', 'pausado', 'reanudado', 'completado', 'cancelado')
      and a.workspace_id = (select public.my_workspace_id())
  )
);

-- ── 2. Notification ──────────────────────────────────────────────────────────
create or replace function public.trigger_notify_reaccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_nombre text;
  v_nota text;
  v_sobre text;
begin
  if tg_op = 'UPDATE' and new.emoji is not distinct from old.emoji then
    return new;
  end if;

  select ao.orden_id, ao.usuario_id, ao.tipo, ao.comentario, ao.foto_url, o.numero
  into a
  from public.actividad_ot ao
  join public.ordenes_trabajo o on o.id = ao.orden_id
  where ao.id = new.actividad_id;

  if not found or a.usuario_id is null or a.usuario_id = new.usuario_id then
    return new;
  end if;

  select nombre into v_nombre from public.usuarios where id = new.usuario_id;
  v_nota := nullif(trim(a.comentario), '');

  -- What was reacted to, as the notification body.
  v_sobre := case a.tipo
    when 'comentario' then
      'tu comentario: "' || left(coalesce(v_nota, case when a.foto_url is not null then 'Foto' else 'Audio' end), 100) || '"'
    when 'estado_cambiado' then 'tu cambio de estado' || coalesce(' a ' || v_nota, '')
    when 'iniciado' then 'tu inicio del trabajo'
    when 'reanudado' then 'tu reanudación del trabajo'
    when 'pausado' then 'tu pausa' || coalesce(': "' || left(v_nota, 100) || '"', '')
    when 'completado' then 'tu cierre del trabajo' || coalesce(': "' || left(v_nota, 100) || '"', '')
    when 'cancelado' then 'tu cancelación' || coalesce(': "' || left(v_nota, 100) || '"', '')
    else 'tu actividad'
  end;

  insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
  values (
    a.usuario_id,
    coalesce(v_nombre, 'Alguien') || ' reaccionó ' || new.emoji,
    'A ' || v_sobre || coalesce(' · OT #' || a.numero, ''),
    'reaccion',
    '/orden/' || a.orden_id::text
  );

  return new;
end;
$$;

revoke all on function public.trigger_notify_reaccion() from public, anon, authenticated;

drop trigger if exists on_actividad_reaccion on public.actividad_reacciones;
create trigger on_actividad_reaccion
after insert or update of emoji on public.actividad_reacciones
for each row execute function public.trigger_notify_reaccion();

-- ── 3. Live broadcast ────────────────────────────────────────────────────────
create or replace function public.broadcast_actividad_reaccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden uuid;
begin
  select orden_id into v_orden
  from public.actividad_ot
  where id = coalesce(new.actividad_id, old.actividad_id);

  if v_orden is not null then
    perform realtime.send(
      jsonb_build_object('actividad_id', coalesce(new.actividad_id, old.actividad_id)),
      'reaccion',
      'ot:' || v_orden::text,
      true
    );
  end if;
  return null;
end;
$$;

revoke all on function public.broadcast_actividad_reaccion() from public, anon, authenticated;

drop trigger if exists trg_broadcast_actividad_reaccion on public.actividad_reacciones;
create trigger trg_broadcast_actividad_reaccion
after insert or update or delete on public.actividad_reacciones
for each row execute function public.broadcast_actividad_reaccion();
