-- Replace Postgres Changes with Broadcast for actividad_ot.
--
-- WHY: the Realtime WAL decoder is 89% of ALL database time
-- (1,975,097 calls / 11,852s in pg_stat_statements, stats reset 2026-08-24).
-- It polls the replication slot at ~46 calls/min regardless of write volume --
-- the four published tables took only 10,120 writes in 30 days. This is why
-- 20260814190000_trim_realtime_publication.sql did NOT help: dropping tables
-- from the publication does not reduce polling. Per Supabase's architecture
-- docs, "Realtime delivers changes by polling the replication slot", and
-- Postgres Changes additionally runs an RLS authorization check PER SUBSCRIBER
-- PER WAL RECORD. With 9 subscriptions that is the multiplier we are removing.
--
-- Broadcast still uses a replication slot (on realtime.messages), so decoder
-- cost does not go to zero. What goes away is the per-subscriber authorization
-- work, which is the part that scales badly.
--
-- This migration converts actividad_ot ONLY, as a verifiable slice. The
-- publication is deliberately NOT dropped here -- see the final section.

-- ─── 1. Receive policy on realtime.messages ──────────────────────────────────
-- Broadcast authorization is enabled by default and realtime.messages currently
-- has ZERO policies, so without this nobody receives anything.
--
-- (select auth.uid()) is wrapped on purpose: an unwrapped auth.uid() is
-- re-evaluated per row, which on realtime.messages means per message -- exactly
-- the per-row overhead this migration exists to remove.
create policy "ot members receive broadcasts"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.actividad_ot a
    join public.usuarios u on u.id = (select auth.uid())
    where 'ot:' || a.orden_id::text = realtime.topic()
      and u.workspace_id is not null
      and a.workspace_id = u.workspace_id
  )
);

-- ─── 2. Trigger function ─────────────────────────────────────────────────────
-- SECURITY DEFINER is required: the trigger must insert into realtime.messages,
-- which the calling user cannot write to directly. Per Supabase's security
-- guidance this is the sanctioned use, and the function returns `trigger` so it
-- cannot be meaningfully invoked over RPC even though PUBLIC holds EXECUTE.
create or replace function public.broadcast_actividad_ot()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  -- realtime.broadcast_changes takes EIGHT arguments; the trailing `level` is
  -- required. Signature:
  --   (topic_name, event_name, operation, table_name, table_schema, new, old, level)
  perform realtime.broadcast_changes(
    'ot:' || coalesce(new.orden_id, old.orden_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old,
    'ROW'
  );
  return null;
end;
$$;

create trigger trg_broadcast_actividad_ot
  after insert or update or delete on public.actividad_ot
  for each row execute function public.broadcast_actividad_ot();

-- ─── 3. Publication ──────────────────────────────────────────────────────────
-- NOT dropped in this migration, on purpose. Running both paths briefly is
-- harmless (the client listens to one channel) and lets the Broadcast path be
-- verified in the UI before the old one is removed. Once confirmed:
--
--   alter publication supabase_realtime drop table public.actividad_ot;
--
-- pangui-native-stable/tests/realtime.test.ts:167 asserts postgres_changes on
-- ordenes_trabajo against a live workspace and WILL FAIL when that table is
-- dropped from the publication. Migrate that test in the same PR as the drop.
