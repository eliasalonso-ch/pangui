ALTER TABLE ordenes_trabajo DROP CONSTRAINT ot_tipo_trabajo_check;
ALTER TABLE ordenes_trabajo ADD CONSTRAINT ot_tipo_trabajo_check CHECK (
  tipo_trabajo IS NULL OR tipo_trabajo = ANY (ARRAY['reactiva','preventiva','inspeccion','mejora','levantamiento'])
);;
