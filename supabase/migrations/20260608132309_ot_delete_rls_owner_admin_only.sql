-- Permanent delete (purge from trash) restricted to owner/admin only.
-- Soft-delete (sending to trash) goes through the UPDATE policy, which already
-- allows owner/admin/member.
DROP POLICY IF EXISTS ordenes_delete ON ordenes_trabajo;

CREATE POLICY ordenes_delete ON ordenes_trabajo
  FOR DELETE
  USING (
    workspace_id = my_workspace_id()
    AND (
      SELECT rol FROM usuarios WHERE id = (SELECT auth.uid()) LIMIT 1
    ) = ANY (ARRAY['owner','admin'])
  );;
