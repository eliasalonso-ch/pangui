alter table public.foto_grupos
  add column if not exists tipo text not null default 'evidencia';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'foto_grupos_tipo_check'
      and conrelid = 'public.foto_grupos'::regclass
  ) then
    alter table public.foto_grupos
      add constraint foto_grupos_tipo_check
      check (tipo in ('referencia', 'evidencia'))
      not valid;
  end if;
end $$;

alter table public.foto_grupos
  validate constraint foto_grupos_tipo_check;

create index if not exists idx_foto_grupos_orden_tipo
  on public.foto_grupos (orden_id, tipo, orden_display);
