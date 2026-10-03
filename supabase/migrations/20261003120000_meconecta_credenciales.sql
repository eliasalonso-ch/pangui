-- Credenciales MeConecta del contratista, cifradas en Vault.
--
-- Hasta ahora el scraper usaba los secrets de Edge Functions MECONECTA_EMAIL /
-- MECONECTA_PASSWORD, es decir, una clave que conocía el equipo de Pangui. Desde
-- aquí la clave la ingresa (y revoca) un owner/admin de Electrilam; queda en
-- Vault y solo service_role (las Edge Functions) puede descifrarla.
--
-- Exclusivo de Electrilam (workspace hardcodeado, igual que el scraper).

CREATE TABLE public.integration_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('meconecta')),
  username      text NOT NULL,
  secret_id     uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'conectado', 'credenciales_invalidas', 'error')),
  last_sync_at  timestamptz,
  last_error    text,
  -- Registro de consentimiento: quién autorizó a Pangui a usar la cuenta y cuándo.
  authorized_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

-- Owners/admins ven el estado de su conexión. secret_id es solo un puntero:
-- sin acceso al esquema vault no sirve para nada.
CREATE POLICY integration_connections_select_admin
  ON public.integration_connections FOR SELECT TO authenticated
  USING (
    workspace_id = (SELECT public.my_workspace_id())
    AND (SELECT public.my_rol()) IN ('owner', 'admin')
  );

-- Sin políticas de escritura: los usuarios escriben solo vía RPC y las Edge
-- Functions con service_role. Se quitan además los grants por defecto.
REVOKE ALL ON public.integration_connections FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_connections FROM authenticated;

CREATE OR REPLACE FUNCTION public.set_meconecta_credentials(
  p_usuario text, p_clave text, p_autoriza boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ws constant uuid := 'f1b64714-6de2-4d49-b6e4-5959553e94d7';
  v_secret uuid;
BEGIN
  IF public.my_workspace_id() IS DISTINCT FROM v_ws
     OR coalesce(public.my_rol(), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_autoriza IS NOT TRUE THEN
    RAISE EXCEPTION 'Falta la autorización para sincronizar MeConecta' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_usuario), '') = '' OR coalesce(p_clave, '') = '' THEN
    RAISE EXCEPTION 'Usuario y clave son obligatorios' USING ERRCODE = '22023';
  END IF;

  SELECT secret_id INTO v_secret
    FROM public.integration_connections
   WHERE workspace_id = v_ws AND provider = 'meconecta'
   FOR UPDATE;

  IF v_secret IS NULL THEN
    v_secret := vault.create_secret(p_clave, 'meconecta_' || v_ws::text, 'Clave MeConecta del contratista');
    INSERT INTO public.integration_connections
      (workspace_id, provider, username, secret_id, authorized_by, authorized_at)
    VALUES (v_ws, 'meconecta', btrim(p_usuario), v_secret, auth.uid(), now());
  ELSE
    PERFORM vault.update_secret(v_secret, p_clave);
    UPDATE public.integration_connections
       SET username = btrim(p_usuario), status = 'pendiente', last_error = NULL,
           authorized_by = auth.uid(), authorized_at = now(), updated_at = now()
     WHERE workspace_id = v_ws AND provider = 'meconecta';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.disconnect_meconecta()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ws constant uuid := 'f1b64714-6de2-4d49-b6e4-5959553e94d7';
  v_secret uuid;
BEGIN
  IF public.my_workspace_id() IS DISTINCT FROM v_ws
     OR coalesce(public.my_rol(), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.integration_connections
   WHERE workspace_id = v_ws AND provider = 'meconecta'
  RETURNING secret_id INTO v_secret;

  IF v_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret;
  END IF;
END $$;

-- Solo para las Edge Functions. authorized_at sirve de versión: los cambios de
-- estado se condicionan a él para no pisar una clave guardada a mitad de un run.
CREATE OR REPLACE FUNCTION public.get_meconecta_credentials()
RETURNS TABLE (username text, password text, status text, authorized_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.username, s.decrypted_secret, c.status, c.authorized_at
    FROM public.integration_connections c
    JOIN vault.decrypted_secrets s ON s.id = c.secret_id
   WHERE c.workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7'
     AND c.provider = 'meconecta';
$$;

REVOKE ALL ON FUNCTION public.set_meconecta_credentials(text, text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.disconnect_meconecta() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_meconecta_credentials() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_meconecta_credentials(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_meconecta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meconecta_credentials() TO service_role;
