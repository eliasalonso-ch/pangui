-- El proveedor ejecuta la OT, pero no la edita.
--
-- ordenes_update_envio deja al proveedor actualizar la fila de una OT recibida
-- (las apps registran la ejecución con UPDATE directos). Hasta ahora la guardia
-- solo bloqueaba cerrar, cancelar, mover o borrar: podía cambiar título,
-- descripción, activo, fechas, prioridad… Ahora solo puede tocar lo que es de
-- la ejecución:
--   · estado y cronómetro (estado, en_ejecucion, iniciado_at, pausado_at,
--     tiempo_total_segundos) — cerrar/cancelar sigue bloqueado;
--   · técnicos asignados, pero solo los de SU empresa;
--   · fotos (fotos_urls) y adjuntos (links), estos últimos solo agregando;
--   · la firma del cliente.
-- updated_at / duracion_min / completado_en los calculan triggers.

create or replace function public.fn_guardia_ot_recibida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ws uuid := public.my_workspace_id();
  -- Lo único que el proveedor puede cambiar en una OT recibida.
  c_permitidas constant text[] := array[
    'estado', 'en_ejecucion', 'iniciado_at', 'pausado_at', 'tiempo_total_segundos',
    'asignados_ids', 'fotos_urls', 'links',
    'cliente_firma_url', 'cliente_firma_nombre', 'cliente_firma_at',
    'updated_at', 'duracion_min', 'completado_en'
  ];
begin
  -- Sin sesión (cron, service role) o dentro del propio workspace: nada que hacer.
  if auth.uid() is null or old.workspace_id is not distinct from v_ws then
    return new;
  end if;
  if old.estado in ('completado', 'cancelado') then
    raise exception 'La OT ya fue cerrada por el cliente.' using errcode = '42501';
  end if;
  if new.estado is distinct from old.estado and new.estado in ('completado', 'cancelado') then
    raise exception 'Envía la OT a revisión: la aprobación es del cliente.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - c_permitidas) is distinct from (to_jsonb(old) - c_permitidas) then
    raise exception 'Solo el cliente puede editar esta OT. Puedes ejecutarla, asignar a tus técnicos y agregar fotos o archivos.'
      using errcode = '42501';
  end if;
  if not (coalesce(new.links, '[]'::jsonb) @> coalesce(old.links, '[]'::jsonb)) then
    raise exception 'No puedes quitar los archivos o links que dejó el cliente.' using errcode = '42501';
  end if;
  -- Técnicos que entran o salen: tienen que ser de la empresa del proveedor.
  if exists (
    select 1
    from (
      select unnest(coalesce(new.asignados_ids, '{}'::uuid[])) a
      except
      select unnest(coalesce(old.asignados_ids, '{}'::uuid[]))
      union
      (select unnest(coalesce(old.asignados_ids, '{}'::uuid[]))
       except
       select unnest(coalesce(new.asignados_ids, '{}'::uuid[])))
    ) cambio
    where not exists (select 1 from public.usuarios u where u.id = cambio.a and u.workspace_id = v_ws)
  ) then
    raise exception 'Solo puedes asignar o quitar técnicos de tu empresa.' using errcode = '42501';
  end if;
  return new;
end;
$$;
