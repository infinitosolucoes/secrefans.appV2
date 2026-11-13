-- S2: acesso a publicações, mídia protegida, seguir, interações e denúncias (spec M04/M05).
-- Usuários do seed.sql: fan ...001, criador ...002, moderador ...003, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create or replace function pg_temp.as_user(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  execute 'set local role authenticated';
end; $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end; $$;

-- Limpa o que execuções E2E deixaram no banco local (tudo é desfeito no rollback).
delete from public.reports;
delete from public.follows;
delete from public.posts where creator_id = '00000000-0000-4000-a000-000000000002';
delete from public.user_blocks;

-- Fixtures (como postgres): criador aprovado, um post grátis, um PPV e um rascunho com mídia.
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator')
on conflict do nothing;
insert into public.posts (id, creator_id, body, visibility, price_cents, status, content_attested_at) values
  ('22222222-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'post grátis', 'free', null, 'published', now()),
  ('22222222-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', 'post ppv', 'ppv', 1990, 'published', now()),
  ('22222222-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002', 'rascunho', 'free', null, 'draft', now());
insert into public.post_media (post_id, creator_id, storage_path) values
  ('22222222-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/22222222-0000-4000-a000-000000000001/33333333-0000-4000-a000-000000000001.webp'),
  ('22222222-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/22222222-0000-4000-a000-000000000002/33333333-0000-4000-a000-000000000002.webp'),
  ('22222222-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/22222222-0000-4000-a000-000000000003/33333333-0000-4000-a000-000000000003.webp');
insert into storage.objects (bucket_id, name, owner_id) values
  ('post-media', '00000000-0000-4000-a000-000000000002/22222222-0000-4000-a000-000000000002/33333333-0000-4000-a000-000000000002.webp',
   '00000000-0000-4000-a000-000000000002');

-- Visitante ---------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$ select * from public.posts $$, '42501', null, 'visitante não lê a tabela posts');
select throws_ok($$ select * from public.post_media $$, '42501', null, 'visitante não lê post_media');
select is((select count(*)::int from public.feed_posts where creator_id = '00000000-0000-4000-a000-000000000002'), 2,
  'visitante vê só os cards publicados (sem rascunho)');
select is((select count(*)::int from public.post_media_for('22222222-0000-4000-a000-000000000001')), 1,
  'visitante recebe a mídia do post grátis');
select is((select count(*)::int from public.post_media_for('22222222-0000-4000-a000-000000000002')), 0,
  'visitante não recebe caminho da mídia PPV');
select is((select count(*)::int from public.post_media_for('22222222-0000-4000-a000-000000000003')), 0,
  'visitante não recebe mídia de rascunho');
select is((select unlocked from public.feed_posts where id = '22222222-0000-4000-a000-000000000002'), false,
  'card PPV aparece bloqueado');
reset role;

-- Fã ----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.posts), 0, 'fã não lê a tabela posts de outros');
select is((select count(*)::int from public.post_media), 0, 'fã não lê linhas de mídia de outros');
select is((select count(*)::int from storage.objects where bucket_id = 'post-media'), 0,
  'fã não acessa diretamente os objetos de mídia');
select is((select count(*)::int from public.post_media_for('22222222-0000-4000-a000-000000000002')), 0,
  'fã sem compra não recebe mídia PPV');
select throws_ok(
  $$ insert into public.posts (creator_id, body, status, content_attested_at) values ('00000000-0000-4000-a000-000000000001', 'x', 'published', now()) $$,
  '42501', null, 'fã sem papel creator não publica');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('post-media', '00000000-0000-4000-a000-000000000001/x/y.webp') $$,
  '42501', null, 'fã não envia mídia de post');
select lives_ok(
  $$ insert into public.follows (follower_id, creator_id) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  'fã segue criador aprovado');
select throws_ok(
  $$ insert into public.follows (follower_id, creator_id) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003') $$,
  '42501', null, 'fã não segue quem não é criador');
select throws_ok(
  $$ insert into public.follows (follower_id, creator_id) values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'fã não cria follow em nome de outro');
select lives_ok(
  $$ insert into public.post_likes (post_id, user_id) values ('22222222-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001') $$,
  'fã curte post visível');
select throws_ok(
  $$ insert into public.post_likes (post_id, user_id) values ('22222222-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'fã não curte rascunho');
select lives_ok(
  $$ insert into public.post_comments (post_id, author_id, body) values ('22222222-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'Lindo!') $$,
  'fã comenta post visível');
select lives_ok(
  $$ insert into public.reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-4000-a000-000000000001', 'post', '22222222-0000-4000-a000-000000000002', 'spam') $$,
  'fã denuncia post');
select throws_ok(
  $$ select public.decide_report((select id from public.reports limit 1), 'resolved', 'tentativa de fã', true) $$,
  '42501', null, 'fã não decide denúncia');
reset role;

-- Bloqueio: criador bloqueia o fã → card some para o fã.
insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001');
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.feed_posts where creator_id = '00000000-0000-4000-a000-000000000002'), 0,
  'bloqueio esconde os posts do criador');
reset role;
delete from public.user_blocks;

-- Criador -----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.posts), 3, 'criador lê os próprios posts, inclusive rascunho');
select is((select count(*)::int from public.post_media_for('22222222-0000-4000-a000-000000000002')), 1,
  'criador vê a própria mídia PPV');
select throws_ok(
  $$ update public.posts set status = 'removed' where id = '22222222-0000-4000-a000-000000000001' $$,
  '42501', null, 'criador não marca o próprio post como removido');
select throws_ok(
  $$ update public.posts set removed_reason = 'x' where id = '22222222-0000-4000-a000-000000000001' $$,
  '42501', null, 'criador não altera colunas de moderação');
reset role;

-- Moderação ---------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000003', 'aal1');
select throws_ok(
  $$ select public.decide_report((select id from public.reports limit 1), 'resolved', 'sem mfa', true) $$,
  '42501', null, 'moderador sem MFA não decide denúncia');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000003', 'aal2');
select lives_ok(
  $$ select public.decide_report((select id from public.reports limit 1), 'resolved', 'Conteúdo viola a política', true) $$,
  'moderador com MFA decide e retira o post');
reset role;
select is((select status::text from public.posts where id = '22222222-0000-4000-a000-000000000002'), 'removed',
  'post denunciado ficou removido');
select ok(exists (select 1 from public.admin_audit_logs where action = 'post.remove'
                  and target_id = '22222222-0000-4000-a000-000000000002'), 'retirada registrada na auditoria');

select * from finish();
rollback;
