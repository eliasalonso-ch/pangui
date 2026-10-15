-- Una ejecución completada no vuelve a en_curso.
-- La app móvil (ensureEjecucionServer) hace upsert con estado='en_curso' antes
-- de cada sync de respuesta/complete; eso revertía ejecuciones completadas y el
-- siguiente complete volvía a disparar notify_procedure_completed (PTS duplicados).
-- Ningún flujo reabre una ejecución, así que se bloquea la regresión en la BD.

create or replace function public.fn_ejecucion_no_reabrir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'completado' and new.estado is distinct from 'completado' then
    new.estado := old.estado;
    new.completado_por := old.completado_por;
    new.completado_at := old.completado_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ejecucion_no_reabrir on public.procedimiento_ejecuciones;
create trigger trg_ejecucion_no_reabrir
  before update on public.procedimiento_ejecuciones
  for each row execute function public.fn_ejecucion_no_reabrir();

-- Reparar las que ya quedaron revertidas (en_curso con completado_at).
-- Pasan a completado sin notificar: notify_procedure_completed corre AFTER UPDATE
-- y se omite mientras dure esta transacción.
alter table public.procedimiento_ejecuciones disable trigger trg_notify_procedure_completed;
update public.procedimiento_ejecuciones
   set estado = 'completado'
 where estado = 'en_curso' and completado_at is not null;
alter table public.procedimiento_ejecuciones enable trigger trg_notify_procedure_completed;
