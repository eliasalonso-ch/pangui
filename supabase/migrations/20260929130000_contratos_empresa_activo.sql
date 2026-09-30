-- Estado del contrato Empresa, lo cambia el superadmin. Solo informa al
-- cliente (pill en Suscripción); no bloquea el acceso al plan.
alter table public.contratos_empresa
  add column activo boolean not null default true;
