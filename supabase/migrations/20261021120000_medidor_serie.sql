-- Serie de un medidor lista para graficar.
--
-- Los gráficos pedían las lecturas crudas de toda la ventana. Con carga manual
-- son decenas, pero un equipo que publica por /api/medidores/lecturas cada
-- minuto deja ~525 mil filas al año: el gráfico de 1A bajaba todo eso, y
-- PostgREST además corta en `max-rows` (1000) sin avisar, así que la línea
-- quedaba truncada en silencio.
--
-- Si la ventana trae pocas lecturas (<= p_puntos) se devuelven tal cual. Si no,
-- se agrupan en p_puntos tramos parejos (date_bin) con promedio, mínimo y
-- máximo: el promedio dibuja la línea y el mín/máx conserva los picos, que en
-- un medidor son justamente lo que importa (cruces de umbral). Agregar en el
-- servidor es la práctica estándar para series de tiempo (time_bucket en
-- Timescale, LTTB en ClickHouse); un gráfico de ~600 px no muestra más de unos
-- cientos de puntos.
--
-- ponytail: agrega al vuelo sobre idx_medidor_lecturas_serie. Si un medidor
-- llega a millones de filas por año y esto se nota, pasar a una tabla de
-- resumen horaria mantenida por trigger o pg_cron.

create or replace function public.medidor_serie(
  p_medidor_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz,
  p_puntos     int default 400
)
returns table (
  ts         timestamptz,
  valor      numeric,   -- la lectura, o el promedio del tramo
  valor_min  numeric,
  valor_max  numeric,
  n          int,       -- 1 = lectura cruda; >1 = tramo agregado
  id         uuid,      -- solo en lecturas crudas
  creado_por uuid       -- solo en lecturas crudas (null = dispositivo)
)
language sql
stable
security invoker   -- la RLS de medidor_lecturas decide qué se ve
set search_path = public
as $$
  with
  lim as (
    -- Tope de puntos: nadie necesita más y protege de un p_puntos absurdo.
    select least(greatest(p_puntos, 10), 2000) as puntos
  ),
  v as (
    select l.id, l.ts, l.valor, l.creado_por
    from medidor_lecturas l
    where l.medidor_id = p_medidor_id
      and l.ts >= p_desde
      and l.ts <= p_hasta
  ),
  total as (select count(*) as c from v),
  paso as (
    select greatest((p_hasta - p_desde) / lim.puntos, interval '1 second') as s from lim
  )
  select v.ts, v.valor, v.valor, v.valor, 1, v.id, v.creado_por
  from v, total, lim
  where total.c <= lim.puntos
  union all
  -- Al centro del tramo (sin pasarse del borde derecho de la ventana).
  select least(date_bin(paso.s, v.ts, p_desde) + paso.s / 2, p_hasta),
         avg(v.valor), min(v.valor), max(v.valor), count(*)::int, null::uuid, null::uuid
  from v, total, lim, paso
  where total.c > lim.puntos
  group by date_bin(paso.s, v.ts, p_desde), paso.s
  order by 1;
$$;

revoke execute on function public.medidor_serie(uuid, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.medidor_serie(uuid, timestamptz, timestamptz, int) to authenticated;
