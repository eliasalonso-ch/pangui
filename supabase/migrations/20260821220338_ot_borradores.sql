-- Borradores del formulario de creacion de OT.
--
-- Por que una tabla aparte y no `status = 'draft'` en ordenes_trabajo:
-- ordenes_trabajo dispara triggers (recurrencia al completar), consume
-- numeracion n_ot y tiene RLS por workspace/rol. Meter filas a medio llenar
-- ahi gastaria numeros de OT y podria disparar logica de negocio sobre algo
-- que el usuario todavia no creo.
--
-- Solo se guarda el texto del formulario. Las fotos son objetos File del
-- navegador, no serializables, y no se persisten aqui.

create table if not exists public.ot_borradores (
  user_id      uuid not null references public.usuarios(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  actualizado_at timestamptz not null default now(),
  -- Un borrador por usuario y workspace: el formulario de creacion es una
  -- sola pantalla, no hay varios en paralelo. La PK compuesta es tambien el
  -- indice que sirve al upsert y al fetch inicial.
  primary key (user_id, workspace_id),
  constraint ot_borradores_payload_es_objeto check (jsonb_typeof(payload) = 'object'),
  -- Techo defensivo: el payload es texto de formulario, no debe crecer.
  constraint ot_borradores_payload_tamano check (pg_column_size(payload) <= 65536)
);

comment on table public.ot_borradores is
  'Borrador del formulario de creacion de OT, uno por usuario y workspace. Solo texto/ids: las fotos (File) no son serializables y no se guardan aqui.';

-- Postgres no indexa las FK automaticamente. user_id ya va de primero en la
-- PK; workspace_id necesita el suyo para que el ON DELETE CASCADE del
-- workspace no haga un seq scan.
create index if not exists ot_borradores_workspace_id_idx
  on public.ot_borradores (workspace_id);

alter table public.ot_borradores enable row level security;

-- (select auth.uid()) envuelto en subquery: se evalua una vez por query en
-- vez de una vez por fila (mismo patron que 20260806150000_rls_initplan_auth_uid).
create policy ot_borradores_select on public.ot_borradores
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ot_borradores_insert on public.ot_borradores
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- El autosave hace upsert. Un upsert que cae en la rama UPDATE necesita
-- ademas la policy de SELECT de arriba: sin ella el update no falla, devuelve
-- 0 filas en silencio.
create policy ot_borradores_update on public.ot_borradores
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ot_borradores_delete on public.ot_borradores
  for delete to authenticated
  using (user_id = (select auth.uid()));
