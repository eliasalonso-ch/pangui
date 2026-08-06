-- Role-check cleanups and SECURITY DEFINER hardening.

-- 1. usuarios_delete required 'admin', so an owner could not deactivate a user
--    even though owner outranks admin everywhere else in the taxonomy.
DROP POLICY IF EXISTS usuarios_delete ON public.usuarios;
CREATE POLICY usuarios_delete ON public.usuarios
FOR DELETE
USING (
  workspace_id = public.my_workspace_id()
  AND id <> (SELECT auth.uid())
  AND public.fn_mi_rol() = ANY (ARRAY['owner','admin'])
);

-- 2. usuarios_update accepted 'supervisor', which is not in the role taxonomy
--    (owner/admin/member/requester). Dead branch, removed.
DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
CREATE POLICY usuarios_update ON public.usuarios
FOR UPDATE
USING (
  id = (SELECT auth.uid())
  OR (
    workspace_id = public.my_workspace_id()
    AND public.fn_mi_rol() = ANY (ARRAY['owner','admin'])
  )
);

-- 3. SECURITY DEFINER with a mutable search_path: a caller able to set
--    search_path could shadow an unqualified name and have it resolve inside a
--    definer-rights context. Pin it.
ALTER FUNCTION public.fn_log_actividad_activo() SET search_path TO 'public', 'extensions';

-- 4. Revoke anon EXECUTE on SECURITY DEFINER functions. They run with the
--    owner's rights and bypass RLS by design. The sensitive ones
--    (set_solo_asignadas, deactivate_usuario) already fail closed for anon —
--    auth.uid() is NULL so their internal role check raises — but relying on
--    every function to re-check is the pattern that breaks the day someone adds
--    one that forgets.
--
--    No unauthenticated flow calls an RPC: the mobile force-update gate reads
--    app_config over plain PostgREST (hooks/use-force-update.ts), not rpc().
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.sig);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
