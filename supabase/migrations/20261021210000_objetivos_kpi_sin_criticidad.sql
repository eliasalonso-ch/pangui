-- objetivos_kpi: una meta por KPI para todo el workspace (como MaintainX).
--
-- En prod se aplicó una versión intermedia de 20261021180000 que todavía tenía
-- metas por criticidad (columna `criticidad` y único por workspace+kpi+criticidad).
-- El cliente guarda con on_conflict (workspace_id, kpi), que necesita ese único
-- exacto. Idempotente: deja la tabla igual a la versión final de 20261021180000
-- venga de la versión que venga. La tabla estaba vacía al aplicarlo.

alter table public.objetivos_kpi drop constraint if exists objetivos_kpi_uno;
alter table public.objetivos_kpi drop column if exists criticidad;
alter table public.objetivos_kpi add constraint objetivos_kpi_uno unique (workspace_id, kpi);
