CREATE TABLE IF NOT EXISTS billing_profiles (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  billing_email text,
  razon_social text,
  rut text,
  giro text,
  direccion text,
  comuna text,
  ciudad text,
  region text,
  pais text NOT NULL DEFAULT 'Chile',
  receive_pdf_invoices boolean NOT NULL DEFAULT true,
  invoice_language text NOT NULL DEFAULT 'es' CHECK (invoice_language IN ('es', 'en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace owner can manage billing profile"
  ON billing_profiles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = billing_profiles.workspace_id AND u.rol = 'owner'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = billing_profiles.workspace_id AND u.rol = 'owner'
  ));
