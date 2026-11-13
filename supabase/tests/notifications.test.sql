-- S6: notificações por gatilho + fila de e-mail com preferências.
-- Usuários do seed.sql: fan ...001, criador ...002, moderador ...003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
end; $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end; $$;

delete from public.notifications;
delete from public.notification_prefs;
delete from public.ledger_lines;
delete from public.ledger_entries;
delete from public.entitlements;
delete from public.subscriptions;
delete from public.payment_events;
delete from public.orders;
delete from public.messages;
delete from public.conversations;
delete from public.follows;
delete from public.posts where creator_id = '00000000-0000-4000-a000-000000000002';
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.creator_commission_acceptances (creator_id, rule_id)
  select '00000000-0000-4000-a000-000000000002', id from public.commission_rules where version = 1 on conflict do nothing;
update public.profiles set dm_policy = 'everyone' where id = '00000000-0000-4000-a000-000000000002';

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, service_role;

-- Mimo pago → criador notificado, com e-mail na fila ------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
insert into ids select 'tip', public.create_order('tip', '00000000-0000-4000-a000-000000000002', 1000, 'pix', 'notif-tip-001');
reset role;
select pg_temp.as_service();
select public.prepare_order_charge((select v from ids where k = 'tip'), 'simulado');
select public.attach_order_charge((select v from ids where k = 'tip'), 'simulado', 'sim-notif-1');
select public.confirm_payment('simulado', 'evt-notif-1', 'sim-notif-1', 'paid', '{}'::jsonb);
reset role;
select results_eq(
  $$ select kind, email_status, link from public.notifications where user_id = '00000000-0000-4000-a000-000000000002' $$,
  $$ values ('tip', 'pending', '/estudio/extrato') $$,
  'mimo pago notifica o criador e coloca o e-mail na fila');
select ok((select title from public.notifications where kind = 'tip') like '%mimo de R$ 10,00%',
  'título traz quem enviou e o valor');

-- Preferência desligada → notificação sem e-mail -----------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.set_notification_prefs(false, true, true, true) $$, 'criador desliga e-mail de vendas');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
insert into ids select 'tip2', public.create_order('tip', '00000000-0000-4000-a000-000000000002', 1000, 'pix', 'notif-tip-002');
reset role;
select pg_temp.as_service();
select public.prepare_order_charge((select v from ids where k = 'tip2'), 'simulado');
select public.attach_order_charge((select v from ids where k = 'tip2'), 'simulado', 'sim-notif-2');
select public.confirm_payment('simulado', 'evt-notif-2', 'sim-notif-2', 'paid', '{}'::jsonb);
reset role;
select is((select email_status from public.notifications where kind = 'tip' order by id desc limit 1), 'none',
  'com a preferência desligada, só notifica no site');

-- Mensagens: só a 1ª não lida gera notificação ---------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
insert into ids select 'conv', public.start_conversation('00000000-0000-4000-a000-000000000002');
select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'primeira');
select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'segunda');
reset role;
select is((select count(*)::int from public.notifications where kind = 'message'), 1,
  'duas mensagens seguidas geram uma notificação');
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select public.mark_conversation_read((select v from ids where k = 'conv'));
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'terceira');
reset role;
select is((select count(*)::int from public.notifications where kind = 'message'), 2,
  'depois de ler, a próxima mensagem notifica de novo');

-- Novo post → assinante ativo; seguidor → criador -------------------------------------------
insert into public.subscriptions (fan_id, creator_id, price_cents, status, current_period_end)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 2990, 'active', now() + interval '10 days');
insert into public.posts (id, creator_id, body, visibility, status, content_attested_at)
values ('77777777-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'Post novo!', 'free', 'published', now());
select is((select count(*)::int from public.notifications where kind = 'new_post' and user_id = '00000000-0000-4000-a000-000000000001'), 1,
  'novo post notifica o assinante');
select is((select email_status from public.notifications where kind = 'new_post'), 'none', 'novo post é só no site');
insert into public.follows (follower_id, creator_id) values ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.notifications where kind = 'new_follower'), 1, 'novo seguidor notifica o criador');

-- Renovação recusada → fã notificado -------------------------------------------------------------
update public.subscriptions set provider = 'simulado', provider_subscription_id = 'sub-notif'
 where fan_id = '00000000-0000-4000-a000-000000000001';
update public.subscriptions set last_order_id = (select v from ids where k = 'tip')
 where fan_id = '00000000-0000-4000-a000-000000000001';
select pg_temp.as_service();
insert into ids select 'ren', public.create_renewal_order('simulado', 'sim-ren-1', 'sub-notif');
select public.confirm_payment('simulado', 'evt-ren-1', 'sim-ren-1', 'failed', '{}'::jsonb);
reset role;
select results_eq(
  $$ select kind, email_status from public.notifications where user_id = '00000000-0000-4000-a000-000000000001' and kind = 'payment_failed' $$,
  $$ values ('payment_failed', 'pending') $$,
  'renovação recusada avisa o fã por e-mail');

-- Privacidade e leitura -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.notifications), 0, 'cada um só vê as próprias notificações');
select throws_ok($$ insert into public.notifications (user_id, kind, title, link) values (auth.uid(), 'sale', 'x', '/x') $$,
  '42501', null, 'usuário não cria notificação direto');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.mark_notifications_read() $$, 'marca todas como lidas');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'nenhuma não lida depois');
reset role;

select * from finish();
rollback;
