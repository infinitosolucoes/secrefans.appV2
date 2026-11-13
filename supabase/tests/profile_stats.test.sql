-- Contadores do cabeçalho do perfil: fotos, vídeos e curtidas só de publicações publicadas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

delete from public.posts where creator_id = '00000000-0000-4000-a000-000000000002';
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;

insert into public.posts (id, creator_id, body, visibility, status, content_attested_at, content_attestation_version) values
  ('10000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000002', 'pub', 'free', 'published', now(), 1),
  ('10000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-000000000002', 'rascunho', 'free', 'draft', null, null);
insert into public.post_media (post_id, creator_id, storage_path, kind, position) values
  ('10000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/10000000-0000-4000-a000-0000000000a1/20000000-0000-4000-a000-000000000001.webp', 'image', 0),
  ('10000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/10000000-0000-4000-a000-0000000000a1/20000000-0000-4000-a000-000000000002.webp', 'image', 1),
  ('10000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/10000000-0000-4000-a000-0000000000a2/20000000-0000-4000-a000-000000000003.webp', 'image', 0);
insert into public.post_likes (post_id, user_id) values
  ('10000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-000000000001');

set local role anon;
select is((select photos from public.creator_stats('00000000-0000-4000-a000-000000000002')), 2,
  'conta as fotos só das publicações publicadas');
select is((select videos from public.creator_stats('00000000-0000-4000-a000-000000000002')), 0, 'sem vídeos');
select is((select likes from public.creator_stats('00000000-0000-4000-a000-000000000002')), 1, 'soma as curtidas');
select is((select posts from public.creator_stats('00000000-0000-4000-a000-000000000002')), 1,
  'rascunho não entra na contagem de publicações');
reset role;

select * from finish();
rollback;
