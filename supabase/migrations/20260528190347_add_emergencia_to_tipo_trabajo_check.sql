
ALTER TABLE ordenes_trabajo
  DROP CONSTRAINT ot_tipo_trabajo_check,
  ADD CONSTRAINT ot_tipo_trabajo_check CHECK (
    tipo_trabajo IS NULL OR tipo_trabajo = ANY (ARRAY[
      'reactiva', 'preventiva', 'emergencia', 'inspeccion',
      'mejora', 'levantamiento', 'presupuesto'
    ])
  );
;
