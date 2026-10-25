-- Analítica de activos: dos filtros nuevos.
--   p_estados: estado ACTUAL del activo (operativo, mantención, fuera de
--     servicio). Reemplaza en la web al filtro "Tipo de activo", que no se usa
--     todavía.
--   p_motivos: razón de inactividad. Deja los activos que tuvieron al menos una
--     parada con alguno de esos motivos DENTRO del período del informe.
--
-- p_modelos se QUEDA en la firma: la web desplegada antes de este cambio lo
-- sigue mandando, y quitarlo rompería la analítica hasta el próximo deploy.
-- La web nueva ya no lo manda (queda en null).
-- ponytail: borrar p_modelos cuando exista el filtro de tipo de activo o en
-- la próxima limpieza de la firma (drop + create + grants, como acá).
--
-- Drop + create y no create or replace: agregar un parámetro crearía una
-- sobrecarga, y PostgREST no puede elegir entre las dos (PGRST203) cuando la
-- llamada calza con ambas. Cuerpo copiado de la función viva en producción
-- (2026-10-22); el único cambio son los dos filtros de `act`.

begin;

drop function if exists public.analitica_activos(date, date, text, text, text[], uuid[], uuid[], uuid[], uuid[], uuid[]);

create function public.analitica_activos(
  p_desde date,
  p_hasta date,
  p_grano text default 'mes',
  p_tz text default 'America/Santiago',
  p_criticidades text[] default null,
  p_modelos uuid[] default null,
  p_activos uuid[] default null,
  p_ubicaciones uuid[] default null,
  p_sociedades uuid[] default null,
  p_responsables uuid[] default null,
  p_estados text[] default null,
  p_motivos uuid[] default null
)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with
  lim as (
    select
      (p_desde::timestamp at time zone p_tz)                    as ini,
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
      -- Estado ACTUAL del activo (sin estado = operativo, como en los conteos de abajo).
      and (p_estados      is null or coalesce(a.estado, 'operativo') = any(p_estados))
      -- Tuvo una parada con alguno de esos motivos que toca el período.
      and (p_motivos      is null or exists (
            select 1 from activo_estado_periodos pm, lim
            where pm.activo_id = a.id
              and pm.motivo_id = any(p_motivos)
              and pm.inicio < lim.fin
              and coalesce(pm.fin, 'infinity'::timestamptz) > lim.ini))
      and (p_modelos      is null or a.modelo_id      = any(p_modelos))
      and (p_activos      is null or a.id             = any(p_activos))
      and (p_ubicaciones  is null or a.ubicacion_id   = any(p_ubicaciones))
      and (p_sociedades   is null or a.sociedad_id    = any(p_sociedades))
      and (p_responsables is null or a.responsable_id = any(p_responsables))
  ),
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
  hist as (
    select p.activo_id, p.estado, p.tipo_inactividad, p.inicio, p.fin, p.motivo_id,
      sum((p.estado = 'operativo')::int) over (partition by p.activo_id order by p.inicio) as racha
    from act
    join activo_estado_periodos p on p.activo_id = act.id
    cross join lim
    where p.estado <> 'baja'
      and coalesce(p.fin, 'infinity'::timestamptz) > lim.ini - interval '90 days'
  ),
  eventos as (
    select activo_id,
      min(inicio) filter (where tipo_inactividad = 'sin_planear') as inicio,
      case when bool_and(fin is not null) then max(fin) end         as fin,
      (array_agg(motivo_id order by inicio) filter (where tipo_inactividad = 'sin_planear'))[1] as motivo_id
    from hist
    where estado <> 'operativo'
    group by activo_id, racha
    having bool_or(tipo_inactividad = 'sin_planear')
  ),
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
  paradas as (
    select per.c_ini, per.c_fin, (per.clase = 'plan') as planeado, act.costo_hora_parada as tarifa
    from per join act on act.id = per.activo_id
    where per.clase in ('plan', 'imp') and per.c_fin > per.c_ini
  ),
  con_tarifa as (
    select *,
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
$function$;

-- Mismos permisos que la función anterior: un create nuevo da EXECUTE a PUBLIC
-- (y Supabase a anon) por defecto.
revoke all on function public.analitica_activos(date, date, text, text, text[], uuid[], uuid[], uuid[], uuid[], uuid[], text[], uuid[]) from public, anon;
grant execute on function public.analitica_activos(date, date, text, text, text[], uuid[], uuid[], uuid[], uuid[], uuid[], text[], uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
