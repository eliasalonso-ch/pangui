-- "Escribiendo…" en la Actividad de una OT.
--
-- Los clientes se avisan entre sí por Broadcast en el canal privado
-- `typing:<orden_id>` (no en `ot:<orden_id>`: la web invalida el feed con
-- cualquier evento de ese canal, y un aviso por tecla lo refrescaría sin parar).
--
-- Es un canal privado, así que hacen falta dos políticas en realtime.messages:
-- recibir (select) y enviar (insert). Solo miembros del workspace de la OT.
-- Realtime autoriza al unirse al canal, no por mensaje; (select auth.uid()) va
-- envuelto igual que en 20260923200000_broadcast_actividad_ot.sql.

create policy "ot members receive typing"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.ordenes_trabajo o
    join public.usuarios u on u.id = (select auth.uid())
    where 'typing:' || o.id::text = realtime.topic()
      and u.workspace_id is not null
      and o.workspace_id = u.workspace_id
  )
);

create policy "ot members send typing"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.ordenes_trabajo o
    join public.usuarios u on u.id = (select auth.uid())
    where 'typing:' || o.id::text = realtime.topic()
      and u.workspace_id is not null
      and o.workspace_id = u.workspace_id
  )
);
