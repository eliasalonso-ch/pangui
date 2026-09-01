-- ---------------------------------------------------------------------------
-- Demo dataset: asset reliability metrics (MTBF / MTTR / availability / PM)
-- ---------------------------------------------------------------------------
-- Creates ONE demo asset plus a 12-month work-order history designed to produce
-- realistic, non-trivial CMMS numbers so the /activos reliability panel can be
-- built and verified against known-good values.
--
-- Why a separate asset: the real "Generador Powermax PM3800" has 3 OTs and zero
-- failures, so every reliability metric is either 0 or undefined. Rather than
-- pollute a real asset's history, this seeds a parallel DEMO asset.
--
-- Everything is tagged with the marker below, so teardown is exact.
--   Teardown: see scripts/demo/teardown-activo-reliability-demo.sql
--
-- Safety notes:
--   * OTs are inserted in their FINAL state (estado='completado', completado_en
--     set) so the AFTER UPDATE triggers -- notification fan-out and recurrence
--     generation -- never fire. No real user is notified by running this.
--   * numero is left NULL so trg_assign_orden_numero assigns it normally.
--   * All rows use Elias Alonso as creador/asignado/completado_por.
--
-- Idempotent: re-running deletes and recreates the demo rows.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws        uuid := 'f1b64714-6de2-4d49-b6e4-5959553e94d7';  -- Electrilam
  v_user      uuid := '17929bdc-a2c0-4139-8469-a239feaa0f44';  -- Elias Alonso
  v_marker    text := '[DEMO-RELIABILITY]';
  v_activo    uuid;
  v_ubic      uuid;
  v_fab       uuid;
  v_mod       uuid;
  -- Anchor the history to a fixed 12-month window ending today so the numbers
  -- stay stable regardless of when this is run.
  v_end       timestamptz := date_trunc('day', now());
  v_start     timestamptz := date_trunc('day', now()) - interval '365 days';
begin

  -- ── Clean previous run ────────────────────────────────────────────────────
  delete from ordenes_trabajo
   where workspace_id = v_ws and observacion like v_marker || '%';

  delete from activos
   where workspace_id = v_ws and nombre like '%(DEMO)%';

  -- ── Catalog rows (reuse existing where possible) ──────────────────────────
  select id into v_ubic from ubicaciones
   where workspace_id = v_ws and activa = true order by edificio limit 1;

  select id into v_fab from fabricantes where nombre ilike 'powermax' limit 1;
  if v_fab is null then
    insert into fabricantes (nombre) values ('Powermax') returning id into v_fab;
  end if;

  select id into v_mod from modelos
   where fabricante_id = v_fab and nombre ilike 'PM3800' limit 1;
  if v_mod is null then
    insert into modelos (fabricante_id, nombre) values (v_fab, 'PM3800')
      returning id into v_mod;
  end if;

  -- ── The demo asset ────────────────────────────────────────────────────────
  insert into activos (
    workspace_id, nombre, descripcion, ubicacion_id, fabricante_id, modelo_id,
    criticidad, estado, numero_serie, año_fabricacion, activo, created_at,
    responsable_id
  ) values (
    v_ws,
    'Generador Powermax PM3800 (DEMO)',
    'Activo de demostración con historial de 12 meses para validar métricas de '
    || 'confiabilidad (MTBF, MTTR, disponibilidad, cumplimiento de preventivos).',
    v_ubic, v_fab, v_mod,
    'critico', 'operativo', 'PM3800-DEMO-0001', 2021, true,
    v_start - interval '30 days',
    v_user
  ) returning id into v_activo;

  -- ── Corrective / failure events ───────────────────────────────────────────
  -- Six failures across the year. Repair durations are deliberately varied and
  -- the mid-year cluster (bearing degradation) is followed by an overhaul, so
  -- MTBF visibly improves in the last quarter -- that trend is the point.
  --
  -- cols: days_ago_start, repair_minutes, tipo_trabajo, prioridad, titulo
  insert into ordenes_trabajo (
    workspace_id, activo_id, ubicacion_id, tipo, tipo_trabajo, titulo,
    descripcion, observacion, estado, prioridad, creado_por, completado_por,
    asignados_ids, created_at, iniciado_at, completado_en, fecha_inicio,
    fecha_termino, tiempo_total_segundos, recurrencia, costo_mano_obra,
    costo_materiales, costo_total
  )
  select
    v_ws, v_activo, v_ubic, 'solicitud', f.tipo, f.titulo,
    f.descripcion,
    v_marker || ' correctiva',
    'completado', f.prioridad, v_user, v_user, array[v_user],
    v_end - (f.days_ago || ' days')::interval,
    v_end - (f.days_ago || ' days')::interval + interval '35 minutes',
    v_end - (f.days_ago || ' days')::interval + interval '35 minutes'
          + (f.repair_min || ' minutes')::interval,
    (v_end - (f.days_ago || ' days')::interval)::date,
    (v_end - (f.days_ago || ' days')::interval)::date,
    f.repair_min * 60,
    'ninguna',
    round(f.repair_min * 250.0),          -- CLP mano de obra
    f.materiales,
    round(f.repair_min * 250.0) + f.materiales
  from (values
    (338, 145, 'reactiva',   'alta',    'Falla de arranque - batería y bornes',
      'El generador no toma partida. Se detecta batería sulfatada y bornes con corrosión.',  85000::numeric),
    (270, 260, 'emergencia', 'urgente', 'Sobrecalentamiento - falla de bomba de agua',
      'Parada por alta temperatura. Bomba de agua con sello filtrando.',                    320000::numeric),
    (188,  95, 'reactiva',   'alta',    'Fuga de combustible en línea de retorno',
      'Goteo en manguera de retorno. Se reemplaza tramo y abrazaderas.',                     45000::numeric),
    (150, 410, 'emergencia', 'urgente', 'Vibración excesiva - rodamiento alternador',
      'Vibración fuera de rango. Rodamiento lado acople con juego. Requiere desmontaje.',    680000::numeric),
    (132, 520, 'emergencia', 'urgente', 'Falla de rodamiento - overhaul alternador',
      'Segunda falla del mismo rodamiento. Se ejecuta overhaul completo del alternador.',   1450000::numeric),
    ( 46,  80, 'reactiva',   'media',   'Regulador de voltaje fuera de rango',
      'Voltaje de salida inestable. Se recalibra AVR.',                                      60000::numeric)
  ) as f(days_ago, repair_min, tipo, prioridad, titulo, descripcion, materiales);

  -- ── Preventive maintenance program ────────────────────────────────────────
  -- Monthly PM, 12 scheduled. 10 completed on time, 1 completed late (outside
  -- the 10% grace window used by the standard PM-compliance rule), 1 still
  -- pending in the future. That yields 10/11 = 90.9% compliance on due PMs --
  -- deliberately near the 90% "world class" benchmark rather than a clean 100%.
  insert into ordenes_trabajo (
    workspace_id, activo_id, ubicacion_id, tipo, tipo_trabajo, titulo,
    descripcion, observacion, estado, prioridad, creado_por, completado_por,
    asignados_ids, created_at, iniciado_at, completado_en, fecha_inicio,
    fecha_termino, tiempo_total_segundos, recurrencia, costo_mano_obra,
    costo_materiales, costo_total
  )
  select
    v_ws, v_activo, v_ubic, 'solicitud', 'preventiva',
    -- to_char(..,'TMMonth') devuelve ingles con la collation de esta base, asi
    -- que los meses van explicitos en espanol.
    'Mantenimiento preventivo mensual - '
      || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                'septiembre','octubre','noviembre','diciembre'])[extract(month from p.due)::int]
      || ' ' || extract(year from p.due)::int,
    'Rutina mensual: cambio de aceite y filtros, revisión de niveles, prueba de '
    || 'carga y registro de horómetro.',
    v_marker || ' preventiva',
    case when p.done is null then 'pendiente' else 'completado' end,
    'media', v_user,
    case when p.done is null then null else v_user end,
    array[v_user],
    p.due - interval '7 days',
    p.done,
    p.done,
    (p.due - interval '7 days')::date,
    p.due::date,
    case when p.done is null then null else p.dur_min * 60 end,
    'mensual',
    case when p.done is null then null else round(p.dur_min * 250.0) end,
    case when p.done is null then null else 55000::numeric end,
    case when p.done is null then null else round(p.dur_min * 250.0) + 55000 end
  from (
    select
      d.due,
      -- Completed same day except the deliberate late one (mes 5, +9 días).
      case
        when d.n = 12 then null                               -- futuro: pendiente
        when d.n =  5 then d.due + interval '9 days 3 hours'  -- atrasada
        else d.due + interval '3 hours'
      end as done,
      case when d.n in (3, 8) then 190 else 130 end as dur_min
    from (
      -- El PM 12 se ancla al futuro (hoy + 12 dias). Con 30 dias por mes la
      -- ventana de 365 dias termina ANTES de hoy, y ese PM caia como atrasado
      -- en vez de pendiente, empujando el cumplimiento de 90.9% a 83.3%.
      select n,
             case when n = 12 then date_trunc('day', now()) + interval '12 days'
                  else v_start + ((n * 30) || ' days')::interval end as due
      from generate_series(1, 12) as n
    ) d
  ) p;

end $$;

commit;

-- ── Verification ────────────────────────────────────────────────────────────
select a.nombre,
       count(*) filter (where o.tipo_trabajo in ('reactiva','emergencia'))          as fallas,
       count(*) filter (where o.tipo_trabajo = 'preventiva')                        as pm_total,
       count(*) filter (where o.tipo_trabajo = 'preventiva'
                          and o.estado = 'completado')                              as pm_completados,
       count(*)                                                                     as ots_totales,
       round(sum(o.tiempo_total_segundos) filter (
             where o.tipo_trabajo in ('reactiva','emergencia')) / 3600.0, 2)        as horas_reparacion
from activos a
join ordenes_trabajo o on o.activo_id = a.id and o.deleted_at is null
where a.nombre like '%(DEMO)%'
group by a.nombre;
