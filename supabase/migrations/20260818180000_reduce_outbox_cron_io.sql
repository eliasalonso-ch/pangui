-- Cut the disk I/O the notification outbox costs while its queue sits empty.
--
-- Measured before this change (pg_stat_statements + cron.job_run_details):
--   * process_work_order_notification_outbox_v1: 5,591 calls, 47 shared_blks_read.
--     It does NOT read from disk -- 3,042,071 of its block touches were
--     shared_blks_hit (RAM). Its index (work_order_notification_outbox_pending_idx,
--     partial ON created_at WHERE processed_at IS NULL) is already correct and
--     the queue had 0 unprocessed rows.
--   * The cost is write amplification, not reads: running every minute, 24/7,
--     each tick writes 1 INSERT + 4 UPDATEs to cron.job_run_details purely to
--     record that it found nothing. 34,182 of the table's 44,256 rows came from
--     this one job, and the table had grown to 12 MB of a 122 MB database.
--
-- Two changes, no behavior loss:
--   1. Tick every 5 minutes instead of every minute (5x fewer bookkeeping
--      writes). Notification latency goes from <1 min to <5 min, which is well
--      inside what a CMMS needs. The batch size rises 100 -> 500 so a burst
--      still drains in one tick.
--   2. Retain 7 days of cron history instead of unbounded. pg_cron never prunes
--      job_run_details itself; without this the table grows forever.

SELECT cron.schedule(
  'process-work-order-notification-outbox-v1',
  '*/5 * * * *',
  'SELECT public.process_work_order_notification_outbox_v1(500);'
);

-- One-time reclaim of the accumulated backlog.
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

-- Keep it bounded from here on. Runs daily at 04:30, after purge-papelera-diario
-- (04:00) so the two maintenance jobs do not overlap.
SELECT cron.schedule(
  'purge-cron-history',
  '30 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
