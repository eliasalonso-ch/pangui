-- Revierte 20260826180000_drop_on_notification_insert_webhook.sql.
--
-- Quitar el trigger fue un error de analisis: notificar NO es el unico origen
-- de filas en notifications. Ocho funciones de base de datos insertan directo
-- (trigger_notify_comment, trigger_notify_assignment, trigger_notify_completion,
-- notify_users, notify_procedure_completed, generar_siguiente_ot_recurrente,
-- finalize_ot_upload_v1 y process_work_order_notification_outbox_v1) y para
-- todas ellas este webhook era el UNICO camino al push movil. Sin el, los
-- comentarios y asignaciones creaban la notificacion in-app pero ningun push.
--
-- El envio en lote de notificar sigue desplegado y funcionando para las
-- notificaciones que crea el mismo. Para retirar el webhook de verdad habria
-- que enrutar tambien esas ocho funciones, que es un cambio aparte.
create trigger on_notification_insert
  after insert on public.notifications
  for each row
  execute function supabase_functions.http_request(
    'https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/send-push-notification',
    'POST',
    '{"Content-type":"application/json"}',
    '{}',
    '5000');
