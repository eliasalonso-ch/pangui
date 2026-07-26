-- Scale hardening pass:
-- - Cover foreign keys that Supabase advisor flagged on hot operational tables.
-- - Pin public function search_path to avoid role-dependent resolution.
-- - Hide trigger-only/security-definer helper functions from direct REST RPC use.

create index if not exists idx_ot_activo_id
  on public.ordenes_trabajo (activo_id);

create index if not exists idx_ot_creado_por
  on public.ordenes_trabajo (creado_por);

create index if not exists idx_ot_inspection_route_item_id
  on public.ordenes_trabajo (inspection_route_item_id);

create index if not exists idx_ot_lugar_id
  on public.ordenes_trabajo (lugar_id);

create index if not exists idx_ot_plantilla_id
  on public.ordenes_trabajo (plantilla_id);

create index if not exists idx_materiales_usados_material_id
  on public.materiales_usados (material_id);

create index if not exists idx_activos_activo_padre_id
  on public.activos (activo_padre_id);

create index if not exists idx_activos_fabricante_id
  on public.activos (fabricante_id);

create index if not exists idx_activos_modelo_id
  on public.activos (modelo_id);

create index if not exists idx_activos_proveedor_id
  on public.activos (proveedor_id);

create index if not exists idx_activos_responsable_id
  on public.activos (responsable_id);

create index if not exists idx_activos_ubicacion_id
  on public.activos (ubicacion_id);

create index if not exists idx_activos_workspace_id
  on public.activos (workspace_id);

create index if not exists idx_actividad_ot_usuario_id
  on public.actividad_ot (usuario_id);

create index if not exists idx_levantamientos_asignado_a
  on public.levantamientos (asignado_a);

create index if not exists idx_levantamientos_creado_por
  on public.levantamientos (creado_por);

create index if not exists idx_levantamientos_orden_id
  on public.levantamientos (orden_id);

create index if not exists idx_levantamientos_sociedad_id
  on public.levantamientos (sociedad_id);

create index if not exists idx_levantamientos_ubicacion_id
  on public.levantamientos (ubicacion_id);

create index if not exists idx_export_schedules_created_by
  on public.export_schedules (created_by);

create index if not exists idx_subscription_events_subscription_id
  on public.subscription_events (subscription_id);

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('alter function %s set search_path = public, extensions', fn.signature);
  end loop;
end $$;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.notify_users(uuid[], text, text, text, text) from anon, authenticated;
revoke execute on function public.trigger_notify_assignment() from anon, authenticated;
revoke execute on function public.trigger_notify_comment() from anon, authenticated;
revoke execute on function public.trigger_notify_completion() from anon, authenticated;
