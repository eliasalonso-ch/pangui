-- Restrict the meconecta scraper to business hours: Mon-Sat, 07:00-18:00
-- America/Santiago.
--
-- Previously it ran every 15 min, 24/7, producing overnight and Sunday
-- notifications for a portal nobody is working at those hours. meconecta is the
-- single largest notification source (712 rows, ~27% of all notifications).
--
-- The window is enforced INSIDE the command rather than in the cron expression
-- on purpose: pg_cron schedules in the database timezone (UTC), and Chile
-- observes DST, so a hardcoded UTC hour range would drift by an hour twice a
-- year. The job still ticks every 15 min; the body no-ops outside the window.
--
-- 18:00 is exclusive: the last scrape of the day starts at 17:45.

-- Se envuelve en un DO con guarda: `cron.alter_job` recibía el resultado de una
-- subconsulta que en una base recién creada devuelve NULL (el job existe en
-- producción, pero CI levanta el esquema sólo desde migraciones y ahí nunca se
-- creó), y alter_job rechaza un jobid nulo con "job_id can not be NULL".
DO $mig$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'meconecta-scrape-tick';

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'meconecta-scrape-tick no existe; se omite (esperado en CI).';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    v_jobid,
    command := $job$
    WITH ahora AS (
      SELECT now() AT TIME ZONE 'America/Santiago' AS ts
    )
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meconecta_cron_url'),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    ) AS request_id
    FROM ahora
    WHERE EXTRACT(ISODOW FROM ahora.ts) BETWEEN 1 AND 6  -- Mon(1) .. Sat(6)
      AND EXTRACT(HOUR  FROM ahora.ts) >= 7
      AND EXTRACT(HOUR  FROM ahora.ts) <  18;
    $job$
  );
END
$mig$;
