-- billing_profiles: campos adicionales del destinatario para la boleta de
-- honorarios electrónica (BHE) del SII.
--
-- El formulario de emisión del SII exige, además de RUT y nombre, el
-- domicilio, la región y la comuna del destinatario (los tres marcados como
-- obligatorios en la página de emisión). La migración original
-- 20260728180754_billing_profiles.sql asumía que bastaba RUT + nombre;
-- estos campos completan lo que la emisión real requiere.

ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS domicilio text;
ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS region    text;
ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS comuna    text;
