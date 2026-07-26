
-- Procedures library
CREATE TABLE procedimientos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  categoria     TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  bloquea_cierre_ot BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Steps that belong to a procedure (ordered)
CREATE TABLE procedimiento_pasos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedimiento_id  UUID NOT NULL REFERENCES procedimientos(id) ON DELETE CASCADE,
  orden             INTEGER NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN (
                      'instruccion','verificacion','medicion',
                      'foto','advertencia','material','firma'
                    )),
  titulo            TEXT NOT NULL,
  descripcion       TEXT,
  requerido         BOOLEAN NOT NULL DEFAULT TRUE,
  -- medicion fields
  unidad            TEXT,
  valor_min         NUMERIC,
  valor_max         NUMERIC,
  -- material fields
  cantidad          NUMERIC,
  -- firma fields
  rol_firmante      TEXT,
  UNIQUE (procedimiento_id, orden)
);

-- Procedure linked to a work order (many-to-many via executions)
CREATE TABLE procedimiento_ejecuciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedimiento_id  UUID NOT NULL REFERENCES procedimientos(id),
  orden_id          UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  iniciado_por      UUID REFERENCES usuarios(id),
  completado_por    UUID REFERENCES usuarios(id),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','en_curso','completado','cancelado')),
  iniciado_at       TIMESTAMPTZ,
  completado_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Responses for each step within an execution
CREATE TABLE paso_respuestas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_id    UUID NOT NULL REFERENCES procedimiento_ejecuciones(id) ON DELETE CASCADE,
  paso_id         UUID NOT NULL REFERENCES procedimiento_pasos(id),
  respondido_por  UUID REFERENCES usuarios(id),
  -- verificacion
  aprobado        BOOLEAN,
  -- medicion
  valor_medido    NUMERIC,
  -- foto
  foto_url        TEXT,
  -- firma
  firmado_por_id  UUID REFERENCES usuarios(id),
  firmado_nombre  TEXT,
  firmado_at      TIMESTAMPTZ,
  -- general
  notas           TEXT,
  respondido_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ejecucion_id, paso_id)
);

-- Link table: which procedures are attached to a work order (before execution)
CREATE TABLE ot_procedimientos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id          UUID NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  procedimiento_id  UUID NOT NULL REFERENCES procedimientos(id),
  adjuntado_por     UUID REFERENCES usuarios(id),
  adjuntado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (orden_id, procedimiento_id)
);

-- Indexes
CREATE INDEX ON procedimientos(workspace_id);
CREATE INDEX ON procedimiento_pasos(procedimiento_id);
CREATE INDEX ON procedimiento_ejecuciones(orden_id);
CREATE INDEX ON procedimiento_ejecuciones(procedimiento_id);
CREATE INDEX ON paso_respuestas(ejecucion_id);
CREATE INDEX ON ot_procedimientos(orden_id);

-- RLS
ALTER TABLE procedimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedimiento_pasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedimiento_ejecuciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE paso_respuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_procedimientos ENABLE ROW LEVEL SECURITY;

-- RLS policies (workspace-scoped via JWT claim)
CREATE POLICY "workspace members can read procedimientos"
  ON procedimientos FOR SELECT
  USING (workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id'));

CREATE POLICY "workspace members can insert procedimientos"
  ON procedimientos FOR INSERT
  WITH CHECK (workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id'));

CREATE POLICY "workspace members can update procedimientos"
  ON procedimientos FOR UPDATE
  USING (workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id'));

CREATE POLICY "workspace members can read pasos"
  ON procedimiento_pasos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can insert pasos"
  ON procedimiento_pasos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can update pasos"
  ON procedimiento_pasos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can delete pasos"
  ON procedimiento_pasos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can read ejecuciones"
  ON procedimiento_ejecuciones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = procedimiento_ejecuciones.orden_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can insert ejecuciones"
  ON procedimiento_ejecuciones FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = procedimiento_ejecuciones.orden_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can update ejecuciones"
  ON procedimiento_ejecuciones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = procedimiento_ejecuciones.orden_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can read paso_respuestas"
  ON paso_respuestas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM procedimiento_ejecuciones pe
      JOIN ordenes_trabajo ot ON ot.id = pe.orden_id
      WHERE pe.id = paso_respuestas.ejecucion_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can insert paso_respuestas"
  ON paso_respuestas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procedimiento_ejecuciones pe
      JOIN ordenes_trabajo ot ON ot.id = pe.orden_id
      WHERE pe.id = paso_respuestas.ejecucion_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can update paso_respuestas"
  ON paso_respuestas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM procedimiento_ejecuciones pe
      JOIN ordenes_trabajo ot ON ot.id = pe.orden_id
      WHERE pe.id = paso_respuestas.ejecucion_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can read ot_procedimientos"
  ON ot_procedimientos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = ot_procedimientos.orden_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can insert ot_procedimientos"
  ON ot_procedimientos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = ot_procedimientos.orden_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );

CREATE POLICY "workspace members can delete ot_procedimientos"
  ON ot_procedimientos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ordenes_trabajo ot
      WHERE ot.id = ot_procedimientos.orden_id
        AND ot.workspace_id::text = (auth.jwt()->'user_metadata'->>'workspace_id')
    )
  );
;
