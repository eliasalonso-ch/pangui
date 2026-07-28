-- billing_profiles: datos del receptor para la boleta de honorarios electrónica.
--
-- La tabla existía en supabase/legacy-migrations-unreconciled/ pero nunca se
-- aplicó: /api/suscripcion/billing-profile devolvía PGRST205 y respondía con un
-- perfil vacío, así que el formulario parecía guardar y no persistía nada.
--
-- Solo se crean los campos que una BHE necesita. El SII pide identificar al
-- receptor por RUT y nombre; dirección, comuna, ciudad, región y giro son
-- campos de factura (o de boleta en papel) y no se usan en la emisión
-- electrónica. Tampoco se incluyen receive_pdf_invoices / invoice_language:
-- Pangui no envía documentos por correo, ese envío lo hace Flow.cl.

CREATE TABLE IF NOT EXISTS billing_profiles (
  workspace_id  uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  billing_email text,
  razon_social  text,
  rut           text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;

-- La API usa la service role key (adminSupabase) y valida el rol por su cuenta
-- vía requireAdminOfWorkspace, pero la política queda igual para que un cliente
-- con la anon key nunca pueda leer datos tributarios de otro workspace.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'billing_profiles'
      AND policyname = 'workspace owner can manage billing profile'
  ) THEN
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
  END IF;
END $$;
