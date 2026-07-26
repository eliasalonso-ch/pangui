
ALTER TABLE paso_respuestas
  DROP CONSTRAINT paso_respuestas_paso_id_fkey,
  ADD CONSTRAINT paso_respuestas_paso_id_fkey
    FOREIGN KEY (paso_id) REFERENCES procedimiento_pasos(id) ON DELETE CASCADE;
;
