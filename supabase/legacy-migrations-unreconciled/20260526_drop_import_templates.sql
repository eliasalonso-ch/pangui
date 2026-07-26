-- Removes the import_templates feature. The team decided the underlying
-- problem (workshop staff under-reporting materials used) is an inventory
-- control issue, not an Excel-format one, so the import/export flow on top
-- of self-reported materiales was deprecated.

DROP TABLE IF EXISTS public.import_templates;
DROP FUNCTION IF EXISTS public.fn_import_templates_touch();
