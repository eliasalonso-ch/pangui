-- Per-user UI language override, shared by web and mobile.
--
-- NULL is meaningful: it means "the user has never picked a language", so the
-- client auto-detects from the device/browser locale. We only write a value
-- once they choose explicitly in Configuracion. That is what makes a manual
-- choice stick across devices instead of being re-guessed on every launch.
alter table public.usuarios
  add column if not exists idioma text
  check (idioma is null or idioma in ('es', 'en'));

comment on column public.usuarios.idioma is
  'UI language override: es | en. NULL = auto-detect from device locale.';
