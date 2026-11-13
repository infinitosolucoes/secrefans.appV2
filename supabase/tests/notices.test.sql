-- Avisos novos (curtida, comentário, verificação, assinatura acabando) e declaração na mensagem em massa.
-- Usuários do seed.sql: fan ...001, criador ...002, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create or replace function pg_temp.as_user(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  execute 'set local role authenticated';
end; $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end; $$;

delete from public.notifications;
delete from public.notification_prefs;
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.posts (id, creator_id, body, visibility, status, content_attested_at)
values ('99999999-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'post', 'free', 'published', now());

-- Curtida ----------------------------------------------------------------------------------------
insert into public.post_likes (post_id, user_id) values
  ('99999999-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.notifications where kind = 'like' and user_id = '00000000-0000-4000-a000-000000000002'), 1,
  'curtida avisa o criador');
insert into public.post_likes (post_id, user_id) values
  ('99999999-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.notifications where kind = 'like'), 1,
  'nova curtida não repete o aviso enquanto o anterior não foi lido');
select is((select email_status from public.notifications where kind = 'like'), 'none', 'curtida é só no site');
insert into public.post_likes (post_id, user_id) values
  ('99999999-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.notifications where kind = 'like'), 1, 'curtir o próprio post não avisa');

-- Comentário (com preferência desligada) -----------------------------------------------------------
insert into public.post_comments (post_id, author_id, body) values
  ('99999999-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'Que lindo!');
select is((select body from public.notifications where kind = 'comment'), 'Que lindo!', 'comentário avisa o criador com o texto');
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.set_notification_prefs(true, true, true, true, false) $$, 'criador desliga avisos de curtidas e comentários');
reset role;
insert into public.post_comments (post_id, author_id, body) values
  ('99999999-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'De novo');
select is((select count(*)::int from public.notifications where kind = 'comment'), 1, 'preferência desligada: sem novo aviso');

-- Verificação -------------------------------------------------------------------------------------------
delete from public.creator_verifications where user_id = '00000000-0000-4000-a000-000000000001';
insert into public.creator_verifications (id, user_id, legal_name, birth_date, document_front_path, selfie_path)
values ('99999999-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'Fã Teste', '1990-01-01', 'a/doc.jpg', 'a/selfie.jpg');
update public.creator_verifications set status = 'rejected', decided_at = now(), decision_reason = 'documento ilegível'
 where id = '99999999-0000-4000-a000-000000000002';
select results_eq(
  $$ select title, body, email_status from public.notifications where kind = 'verification' $$,
  $$ values ('Sua verificação não foi aprovada', 'Motivo: documento ilegível', 'pending') $$,
  'recusa da verificação avisa com o motivo e por e-mail');

-- Assinatura acabando -------------------------------------------------------------------------------------
delete from public.subscriptions where fan_id = '00000000-0000-4000-a000-000000000001';
insert into public.subscriptions (fan_id, creator_id, price_cents, status, current_period_end, cancel_at_period_end)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 2990, 'active', now() + interval '2 days', true);
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.notify_expiring_subscriptions() $$, '42501', null, 'só o servidor roda o aviso de vencimento');
reset role;
select pg_temp.as_service();
select is(public.notify_expiring_subscriptions(), 1, 'assinatura cancelada que acaba em 2 dias gera aviso');
select is(public.notify_expiring_subscriptions(), 0, 'não repete o aviso no mesmo período');
reset role;
select is((select email_status from public.notifications where kind = 'subscription_expiring'), 'pending',
  'aviso de vencimento vai por e-mail');
update public.subscriptions set cancel_at_period_end = false, provider_subscription_id = 'sub_x', expiry_notified_at = null
 where fan_id = '00000000-0000-4000-a000-000000000001';
select pg_temp.as_service();
select is(public.notify_expiring_subscriptions(), 0, 'assinatura que renova sozinha no provedor não gera aviso');
reset role;

-- Declaração na mensagem em massa ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.send_broadcast('99999999-0000-4000-a000-000000000003', 'foto nova', null,
  jsonb_build_array(jsonb_build_object('kind','image','path',
    '00000000-0000-4000-a000-000000000002/messages/99999999-0000-4000-a000-000000000003/99999999-0000-4000-a000-000000000004.webp'))) $$,
  '22023', null, 'mídia em massa sem a declaração é recusada');
reset role;

select * from finish();
rollback;
