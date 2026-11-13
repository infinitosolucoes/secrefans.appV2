-- Cabeçalho do perfil: além de seguidores e publicações, conta fotos, vídeos e curtidas das
-- publicações publicadas (só números; nenhum caminho de mídia sai daqui).

drop function public.creator_stats(uuid);
create function public.creator_stats(p_creator_id uuid)
returns table (followers integer, posts integer, photos integer, videos integer, likes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.follows f where f.creator_id = p_creator_id)::integer,
    (select count(*) from public.posts po where po.creator_id = p_creator_id and po.status = 'published')::integer,
    (select count(*) from public.post_media m join public.posts po on po.id = m.post_id
      where po.creator_id = p_creator_id and po.status = 'published' and m.kind = 'image')::integer,
    (select count(*) from public.post_media m join public.posts po on po.id = m.post_id
      where po.creator_id = p_creator_id and po.status = 'published' and m.kind = 'video')::integer,
    (select count(*) from public.post_likes l join public.posts po on po.id = l.post_id
      where po.creator_id = p_creator_id and po.status = 'published')::integer;
$$;
revoke execute on function public.creator_stats(uuid) from public;
grant execute on function public.creator_stats(uuid) to anon, authenticated;
