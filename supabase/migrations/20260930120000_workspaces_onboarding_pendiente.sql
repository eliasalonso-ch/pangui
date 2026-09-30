-- Web signup now only asks for email + password; name, company, industry and
-- logo are collected by a required setup screen inside the dashboard.
-- true = that setup hasn't been completed yet. Only /api/registro's minimal
-- path sets it, so every existing workspace (and the mobile signup, which still
-- sends the full data) stays false and is never gated.
alter table public.workspaces
  add column if not exists onboarding_pendiente boolean not null default false;
