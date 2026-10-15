-- First referencia photo per OT, for the mobile list's thumbnail. A view (not a
-- denormalized column) so photo uploads never touch ordenes_trabajo: its
-- updated_at is the v1 commands' optimistic-concurrency token.
-- Applied to prod via MCP apply_migration (ot_portadas_view), 2026-10-09.
create view public.ot_portadas
with (security_invoker = true) as
select distinct on (g.orden_id)
  g.orden_id,
  i.url
from public.foto_grupos g
join public.foto_grupo_items i on i.grupo_id = g.id
where g.tipo = 'referencia'
order by g.orden_id, g.orden_display, g.created_at, i.orden_display, i.created_at;

revoke all on public.ot_portadas from anon;
grant select on public.ot_portadas to authenticated;
