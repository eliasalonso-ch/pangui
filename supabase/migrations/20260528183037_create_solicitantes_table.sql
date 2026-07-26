
-- Solicitantes table: workspace-scoped catalog of requesters
CREATE TABLE solicitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solicitantes_workspace_idx ON solicitantes(workspace_id);

ALTER TABLE solicitantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY solicitantes_select ON solicitantes
  FOR SELECT USING (workspace_id = my_workspace_id());

CREATE POLICY solicitantes_insert ON solicitantes
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

CREATE POLICY solicitantes_delete ON solicitantes
  FOR DELETE USING (workspace_id = my_workspace_id());

-- Seed deduplicated solicitantes for Electrilam
INSERT INTO solicitantes (workspace_id, nombre) VALUES
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Cristian Quijada'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Samuel Artiaga'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Rodrigo Vergara'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Enzo Cifuentes'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Andrea Mora Gutierrez'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Javier Araneda'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Hortensia Espinoza'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Pamela Neira Rodriguez'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Estephani Carilao Novoa'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'María Elena Moya Pérez'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Rodolfo Arratia Figueroa'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Victoria Durán Valenzuela'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Paula Del Río Ascencio'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Karen Christ Constanzo'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Claudia Valdés González'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Carlos Peña Vargas'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Rosa Vera Rojas'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Magdalena Norambuena'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Camila Ortega Navarrete'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Lissette Delgado Carrillo'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Giovanna Cosmelli Marambio'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Patricia Medina Lagos'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Amanda Sagardia Castro'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Carmen Arias Norambuena'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Elizabeth San Martin Armijo'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Zunilda Robles Orias'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Claudia Soto Garrido'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Juana González Sepúlveda'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Ignelia Acuña Jara'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Ximena Monsalve Cisternas'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Jéssica Bañados Canales'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'María Leonor Urbina Badilla'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Marisol Vásquez Obrador'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Marcelo Valderrama'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Ivonne Sepúlveda Veloso'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Fabiola Olivares Contreras'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Juan Pablo Matus Poveda'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Ricardo Tello'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Haydée Miranda Parada'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Ana Cristina San Martín Cuevas'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Jeny Leiva Inostroza'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Andrea Solis'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Christian Castillo Molina'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Gerardo Villegas Erices'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Lorena Carrasco'),
  ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Lorena Benavente');
;
