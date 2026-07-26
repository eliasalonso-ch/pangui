-- Security tightening: remove RLS-bypass policies and drop broad storage listing policies.

-- 1a. notifications: drop public INSERT bypass. service_role bypasses RLS.
DROP POLICY IF EXISTS "Service role insert notifications" ON public.notifications;

-- 1b. notifications_alertas_log: drop open ALL policy. Only edge functions write here.
DROP POLICY IF EXISTS "Service role full access" ON public.notifications_alertas_log;

-- 1c. solicitudes_arco: keep public INSERT for the intake form, but lock SELECT/UPDATE
-- to service_role only (no superadmin role exists in usuarios).
DROP POLICY IF EXISTS "arco_insert" ON public.solicitudes_arco;
DROP POLICY IF EXISTS "arco_select" ON public.solicitudes_arco;
DROP POLICY IF EXISTS "arco_update" ON public.solicitudes_arco;

CREATE POLICY "arco_insert_public"
  ON public.solicitudes_arco
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
-- No SELECT/UPDATE policy => only service_role can read/update.

-- 1d. tipos_parte: global lookup. Authenticated read; service_role writes.
DROP POLICY IF EXISTS "tipos_parte_all" ON public.tipos_parte;

CREATE POLICY "tipos_parte_select"
  ON public.tipos_parte
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Storage: drop broad SELECT (LIST) policies on public buckets.
-- Direct /object/public/<bucket>/<path> access keeps working because the
-- buckets are marked public; only enumeration via LIST is blocked.
DROP POLICY IF EXISTS "public read activos-archivos" ON storage.objects;
DROP POLICY IF EXISTS "public read activos-imagenes" ON storage.objects;
DROP POLICY IF EXISTS "public read orden-fotos" ON storage.objects;
DROP POLICY IF EXISTS "public read partes-archivos" ON storage.objects;
DROP POLICY IF EXISTS "public read partes-imagenes" ON storage.objects;
DROP POLICY IF EXISTS "archivos_ordenes_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_fotos" ON storage.objects;;
