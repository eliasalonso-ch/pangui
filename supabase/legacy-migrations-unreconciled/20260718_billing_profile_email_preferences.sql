-- Safe follow-up for environments where the billing_profiles migration was
-- applied before email delivery preferences were introduced.
ALTER TABLE billing_profiles
  ADD COLUMN IF NOT EXISTS receive_pdf_invoices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_language text NOT NULL DEFAULT 'es';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_profiles_invoice_language_check'
  ) THEN
    ALTER TABLE billing_profiles
      ADD CONSTRAINT billing_profiles_invoice_language_check
      CHECK (invoice_language IN ('es', 'en'));
  END IF;
END $$;
