-- Idempotent repair for environments where billing profile migrations were
-- not recorded or only the original table shape was applied.
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
  invoice_language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_profiles
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS giro text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS comuna text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS pais text NOT NULL DEFAULT 'Chile',
  ADD COLUMN IF NOT EXISTS receive_pdf_invoices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace owner can manage billing profile" ON billing_profiles;
CREATE POLICY "workspace owner can manage billing profile"
  ON billing_profiles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid()
      AND u.workspace_id = billing_profiles.workspace_id
      AND u.rol = 'owner'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid()
      AND u.workspace_id = billing_profiles.workspace_id
      AND u.rol = 'owner'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_profiles_invoice_language_check'
      AND conrelid = 'billing_profiles'::regclass
  ) THEN
    ALTER TABLE billing_profiles
      ADD CONSTRAINT billing_profiles_invoice_language_check
      CHECK (invoice_language IN ('es', 'en'));
  END IF;
END $$;
