-- A vitrine expõe o id da versão vigente para o app saber se o fã já comprou aquela versão.
create or replace view public.public_packages
with (security_invoker = false) as
  select p.id, p.creator_id, pr.handle, pr.display_name,
         v.version, v.title, v.description, v.category, v.price_cents, v.audience, v.cover_path,
         (select count(*) from public.package_items i where i.version_id = v.id and i.kind = 'image')::integer as photo_count,
         (select count(*) from public.package_items i where i.version_id = v.id and i.kind = 'video')::integer as video_count,
         p.published_at, v.published_at as version_published_at,
         v.id as version_id
  from public.packages p
  join public.package_versions v on v.id = p.current_version_id
  join public.profiles pr on pr.id = p.creator_id
  where p.status = 'published'
    and pr.status = 'active'
    and (pr.visibility = 'public'
         or p.creator_id = auth.uid()
         or (pr.visibility = 'followers' and exists (
               select 1 from public.follows f where f.follower_id = auth.uid() and f.creator_id = p.creator_id)))
    and (auth.uid() is null or not public.is_blocked_with(p.creator_id) or p.creator_id = auth.uid());
