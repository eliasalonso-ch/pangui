-- Contratos de clientes Empresa: se cobran fuera de Flow (contrato, UF o CLP,
-- normalmente por transferencia). Los edita el superadmin y el owner del
-- workspace los ve en Configuración → Suscripción.
--
-- RLS activo y sin políticas: solo el service role (API) lee y escribe. El
-- cliente nunca consulta estas tablas directo.

create table public.contratos_empresa (
  workspace_id         uuid primary key references public.workspaces(id) on delete cascade,
  precio               numeric(14, 2) check (precio is null or precio >= 0),
  moneda               text not null default 'UF' check (moneda in ('UF', 'CLP')),
  periodicidad         text not null default 'mensual' check (periodicidad in ('mensual', 'anual')),
  forma_pago           text not null default 'transferencia' check (forma_pago in ('transferencia', 'tarjeta', 'otro')),
  usuarios_contratados integer check (usuarios_contratados is null or usuarios_contratados > 0),
  inicio               date,
  fin                  date check (fin is null or inicio is null or fin >= inicio),
  -- Visible para el cliente (condiciones especiales, contacto del ejecutivo…).
  notas                text,
  updated_at           timestamptz not null default now()
);

alter table public.contratos_empresa enable row level security;

-- Datos bancarios de Pangui para transferencias. Una sola fila (id = 1).
create table public.datos_transferencia (
  id                 smallint primary key default 1 check (id = 1),
  titular            text,
  rut                text,
  banco              text,
  tipo_cuenta        text,
  numero_cuenta      text,
  email_comprobantes text,
  updated_at         timestamptz not null default now()
);

alter table public.datos_transferencia enable row level security;
