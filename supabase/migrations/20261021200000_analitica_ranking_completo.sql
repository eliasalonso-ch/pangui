-- Analítica de activos: el ranking trae TODOS los activos del filtro con
-- historial en la ventana, no el top 10 con paradas. La tabla "Activos más
-- problemáticos" pasó a ser un Data Table (buscar, ordenar, paginar en el
-- cliente). Es una fila por activo con números agregados: con miles de activos
-- sigue siendo una respuesta chica. Resto sin cambios respecto de 20261021160000.

create or replace function public.analitica_activos(
  p_desde       date,
  p_hasta       date,
  p_grano       text default 'mes',            -- 'dia' | 'semana' | 'mes'
  p_tz          text default 'America/Santiago',
  -- Filtros de selección múltiple (como en /ordenes). null = sin filtro.
  p_criticidades text[] default null,
  p_modelos      uuid[] default null,
  p_activos      uuid[] default null,
  p_ubicaciones  uuid[] default null,
  p_sociedades   uuid[] default null,
  p_responsables uuid[] default null
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
      and (p_criticidades is null or coalesce(a.criticidad, 'no_critico') = any(p_criticidades))
      and (p_modelos      is null or a.modelo_id      = any(p_modelos))
      and (p_activos      is null or a.id             = any(p_activos))
      and (p_ubicaciones  is null or a.ubicacion_id   = any(p_ubicaciones))
      and (p_sociedades   is null or a.sociedad_id    = any(p_sociedades))
      and (p_responsables is null or a.responsable_id = any(p_responsables))
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
  -- Historial desde 90 días antes de la ventana (lo pide la media móvil) y sin
  -- tope superior: una falla que empieza dentro de la ventana termina cuando el
  -- activo vuelve a operar, aunque eso pase después. `racha` agrupa cada
  -- detención con los períodos que la siguen hasta el próximo operativo.
  hist as (
    select p.activo_id, p.estado, p.tipo_inactividad, p.inicio, p.fin, p.motivo_id,
      sum((p.estado = 'operativo')::int) over (partition by p.activo_id order by p.inicio) as racha
    from act
    join activo_estado_periodos p on p.activo_id = act.id
    cross join lim
    where p.estado <> 'baja'
      and coalesce(p.fin, 'infinity'::timestamptz) > lim.ini - interval '90 days'
  ),
  -- Una falla por racha con algo sin planear. `fin` = vuelta a operar; null =
  -- sigue detenido.
  eventos as (
    select activo_id,
      min(inicio) filter (where tipo_inactividad = 'sin_planear') as inicio,
      case when bool_and(fin is not null) then max(fin) end         as fin,
      -- El motivo de la falla es el de su primer tramo sin planear.
      (array_agg(motivo_id order by inicio) filter (where tipo_inactividad = 'sin_planear'))[1] as motivo_id
    from hist
    where estado <> 'operativo'
    group by activo_id, racha
    having bool_or(tipo_inactividad = 'sin_planear')
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
  --
  -- Acotadas a la ventana ACÁ y no después: sin esto se leían todas las OTs de
  -- la historia de cada activo en cada consulta, y ese costo crecía año a año
  -- aunque el rango fuera de un mes. No cambia ningún número: para una OT con
  -- `hecho`, `sello` es el mismo valor, y los dos usos (serie y costo) ya
  -- descartaban lo que caía fuera de la ventana.
  ots as (
    select
      o.activo_id, o.tipo_trabajo, o.estado, o.costo_total,
      coalesce(o.completado_en, o.iniciado_at)                                         as hecho
    from act
    join ordenes_trabajo o on o.activo_id = act.id
    cross join lim
    where o.deleted_at is null
      and coalesce(o.completado_en, o.iniciado_at, (o.fecha_termino::timestamp at time zone p_tz))
          >= lim.ini
      and coalesce(o.completado_en, o.iniciado_at, (o.fecha_termino::timestamp at time zone p_tz))
          < lim.fin_calendario
  ),
  serie as (
    select
      t.clave,
      coalesce(sum(extract(epoch from least(per.c_fin, t.t_fin) - greatest(per.c_ini, t.t_ini)))
               filter (where per.clase = 'op'), 0) / 3600.0   as operativo_h,
      coalesce(sum(extract(epoch from least(per.c_fin, t.t_fin) - greatest(per.c_ini, t.t_ini)))
               filter (where per.clase = 'imp'), 0) / 3600.0  as imprevista_h,
      coalesce(sum(extract(epoch from least(per.c_fin, t.t_fin) - greatest(per.c_ini, t.t_ini)))
               filter (where per.clase = 'plan'), 0) / 3600.0 as planificada_h
    from tramos t
    left join per on per.c_ini < t.t_fin and per.c_fin > t.t_ini
    group by t.clave
  ),
  -- Fallas que empezaron en el tramo, y las de los 90 días que terminan en su
  -- borde derecho (media móvil). Para el MTTR móvil solo cuentan las que ya
  -- estaban restauradas en ese momento. Un tramo dura a lo más un mes, así que
  -- la condición del join cubre los dos casos.
  serie_fallas as (
    select
      t.clave,
      count(e.*) filter (where e.inicio >= t.t_ini)                               as fallas,
      count(e.*) filter (where e.inicio >= t.t_ini and e.fin is not null)         as reparadas,
      coalesce(sum(extract(epoch from e.fin - e.inicio))
               filter (where e.inicio >= t.t_ini and e.fin is not null), 0) / 3600.0 as restauracion_h,
      count(e.*)                                                                  as fallas_movil,
      count(e.*) filter (where e.fin <= t.t_fin)                                  as reparadas_movil,
      coalesce(sum(extract(epoch from e.fin - e.inicio))
               filter (where e.fin <= t.t_fin), 0) / 3600.0                       as restauracion_movil_h
    from tramos t
    left join eventos e on e.inicio >= t.t_fin - interval '90 days' and e.inicio < t.t_fin
    group by t.clave
  ),
  serie_op_movil as (
    select
      t.clave,
      coalesce(sum(extract(epoch from
        least(coalesce(h.fin, now()), t.t_fin) - greatest(h.inicio, t.t_fin - interval '90 days'))), 0) / 3600.0
        as op_movil_h
    from tramos t
    left join hist h
      on h.estado = 'operativo'
     and h.inicio < t.t_fin
     and coalesce(h.fin, now()) > t.t_fin - interval '90 days'
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
      (select count(*) from eventos e
        where e.activo_id = act.id and e.inicio >= (select ini from lim) and e.inicio < (select fin from lim)) as fallas,
      (select count(*) from eventos e
        where e.activo_id = act.id and e.inicio >= (select ini from lim) and e.inicio < (select fin from lim)
          and e.fin is not null)                                                                            as reparadas,
      coalesce((select sum(extract(epoch from e.fin - e.inicio)) from eventos e
        where e.activo_id = act.id and e.inicio >= (select ini from lim) and e.inicio < (select fin from lim)
          and e.fin is not null), 0) / 3600.0                                                               as restauracion_h
    from act
    join per on per.activo_id = act.id
    group by act.id, act.nombre, act.criticidad
  ),
  ranking as (
    select pa.*,
      (select sum(o.costo_total) from ots o
        where o.activo_id = pa.id and o.costo_total is not null) as costo
    -- Todos los activos del filtro con historial en la ventana (antes: top 10
    -- con alguna parada). La tabla de la analítica los busca, ordena y pagina.
    from por_activo pa
    order by pa.imprevista_h desc, pa.fallas desc
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
        'planificada_h', s.planificada_h, 'fallas', sf.fallas,
        'reparadas', sf.reparadas, 'restauracion_h', sf.restauracion_h,
        'op_movil_h', om.op_movil_h, 'fallas_movil', sf.fallas_movil,
        'reparadas_movil', sf.reparadas_movil, 'restauracion_movil_h', sf.restauracion_movil_h,
        'preventivas', so.preventivas, 'correctivas', so.correctivas
      ) order by s.clave)
      from serie s
      join serie_ots so using (clave)
      join serie_fallas sf using (clave)
      join serie_op_movil om using (clave)
    ), '[]'::jsonb),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nombre', r.nombre, 'criticidad', r.criticidad,
        'operativo_h', r.operativo_h, 'imprevista_h', r.imprevista_h,
        'planificada_h', r.planificada_h, 'fallas', r.fallas,
        'reparadas', r.reparadas, 'restauracion_h', r.restauracion_h, 'costo', r.costo
      ) order by r.imprevista_h desc, r.fallas desc)
      from ranking r
    ), '[]'::jsonb),
    -- Las fallas del rango, para marcarlas en la tendencia de MTBF/MTTR con su
    -- motivo y duración. Las 300 más recientes: con más, las marcas ya no se
    -- leen una por una y el gráfico las agrupa por tramo igual.
    'eventos_falla', coalesce((
      select jsonb_agg(x order by x->>'inicio')
      from (
        select jsonb_build_object(
          'inicio', e.inicio, 'fin', e.fin, 'activo', a.nombre, 'motivo', m.nombre,
          'horas', case when e.fin is not null then extract(epoch from e.fin - e.inicio) / 3600.0 end
        ) as x
        from eventos e
        join act a on a.id = e.activo_id
        left join motivos_inactividad m on m.id = e.motivo_id
        cross join lim
        where e.inicio >= lim.ini and e.inicio < lim.fin
        order by e.inicio desc
        limit 300
      ) z
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
