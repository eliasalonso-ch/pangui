-- Enforce `solo_asignadas` in RLS instead of only in the clients.
--
-- `ordenes_select` was `workspace_id = my_workspace_id()` and nothing else. The
-- assigned-only restriction lived in app code: web applies it via
-- aplicarVisibilidad() in lib/ordenes-api.ts, and mobile does not apply it at
-- all. Any member could read every OT in the workspace with their own token
-- straight from PostgREST.
--
-- All 8 `member` rows in the workspace have solo_asignadas = true, so this is
-- the live configuration for every field tech, not an edge case.
--
-- Behaviour after this migration: a member with the flag sees ONLY the OTs they
-- are assigned to. Unassigned OTs (69 at time of writing) are NOT visible to
-- them — the "Sin asignar" bucket reads 0 for members by design.
--
-- Sub-OTs inherit their parent's assignment check independently; a sub-OT the
-- member is assigned to stays visible even when the parent is not.

CREATE OR REPLACE FUNCTION public.solo_asignadas_para_mi()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT coalesce(
    (SELECT solo_asignadas FROM public.usuarios WHERE id = (SELECT auth.uid()) LIMIT 1),
    false
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.solo_asignadas_para_mi() FROM anon;

DROP POLICY IF EXISTS ordenes_select ON public.ordenes_trabajo;

CREATE POLICY ordenes_select ON public.ordenes_trabajo
FOR SELECT
USING (
  workspace_id = public.my_workspace_id()
  AND (
    NOT public.solo_asignadas_para_mi()
    OR (SELECT auth.uid()) = ANY (coalesce(asignados_ids, '{}'::uuid[]))
  )
);
