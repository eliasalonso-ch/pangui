-- Schedules the meconecta-scrape-cron edge function every 15 minutes.
-- Mirrors the export-schedules-tick pattern: URL + service key pulled from Vault.
--
-- Prerequisites (created out-of-band, not in this migration):
--   - vault secret 'meconecta_cron_url'  = the function's invoke URL
--   - vault secret 'service_role_key'    = service role JWT (already present)
--   - function MECONECTA_EMAIL / MECONECTA_PASSWORD secrets set
--
-- The function is hard-gated to the Electrilam workspace; this feature does not
-- run for any other workspace.

select cron.schedule(
  'meconecta-scrape-tick',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meconecta_cron_url'),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    ) AS request_id
  $$
);
