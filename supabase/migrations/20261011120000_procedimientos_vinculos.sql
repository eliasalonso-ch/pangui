-- Procedimientos vinculados a categorías de OT, activos y ubicaciones (como las
-- etiquetas de MaintainX). Un procedimiento puede cubrir varios de cada uno.
--
-- Arreglos en la misma fila y no tablas puente: heredan la RLS de procedimientos
-- (editar = admin/owner o quien lo creó) sin políticas nuevas, y se guardan con el
-- mismo update que el resto del procedimiento. Sin FK: un id de algo borrado
-- simplemente no resuelve al leer; quien escribe filtra contra el catálogo.
--
-- Default constante: en PG17 el ADD COLUMN es solo metadata, no reescribe la tabla.
-- ponytail: sin índices GIN (80 filas en total). Agregar
-- `using gin (activo_ids)` etc. cuando se filtre por `@>` en un catálogo grande.
--
-- La columna de texto libre `categoria` queda tal cual (8 filas la usan).

alter table public.procedimientos
  add column if not exists categoria_ids uuid[] not null default '{}',
  add column if not exists activo_ids    uuid[] not null default '{}',
  add column if not exists ubicacion_ids uuid[] not null default '{}';
