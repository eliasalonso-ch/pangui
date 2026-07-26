
-- Workspace-level SLA/alert rules (admin-owned)
CREATE TABLE reglas_alerta_workspace (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tipo            text NOT NULL,
  -- types: ot_abierta_sin_progreso | ot_en_curso_inactiva | ot_bloqueada |
  --        ot_vencida | ot_sin_asignar | ot_urgente_sin_asignar |
  --        timer_inactivo_tecnico | timer_inactivo_supervisor | timer_inactivo_manager
  activa          boolean NOT NULL DEFAULT true,
  umbral_minutos  integer NOT NULL DEFAULT 480, -- threshold in minutes (8h default)
  rol_destino     text,    -- null = all roles, or 'tecnico'|'supervisor'|'admin'|'owner'
  es_obligatoria  boolean NOT NULL DEFAULT false, -- users cannot opt out
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, tipo, rol_destino)
);

-- Seed sensible defaults when a new workspace is created via trigger
CREATE OR REPLACE FUNCTION seed_reglas_alerta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reglas_alerta_workspace (workspace_id, tipo, umbral_minutos, es_obligatoria, rol_destino) VALUES
    (NEW.id, 'ot_vencida',                  0,    true,  null),
    (NEW.id, 'ot_sin_asignar',              480,  false, null),
    (NEW.id, 'ot_urgente_sin_asignar',      60,   true,  null),
    (NEW.id, 'ot_bloqueada',                1440, true,  null),
    (NEW.id, 'ot_abierta_sin_progreso',     4320, false, null),
    (NEW.id, 'ot_en_curso_inactiva',        480,  false, null),
    (NEW.id, 'timer_inactivo_tecnico',      30,   false, 'member'),
    (NEW.id, 'timer_inactivo_supervisor',   120,  false, 'admin'),
    (NEW.id, 'timer_inactivo_manager',      1440, false, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_reglas_alerta
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION seed_reglas_alerta();

-- Seed for all existing workspaces that don't have rules yet
INSERT INTO reglas_alerta_workspace (workspace_id, tipo, umbral_minutos, es_obligatoria, rol_destino)
SELECT w.id, r.tipo, r.umbral_minutos, r.es_obligatoria, r.rol_destino
FROM workspaces w
CROSS JOIN (VALUES
  ('ot_vencida',                  0,    true,  null),
  ('ot_sin_asignar',              480,  false, null),
  ('ot_urgente_sin_asignar',      60,   true,  null::text),
  ('ot_bloqueada',                1440, true,  null::text),
  ('ot_abierta_sin_progreso',     4320, false, null::text),
  ('ot_en_curso_inactiva',        480,  false, null::text),
  ('timer_inactivo_tecnico',      30,   false, 'member'),
  ('timer_inactivo_supervisor',   120,  false, 'admin'),
  ('timer_inactivo_manager',      1440, false, 'owner')
) AS r(tipo, umbral_minutos, es_obligatoria, rol_destino)
ON CONFLICT (workspace_id, tipo, rol_destino) DO NOTHING;

-- RLS
ALTER TABLE reglas_alerta_workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can read rules"
  ON reglas_alerta_workspace FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios WHERE id = auth.uid()
    )
  );

CREATE POLICY "admins can manage rules"
  ON reglas_alerta_workspace FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios
      WHERE id = auth.uid() AND rol IN ('admin', 'owner')
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_reglas_updated_at
  BEFORE UPDATE ON reglas_alerta_workspace
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
;
