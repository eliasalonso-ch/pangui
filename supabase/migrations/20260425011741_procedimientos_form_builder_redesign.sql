
-- Drop old CHECK constraint on tipo
ALTER TABLE procedimiento_pasos DROP CONSTRAINT IF EXISTS procedimiento_pasos_tipo_check;

-- New tipo values
ALTER TABLE procedimiento_pasos ADD CONSTRAINT procedimiento_pasos_tipo_check
  CHECK (tipo IN (
    'instruccion', 'advertencia',
    'texto', 'numero', 'monto',
    'si_no_na', 'opcion_multiple',
    'lista_verificacion', 'inspeccion',
    'imagen', 'firma'
  ));

-- New columns on procedimiento_pasos
ALTER TABLE procedimiento_pasos ADD COLUMN IF NOT EXISTS opciones        TEXT[];
ALTER TABLE procedimiento_pasos ADD COLUMN IF NOT EXISTS multilinea      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE procedimiento_pasos ADD COLUMN IF NOT EXISTS moneda          TEXT NOT NULL DEFAULT 'CLP';

-- New response columns on paso_respuestas
ALTER TABLE paso_respuestas ADD COLUMN IF NOT EXISTS valor_texto  TEXT;
ALTER TABLE paso_respuestas ADD COLUMN IF NOT EXISTS valor_json   JSONB;
ALTER TABLE paso_respuestas ADD COLUMN IF NOT EXISTS firma_svg    TEXT;
;
