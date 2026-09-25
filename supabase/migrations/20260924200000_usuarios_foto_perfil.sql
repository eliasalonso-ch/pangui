-- Foto de perfil por usuario.
--
-- Cada usuario sube su propia foto desde "Mi cuenta" (web y móvil). El cliente
-- la reduce a 256×256 JPEG antes de subirla, así que pesa ~20-30 KB. Sin foto,
-- las apps siguen mostrando las iniciales de siempre.
--
-- La ruta lleva un timestamp (`{user_id}/{ts}.jpg`): cambiar la foto cambia la
-- URL, así que navegador y expo-image pueden cachearla para siempre sin servir
-- una foto vieja.
--
-- Escribir la columna ya está cubierto por `usuarios_update` (id = auth.uid()).

alter table public.usuarios add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Solo dentro de la carpeta propia: `avatares/{auth.uid()}/...`. La lectura es
-- pública por ser bucket público (getPublicUrl no pasa por RLS).
create policy "avatares_insert_propio" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- `remove()` de la API de storage necesita SELECT además de DELETE.
create policy "avatares_select_propio" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatares_delete_propio" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
