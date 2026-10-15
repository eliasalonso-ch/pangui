-- Un asignado que no existe en auth.users (usuario dado de baja, o un id
-- basura que coló el escaneo IA) hacía reventar el comando completo:
-- iniciar/cerrar/reabrir/editar la OT fallaba con
-- work_order_notification_outbox_recipient_id_fkey.
-- No hay a quién notificar, así que se descarta la fila en vez de abortar.
-- Un solo guard aquí cubre los cuatro comandos v1 que insertan en el outbox.

CREATE OR REPLACE FUNCTION public.work_order_outbox_skip_ghost_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.recipient_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.recipient_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.work_order_outbox_skip_ghost_recipient() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS skip_ghost_recipient ON public.work_order_notification_outbox;
CREATE TRIGGER skip_ghost_recipient
  BEFORE INSERT ON public.work_order_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.work_order_outbox_skip_ghost_recipient();
