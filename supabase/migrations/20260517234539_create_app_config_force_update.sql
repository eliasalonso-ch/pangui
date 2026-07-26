CREATE TABLE IF NOT EXISTS public.app_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_select" ON public.app_config
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.app_config (key, value)
VALUES ('android_min_version_code', '14')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
;
