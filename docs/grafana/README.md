# Dashboards de Grafana

## `pangui-postgres-incidentes.json`

Panels pensados para diagnosticar el tipo de caída del **2026-08-22**: Auth, PostgREST y
Realtime devolviendo 504/500 durante ~90s mientras la base estaba ociosa.

### Importar

1. Grafana → **Dashboards** → **New** → **Import**
2. Pegar el contenido de `pangui-postgres-incidentes.json` (o subir el archivo)
3. En **Postgres**, elegir el data source que ya existe (el mismo de `pangui-postgres`)
4. **Import**

El dashboard usa una variable `${ds}`, así que no hay UIDs de data source hardcodeados: se
puede importar en cualquier Grafana sin editar el JSON.

### Qué mira cada panel

| Panel | Para qué sirve |
|---|---|
| Conexiones por servicio | `max_connections` es **60**. Los pools fijos (PostgREST ~11, Realtime ~7) reservan más de la mitad antes de que Auth pida una. GoTrue abre **bajo demanda**, por eso es el primero en dar 504. |
| Cupo de conexiones libre | Si llega a 0, Auth falla aunque la base esté ociosa. |
| Sesiones esperando (Lock/IO) | En el incidente esto estuvo en **0** — así se descartó que fuera contención de la app. Si sube, el problema **sí** es interno. |
| Transacciones abortadas | `xact_rollback` sube con cada statement timeout. Un escalón vertical marca el minuto exacto de la caída. |
| Slots de replicación | Realtime perdió el slot 19s antes de la segunda caída (`PoolingReplicationError`). `active=0` o `wal_status <> 'reserved'` es la señal. |
| Queries con peor cola | La señal clave: `min < 1ms` pero `max > 1s`. Una query con mínimo 0.02ms **no es lenta, está esperando**. Ratio alto en queries triviales ⇒ el problema es del host. |
| Carga real (% de un CPU) | El 2026-08-22 daba **0.50%** mientras Auth moría. Prueba de que la base no era el cuello de botella. |
| Cache hit ratio | Mientras sea 100%, la lentitud **no** es de I/O (la base entera cabe en RAM). |
| Uptime | Un reinicio borra `pg_stat_statements` y las stats del planner ⇒ hay que correr `ANALYZE`. |

### Limitaciones — leer antes de sacar conclusiones

**No se puede medir el CPU del host desde acá.** Se verificó: no hay extensión
`system_stats` / `pg_proctab` disponible en el proyecto, y `pg_ls_dir` está denegado. Todo lo
que este dashboard muestra es de *adentro* de Postgres. Para CPU del host hace falta el
node exporter de Grafana Cloud (que no aplica a una base gestionada) o el dashboard de
Reports del propio Supabase.

**`pg_stat_activity` es una foto instantánea, no historia.** Los panels que salen de ahí
(conexiones, esperas) sólo capturan un incidente si Grafana justo hace scrape durante los
~90s que dura. Con `refresh: 1m` la probabilidad no es alta. Los que sí sirven después de
los hechos son los acumulados: `pg_stat_statements` (ratio max/mean) y `xact_rollback`.

**`pg_stat_statements` es acumulado desde el último reset**, no una ventana temporal. El
panel de "peor cola" muestra el peor caso histórico, no el de la última hora.

### Rol usado

Corre como `grafana_monitor` (ver `supabase/migrations/20260820120000_grafana_monitoring_role.sql`):
miembro de `pg_monitor`, `CONNECTION LIMIT 5`, sin acceso a datos de la aplicación.
Verificado que puede leer `pg_stat_activity`, `pg_replication_slots`, `pg_stat_database` y
`pg_stat_statements`.

Ojo: ese límite de 5 conexiones sale del mismo presupuesto de 60. Con 4 ya en uso, no
conviene agregar más paneles con queries pesadas ni bajar el `refresh`.
