-- Cola de carpetas de R2 por borrar cuando se elimina una OT.
--
-- Al borrar una OT sus filas hijas se van por CASCADE, pero los archivos en R2
-- quedaban. Hay tres caminos que borran OTs (purga de papelera, "Eliminar
-- definitivamente" en web y en móvil) más el borrado de workspace, y ninguno
-- limpiaba las fotos de grupos, actividad ni procedimientos. Al 2026-11-11
-- había 158 OTs borradas con 175 MB de archivos huérfanos en el bucket.
--
-- En vez de arreglar cada camino, un trigger AFTER DELETE anota la carpeta
-- `ordenes/<id>/` y la función purge-papelera (cron diario) la vacía. Así
-- cualquier borrado, presente o futuro, queda cubierto sin tocar los clientes.
--
-- Invariante de la que depende: todo lo que hay bajo `ordenes/<id>/` es de esa
-- OT y de ninguna otra. Verificado el 2026-11-11: 7.629 referencias, 0 a la
-- carpeta de otra OT. Si alguna vez una OT reutiliza URLs de otra (por ejemplo
-- al clonar), hay que copiar los archivos o esta cola borraría fotos en uso.
--
-- Las URLs sueltas fuera de esa carpeta (imagen_url en `scans/`, etc.) no se
-- encolan: no se puede saber si otra fila las usa.

create table public.r2_borrados_pendientes (
  id         bigint generated always as identity primary key,
  prefijo    text not null,
  created_at timestamptz not null default now()
);

-- Sin policies: solo la service role (purge-papelera) la lee y la vacía.
alter table public.r2_borrados_pendientes enable row level security;
revoke all on table public.r2_borrados_pendientes from anon, authenticated;

create function public.fn_encolar_borrado_r2_ot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.r2_borrados_pendientes (prefijo)
  values ('ordenes/' || old.id::text || '/');
  return old;
end;
$$;

revoke execute on function public.fn_encolar_borrado_r2_ot() from public, anon, authenticated;

create trigger trg_encolar_borrado_r2_ot
  after delete on public.ordenes_trabajo
  for each row execute function public.fn_encolar_borrado_r2_ot();
