DO $$
DECLARE
  oid_electricista    uuid := '00000000-0f01-0000-0000-000000000001';
  oid_plomero         uuid := '00000000-0f01-0000-0000-000000000002';
  oid_carpintero      uuid := '00000000-0f01-0000-0000-000000000003';
  oid_soldador        uuid := '00000000-0f01-0000-0000-000000000004';
  oid_hvac            uuid := '00000000-0f01-0000-0000-000000000005';
  oid_corrientes      uuid := '00000000-0f01-0000-0000-000000000006';
  oid_pintor          uuid := '00000000-0f01-0000-0000-000000000007';
  oid_general         uuid := '00000000-0f01-0000-0000-000000000008';
  oid_otro            uuid := '00000000-0f01-0000-0000-000000000009';
  cid_ayudante        uuid := '00000000-0c01-0000-0000-000000000001';
  cid_maestro         uuid := '00000000-0c01-0000-0000-000000000002';
  cid_supervisor      uuid := '00000000-0c01-0000-0000-000000000003';
  cid_jefe            uuid := '00000000-0c01-0000-0000-000000000004';
  cid_admin           uuid := '00000000-0c01-0000-0000-000000000005';
  cid_dueno           uuid := '00000000-0c01-0000-0000-000000000006';
  cid_otro            uuid := '00000000-0c01-0000-0000-000000000007';
BEGIN
  UPDATE public.usuarios
  SET oficio_id = CASE
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(elec|electricista|electrico|electrical)' THEN oid_electricista
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(plom|gasfiter|gasfitero|fontanero|plumber)' THEN oid_plomero
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(carpintero|carpinteria|carpenter)' THEN oid_carpintero
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(sold|soldador|welder|welding)' THEN oid_soldador
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(hvac|climatiza|refriger|aire acondicionado|calefacc)' THEN oid_hvac
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(corriente.?d.?bil|cctv|red|cableado estructural|telecomunic|it |sistemas)' THEN oid_corrientes
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(pint|pintor|painter)' THEN oid_pintor
    WHEN lower(COALESCE(oficio,'') || ' ' || COALESCE(cargo,'')) ~ '(general|polivalente|multitarea)' THEN oid_general
    WHEN (COALESCE(oficio,'') || COALESCE(cargo,'')) = '' THEN oid_otro
    ELSE oid_otro
  END
  WHERE oficio_id IS NULL;

  UPDATE public.usuarios
  SET cargo_id = CASE
    WHEN lower(COALESCE(cargo,'') || ' ' || COALESCE(oficio,'')) ~ '(due[ñn]o|owner|propietario|gerente general)' THEN cid_dueno
    WHEN lower(COALESCE(cargo,'') || ' ' || COALESCE(oficio,'')) ~ '(admin|administrador|administrator)' THEN cid_admin
    WHEN lower(COALESCE(cargo,'') || ' ' || COALESCE(oficio,'')) ~ '(jefe.?mant|jefe de mant|head of maint)' THEN cid_jefe
    WHEN lower(COALESCE(cargo,'') || ' ' || COALESCE(oficio,'')) ~ '(supervisor|encargado|coordinador|jefe)' THEN cid_supervisor
    WHEN lower(COALESCE(cargo,'') || ' ' || COALESCE(oficio,'')) ~ '(maestro|técnico|tecnico|oficial|master|especialista)' THEN cid_maestro
    WHEN lower(COALESCE(cargo,'') || ' ' || COALESCE(oficio,'')) ~ '(ayudante|asistente|helper|aprendiz|aprendizaje|practicante)' THEN cid_ayudante
    ELSE cid_otro
  END
  WHERE cargo_id IS NULL;
END $$;
;
