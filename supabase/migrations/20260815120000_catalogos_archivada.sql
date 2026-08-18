-- Archivado de catálogos: categorías de OT e ITOs.
--
-- Por qué existe: `ordenes_trabajo.categoria_id` referencia a `categorias_ot`
-- con ON DELETE SET NULL, así que borrar una categoría se la quita a todas las
-- OTs que la usaban. Se necesita lo contrario: sacarla del selector sin tocar el
-- historial. Se agrega una bandera de archivado, el mismo patrón que ya usan
-- `ubicaciones.activa` y `procedimientos.activo`.
--
-- Aditiva y idempotente: columna nueva con default, sin NOT NULL sobre datos
-- existentes, sin DROP. Las apps que todavía no la conocen siguen funcionando
-- porque el default deja todo como está hoy (nada archivado).

alter table public.categorias_ot
  add column if not exists archivada boolean not null default false;

alter table public.hitos
  add column if not exists archivada boolean not null default false;

-- Los listados filtran por `archivada = false`; el índice parcial evita
-- recorrer las archivadas en cada consulta del catálogo.
create index if not exists categorias_ot_workspace_activas_idx
  on public.categorias_ot (workspace_id)
  where archivada = false;

create index if not exists hitos_workspace_activos_idx
  on public.hitos (workspace_id)
  where archivada = false;

comment on column public.categorias_ot.archivada is
  'Oculta la categoría del selector y del catálogo sin borrar la fila, para que las OTs que la usan conserven su categoría.';

comment on column public.hitos.archivada is
  'Oculta el ITO del selector y del catálogo sin borrar la fila.';
