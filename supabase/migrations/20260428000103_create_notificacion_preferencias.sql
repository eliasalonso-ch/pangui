
-- Per-user notification delivery preferences
CREATE TABLE notificacion_preferencias (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id              uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE UNIQUE,

  -- Push delivery
  push_activo             boolean NOT NULL DEFAULT true,
  push_sonido             boolean NOT NULL DEFAULT true,

  -- Personal opt-in alerts (non-mandatory)
  notif_asignada          boolean NOT NULL DEFAULT true,  -- assigned to new OT
  notif_comentario        boolean NOT NULL DEFAULT true,  -- comment on my OT
  notif_estado_cambiado   boolean NOT NULL DEFAULT true,  -- status changed on my OT
  notif_resumen_diario    boolean NOT NULL DEFAULT false, -- daily digest
  notif_recordatorio_timer boolean NOT NULL DEFAULT true, -- reminder to start timer

  -- Digest time (hour of day, 0-23, for daily summary)
  resumen_hora            integer NOT NULL DEFAULT 8,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Auto-create preferences row when a user is created
CREATE OR REPLACE FUNCTION seed_notificacion_preferencias()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notificacion_preferencias (usuario_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_notif_prefs
  AFTER INSERT ON usuarios
  FOR EACH ROW EXECUTE FUNCTION seed_notificacion_preferencias();

-- Seed for existing users
INSERT INTO notificacion_preferencias (usuario_id)
SELECT id FROM usuarios
ON CONFLICT DO NOTHING;

-- RLS: users can only read/write their own row
ALTER TABLE notificacion_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns their preferences"
  ON notificacion_preferencias FOR ALL
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE TRIGGER trg_notif_prefs_updated_at
  BEFORE UPDATE ON notificacion_preferencias
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Track which alerts have already been sent (prevent spam)
CREATE TABLE alerta_enviada (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  orden_id     uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  tipo         text NOT NULL,
  enviada_at   timestamptz NOT NULL DEFAULT now(),
  -- Reset if OT changes state (handled in cron)
  UNIQUE (orden_id, tipo)
);

ALTER TABLE alerta_enviada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read sent alerts"
  ON alerta_enviada FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM usuarios
      WHERE id = auth.uid() AND rol IN ('admin', 'owner')
    )
  );
;
