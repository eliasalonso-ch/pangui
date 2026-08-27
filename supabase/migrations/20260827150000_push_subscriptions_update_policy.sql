-- push_subscriptions: add the missing UPDATE policy.
--
-- The table had SELECT / INSERT / DELETE policies but no UPDATE one. Enabling
-- push from the web calls savePushSubscription(), which upserts with
-- on_conflict=usuario_id — and the table carries UNIQUE (usuario_id), so a user
-- who had ever subscribed before hits the conflict path. Postgres then executes
-- the upsert as an UPDATE, finds no policy permitting it, and PostgREST returns
-- 403. Result: push worked on a browser exactly once per user, and every later
-- attempt (new browser, re-enable after disabling, endpoint rotation) failed
-- with "No se concedió el permiso de notificaciones" even though the browser
-- had granted permission.
--
-- USING and WITH CHECK are both required and both scoped to the caller: USING
-- decides which existing row may be updated, WITH CHECK validates the result.
-- Without WITH CHECK a user could reassign their row's usuario_id to someone
-- else and hijack that person's push endpoint.
--
-- auth.uid() is wrapped in a scalar subquery so the planner evaluates it once
-- per statement rather than once per row (initplan), matching the existing
-- policies on this table.

CREATE POLICY "update own"
  ON public.push_subscriptions
  FOR UPDATE
  USING ((SELECT auth.uid()) = usuario_id)
  WITH CHECK ((SELECT auth.uid()) = usuario_id);
