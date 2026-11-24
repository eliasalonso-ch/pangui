-- Pendientes: hora opcional, recurrencia y canales (push / correo).
--
-- Sigue a 20261123120000_ot_pendientes.sql, ya aplicada. El diálogo nuevo
-- deja elegir hora ("en 1 hora", "esta tarde"), repetición y por dónde avisar.
--   · hora null = push a las 08:30, como antes.
--   · La recurrencia usa el MISMO formato que las OTs (recurrencia +
--     recurrencia_config, con end_date) y la misma función para avanzar
--     (recurrente_advance_date): la web reutiliza RecurrenceControls tal cual.
--   · El push pasa de un tick diario a uno cada 15 min, para respetar la hora.
--     El correo diario sigue a las 08:30 en días hábiles, en su propio job.

alter table public.ot_pendientes
  add column hora               time,
  add column recurrencia        text    not null default 'ninguna',
  add column recurrencia_config jsonb,
  add column push               boolean not null default true,
  add column correo             boolean not null default true,
  add constraint ot_pendientes_algun_canal check (push or correo);

-- ── Actividad + repetición ───────────────────────────────────────────────────
-- Al marcar hecho un pendiente que se repite, se crea el siguiente: la primera
-- fecha de la serie posterior a hoy (si se marca tarde no deja una cola de
-- ocurrencias atrasadas), salvo que pase la fecha de fin.
create or replace function public.ot_pendientes_actividad()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hoy   date := (now() at time zone 'America/Santiago')::date;
  v_sig   date;
  v_fin   date;
  v_guard integer := 0;
begin
  if tg_op = 'INSERT' then
    insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
    values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_creado',
            to_char(new.fecha, 'DD/MM/YYYY') || coalesce(' ' || to_char(new.hora, 'HH24:MI'), '')
            || ' · ' || new.nota);
    return null;
  end if;

  if new.hecho_at is not null and old.hecho_at is null then
    insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
    values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_hecho', new.nota);

    if new.recurrencia <> 'ninguna' then
      v_sig := new.fecha;
      loop
        v_sig := public.recurrente_advance_date(v_sig, new.recurrencia, new.recurrencia_config);
        v_guard := v_guard + 1;
        exit when v_sig is null or v_sig > v_hoy or v_guard > 1000;
      end loop;

      v_fin := nullif(new.recurrencia_config->>'end_date', '')::date;
      if v_sig is not null and v_sig > v_hoy and (v_fin is null or v_sig <= v_fin) then
        insert into public.ot_pendientes
          (workspace_id, orden_id, usuario_id, fecha, hora, nota, recurrencia, recurrencia_config, push, correo)
        values
          (new.workspace_id, new.orden_id, new.usuario_id, v_sig, new.hora, new.nota,
           new.recurrencia, new.recurrencia_config, new.push, new.correo);
      end if;
    end if;
  end if;
  return null;
end
$function$;

-- ── Push: respeta la hora y el canal ─────────────────────────────────────────
create or replace function public.pendientes_avisar()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer;
begin
  with vencidos as (
    update public.ot_pendientes p
    set avisado_at = now()
    from public.ordenes_trabajo o
    where o.id = p.orden_id
      and o.deleted_at is null
      and p.push
      and p.hecho_at is null
      and p.avisado_at is null
      and p.fecha <= (now() at time zone 'America/Santiago')::date
      and p.fecha + coalesce(p.hora, time '08:30') <= now() at time zone 'America/Santiago'
    returning p.usuario_id, p.orden_id, p.nota, o.numero, o.titulo
  ),
  ins as (
    insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
    select usuario_id,
           'Pendiente: ' || coalesce(nullif(btrim(titulo), ''), 'OT #' || numero, 'OT'),
           nota,
           'pendiente',
           '/orden/' || orden_id::text
    from vencidos
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end
$function$;

-- ── Crons: push cada 15 min, correo a las 08:30 en días hábiles ──────────────
select cron.unschedule('pendientes-tick');

select cron.schedule(
  'pendientes-tick',
  '*/15 * * * *',
  $job$select public.pendientes_avisar();$job$
);

-- pg_cron corre en UTC y Chile cambia de horario (UTC-3 / UTC-4): se programa
-- a las 11:30 y 12:30 UTC y solo pasa la corrida en que en Santiago son las 8.
select cron.schedule(
  'pendientes-correo',
  '30 11,12 * * 1-5',
  $job$
  select net.http_post(
           url     := 'https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/pendientes-digest',
           headers := jsonb_build_object(
             'Content-Type',  'application/json',
             'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
           ),
           body    := '{}'::jsonb
         )
  from (select now() at time zone 'America/Santiago' as ts) a
  where extract(hour from a.ts) = 8;
  $job$
);
