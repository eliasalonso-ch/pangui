-- Analítica de activos agregada en la base.
--
-- La página bajaba al navegador TODOS los activos, TODAS las OTs con activo
-- (sin límite de fecha) y 400 días de períodos de estado, y calculaba en JS.
-- Con un cliente grande eso fallaba dos veces: PostgREST corta en 1000 filas
-- (métricas calculadas sobre una parte de los datos, sin aviso) y el egress y
-- el cálculo crecían con la historia completa.
--
-- Ahora la base devuelve solo los agregados: la respuesta crece con la
-- cantidad de puntos del gráfico, no con la historia. Las proporciones
-- (disponibilidad, MTBF, MTTR) se siguen derivando en TS desde estas sumas
-- (lib/activo-disponibilidad.ts), para que "sin datos" siga siendo null y no 0.
--
-- SECURITY INVOKER: corre con el RLS del usuario (workspace_id =
-- my_workspace_id()), igual que las consultas directas que reemplaza. El filtro
-- explícito por workspace está para que el planner use los índices.

-- Opciones de los filtros: salen de los activos vigentes, no de las tablas
-- completas (un cliente sin activos dejaría un filtro que siempre da vacío).
create or replace function public.analitica_activos_opciones()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with act as (
    select a.id, a.nombre, a.ubicacion_id, a.modelo_id, a.sociedad_id, a.responsable_id
    from activos a
    where a.workspace_id = my_workspace_id() and a.activo = true
  )
  select jsonb_build_object(
    'activos', coalesce((
      select jsonb_agg(jsonb_build_object('value', id, 'label', nombre) order by nombre) from act
    ), '[]'::jsonb),
    'ubicaciones', coalesce((
      select jsonb_agg(jsonb_build_object('value', u.id, 'label', u.edificio) order by u.edificio)
      from ubicaciones u where u.id in (select ubicacion_id from act)
    ), '[]'::jsonb),
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object('value', m.id, 'label', m.nombre) order by m.nombre)
      from modelos m where m.id in (select modelo_id from act)
    ), '[]'::jsonb),
    'sociedades', coalesce((
      select jsonb_agg(jsonb_build_object('value', s.id, 'label', s.nombre) order by s.nombre)
      from sociedades s where s.id in (select sociedad_id from act)
    ), '[]'::jsonb),
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object('value', u.id, 'label', u.nombre) order by u.nombre)
      from usuarios u where u.id in (select responsable_id from act)
    ), '[]'::jsonb)
  );
$$;

-- El informe completo para [p_desde, p_hasta] (días inclusive, en p_tz).
--
-- Reglas que vienen de la versión en JS y no pueden cambiar:
--  * Cada período se RECORTA a la ventana y a cada tramo del gráfico: una
--    parada que cruza de un mes a otro aporta sus horas a cada uno.
--  * Un período abierto cuenta hasta now(). `baja` (activo retirado) no entra.
--  * operativo → uptime; resto: 'planeado' → planificada, si no → imprevista.
--  * Una falla = parada sin_planear, contada donde EMPIEZA.
--  * En el costo, las paradas que se solapan (la jerarquía propaga la
--    detención: motor, máquina y línea quedan detenidos a la vez) son UN
--    evento, cobrado a la tarifa más alta de los involucrados.
create or replace function public.analitica_activos(
  p_desde       date,
  p_hasta       date,
  p_grano       text default 'mes',            -- 'dia' | 'semana' | 'mes'
  p_tz          text default 'America/Santiago',
  p_criticidad  text default null,
  p_modelo      uuid default null,
  p_activo      uuid default null,
  p_ubicacion   uuid default null,
  p_sociedad    uuid default null,
  p_responsable uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
  lim as (
    select
      (p_desde::timestamp at time zone p_tz)                    as ini,
      -- Fin de la ventana: el día siguiente a p_hasta, pero nunca después de
      -- ahora (las horas futuras no existen todavía).
      least(((p_hasta + 1)::timestamp at time zone p_tz), now()) as fin,
      ((p_hasta + 1)::timestamp at time zone p_tz)              as fin_calendario,
      case p_grano when 'dia' then 'day' when 'semana' then 'week' else 'month' end as unidad
  ),
  act as (
    select a.id, a.nombre, a.criticidad, a.estado, a.costo_hora_parada
    from activos a
    where a.workspace_id = my_workspace_id()
      and a.activo = true
      and (p_criticidad  is null or coalesce(a.criticidad, 'no_critico') = p_criticidad)
      and (p_modelo      is null or a.modelo_id      = p_modelo)
      and (p_activo      is null or a.id             = p_activo)
      and (p_ubicacion   is null or a.ubicacion_id   = p_ubicacion)
      and (p_sociedad    is null or a.sociedad_id    = p_sociedad)
      and (p_responsable is null or a.responsable_id = p_responsable)
  ),
  -- Períodos que tocan la ventana, ya recortados a ella. El predicado && sobre
  -- (activo_id, tstzrange) usa el índice gist activo_estado_periodos_sin_solape.
  per as (
    select
      p.activo_id, p.tipo_inactividad, p.inicio, p.motivo_id,
      case
        when p.estado = 'operativo' then 'op'
        when p.tipo_inactividad = 'planeado' then 'plan'
        else 'imp'
      end as clase,
      greatest(p.inicio, lim.ini)                  as c_ini,
      least(coalesce(p.fin, now()), lim.fin)       as c_fin
    from act
    join activo_estado_periodos p on p.activo_id = act.id
    cross join lim
    where tstzrange(p.inicio, coalesce(p.fin, 'infinity'::timestamptz), '[)')
          && tstzrange(lim.ini, lim.fin, '[)')
      and p.estado <> 'baja'
  ),
  -- Tramos del gráfico en hora local; el primero y el último se recortan a la
  -- ventana (un rango que empieza un miércoles no cuenta el lunes y martes).
  tramos as (
    select
      to_char(greatest(g, p_desde::timestamp), 'YYYY-MM-DD') as clave,
      greatest(g at time zone p_tz, lim.ini)                                       as t_ini,
      least((g + ('1 ' || lim.unidad)::interval) at time zone p_tz, lim.fin)      as t_fin
    from lim,
      generate_series(
        date_trunc(lim.unidad, p_desde::timestamp),
        p_hasta::timestamp,
        ('1 ' || lim.unidad)::interval
      ) g
  ),
  -- OTs de los activos filtrados, fechadas igual que activo-metrics.ts:
  -- `hecho` para el trabajo completado, `sello` para ubicarlas en la ventana.
  ots as (
    select
      o.activo_id, o.tipo_trabajo, o.estado, o.costo_total,
      coalesce(o.completado_en, o.iniciado_at)                                         as hecho,
      coalesce(o.completado_en, o.iniciado_at,
               (o.fecha_termino::timestamp at time zone p_tz))                          as sello
    from act
    join ordenes_trabajo o on o.activo_id = act.id
    where o.deleted_at is null
  ),
  serie as (
    select
      t.clave,
      coalesce(sum(extract(epoch from least(per.c_fin, t.t_fin) - greatest(per.c_ini, t.t_ini)))
               filter (where per.clase = 'op'), 0) / 3600.0   as operativo_h,
      coalesce(sum(extract(epoch from least(per.c_fin, t.t_fin) - greatest(per.c_ini, t.t_ini)))
               filter (where per.clase = 'imp'), 0) / 3600.0  as imprevista_h,
      coalesce(sum(extract(epoch from least(per.c_fin, t.t_fin) - greatest(per.c_ini, t.t_ini)))
               filter (where per.clase = 'plan'), 0) / 3600.0 as planificada_h,
      count(*) filter (where per.clase = 'imp' and per.tipo_inactividad = 'sin_planear'
                         and per.inicio >= t.t_ini and per.inicio < t.t_fin)  as fallas
    from tramos t
    left join per on per.c_ini < t.t_fin and per.c_fin > t.t_ini
    group by t.clave
  ),
  serie_ots as (
    select
      t.clave,
      count(o.*) filter (where o.tipo_trabajo = 'preventiva')                    as preventivas,
      count(o.*) filter (where o.tipo_trabajo in ('reactiva', 'emergencia'))     as correctivas
    from tramos t
    left join ots o
      on o.estado = 'completado'
     and o.hecho >= t.t_ini and o.hecho < t.t_fin
    group by t.clave
  ),
  por_activo as (
    select
      act.id, act.nombre, act.criticidad,
      coalesce(sum(extract(epoch from per.c_fin - per.c_ini)) filter (where per.clase = 'op'), 0) / 3600.0   as operativo_h,
      coalesce(sum(extract(epoch from per.c_fin - per.c_ini)) filter (where per.clase = 'imp'), 0) / 3600.0  as imprevista_h,
      coalesce(sum(extract(epoch from per.c_fin - per.c_ini)) filter (where per.clase = 'plan'), 0) / 3600.0 as planificada_h,
      count(per.*) filter (where per.clase = 'imp' and per.tipo_inactividad = 'sin_planear'
                             and per.inicio >= (select ini from lim))                                         as fallas
    from act
    join per on per.activo_id = act.id
    group by act.id, act.nombre, act.criticidad
  ),
  ranking as (
    select pa.*,
      (select sum(o.costo_total) from ots o, lim
        where o.activo_id = pa.id and o.costo_total is not null
          and o.sello >= lim.ini and o.sello < lim.fin_calendario) as costo
    from por_activo pa
    where pa.fallas > 0 or pa.imprevista_h > 0
    order by pa.imprevista_h desc, pa.fallas desc
    limit 10
  ),
  pareto as (
    select
      coalesce(m.nombre, 'Sin clasificar') as motivo,
      count(*)                             as eventos,
      sum(extract(epoch from per.c_fin - per.c_ini)) / 3600.0 as horas
    from per
    left join motivos_inactividad m on m.id = per.motivo_id
    where per.clase = 'imp' and per.tipo_inactividad = 'sin_planear'
      and per.inicio >= (select ini from lim)
    group by 1
  ),
  -- Costo de las paradas: islas de períodos solapados del mismo tipo.
  paradas as (
    select per.c_ini, per.c_fin, (per.clase = 'plan') as planeado, act.costo_hora_parada as tarifa
    from per join act on act.id = per.activo_id
    where per.clase in ('plan', 'imp') and per.c_fin > per.c_ini
  ),
  con_tarifa as (
    select *,
      -- Empieza una isla nueva cuando no se solapa con nada de lo anterior.
      case when c_ini < max(c_fin) over (
             partition by planeado order by c_ini, c_fin
             rows between unbounded preceding and 1 preceding)
           then 0 else 1 end as nueva
    from paradas where tarifa is not null
  ),
  islas as (
    select planeado,
      extract(epoch from max(c_fin) - min(c_ini)) / 3600.0 * max(tarifa) as monto
    from (select *, sum(nueva) over (partition by planeado order by c_ini, c_fin) as isla from con_tarifa) x
    group by planeado, isla
  )
  select jsonb_build_object(
    'activos_total', (select count(*) from act),
    'estado', jsonb_build_object(
      'operativo',      (select count(*) from act where coalesce(estado, 'operativo') = 'operativo'),
      'mantencion',     (select count(*) from act where estado = 'mantencion'),
      'fuera_servicio', (select count(*) from act where estado = 'fuera_servicio'),
      'baja',           (select count(*) from act where estado = 'baja')
    ),
    'criticidad', jsonb_build_object(
      'critico',      (select count(*) from act where criticidad = 'critico'),
      'semi_critico', (select count(*) from act where criticidad = 'semi_critico'),
      'no_critico',   (select count(*) from act where coalesce(criticidad, 'no_critico') = 'no_critico')
    ),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clave', s.clave,
        'operativo_h', s.operativo_h, 'imprevista_h', s.imprevista_h,
        'planificada_h', s.planificada_h, 'fallas', s.fallas,
        'preventivas', so.preventivas, 'correctivas', so.correctivas
      ) order by s.clave)
      from serie s join serie_ots so using (clave)
    ), '[]'::jsonb),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nombre', r.nombre, 'criticidad', r.criticidad,
        'operativo_h', r.operativo_h, 'imprevista_h', r.imprevista_h,
        'planificada_h', r.planificada_h, 'fallas', r.fallas, 'costo', r.costo
      ) order by r.imprevista_h desc, r.fallas desc)
      from ranking r
    ), '[]'::jsonb),
    'pareto', coalesce((
      select jsonb_agg(jsonb_build_object('motivo', motivo, 'eventos', eventos, 'horas', horas)
                       order by eventos desc, horas desc)
      from pareto
    ), '[]'::jsonb),
    'costo_paradas', jsonb_build_object(
      'imprevisto',       coalesce((select sum(monto) from islas where not planeado), 0),
      'planificado',      coalesce((select sum(monto) from islas where planeado), 0),
      'horas_sin_tarifa', coalesce((select sum(extract(epoch from c_fin - c_ini)) / 3600.0
                                      from paradas where tarifa is null), 0),
      'con_tarifa',       (select count(*) from act where costo_hora_parada is not null)
    )
  );
$$;

-- Solo usuarios con sesión: anon no tiene nada que hacer acá.
revoke all on function public.analitica_activos_opciones() from public, anon;
revoke all on function public.analitica_activos(date, date, text, text, text, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.analitica_activos_opciones() to authenticated;
grant execute on function public.analitica_activos(date, date, text, text, text, uuid, uuid, uuid, uuid, uuid) to authenticated;
