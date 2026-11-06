-- Storage privado. Convenção de caminho: <user_id>/<arquivo>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('verification-documents', 'verification-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners', 'banners', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Documentos de identidade: o dono só envia (sem ler, alterar ou apagar depois);
-- leitura apenas por equipe com permissão + MFA (URLs assinadas de curta duração).
create policy "verification docs: owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "verification docs: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'verification-documents' and public.staff_can('verification_documents.read'));

-- Avatares e banners: o dono gerencia sua pasta. Entrega pública chega na S2 (variantes seguras).
create policy "profile media: owner read"
  on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "profile media: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "profile media: owner update"
  on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "profile media: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);
