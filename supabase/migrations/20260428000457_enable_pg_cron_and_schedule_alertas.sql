
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'evaluar-alertas-cada-hora',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/evaluar-alertas',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
;
