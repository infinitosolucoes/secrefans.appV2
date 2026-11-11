-- S4: comissão versionada, pedidos, confirmação idempotente, assinaturas e PPV (spec M06, M07, M17).
-- Usuários do seed.sql: fan ...001, criador ...002, moderador ...003, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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

-- Estado limpo (desfeito no rollback) ----------------------------------------------
delete from public.entitlements;
delete from public.subscriptions;
delete from public.payment_events;
delete from public.orders;
delete from public.creator_commission_acceptances;
delete from public.commission_rules where version > 1;
delete from public.posts where creator_id = '00000000-0000-4000-a000-000000000002';
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
update public.profiles set subscription_price_cents = 2990 where id = '00000000-0000-4000-a000-000000000002';
insert into public.posts (id, creator_id, body, visibility, price_cents, status) values
  ('66666666-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'ppv', 'ppv', 1990, 'published'),
  ('66666666-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', 'assinantes', 'subscribers', null, 'published');
insert into public.post_media (post_id, creator_id, storage_path) values
  ('66666666-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/66666666-0000-4000-a000-000000000001/77777777-0000-4000-a000-000000000001.webp'),
  ('66666666-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-a000-000000000002/66666666-0000-4000-a000-000000000002/77777777-0000-4000-a000-000000000002.webp');

-- Regra vigente -------------------------------------------------------------------
select is((public.current_commission_rule()).rate_bps, 1000, 'regra vigente inicial é 10%');

-- Criador sem aceite não vende ------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok(
  $$ select public.create_order('ppv', '66666666-0000-4000-a000-000000000001', null, 'pix', 'pedido-0001') $$,
  'P0001', null, 'criador sem ciência da regra ainda não vende');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok(
  $$ select public.accept_commission_rule((select id from public.commission_rules where version = 1)) $$,
  '42501', null, 'fã não aceita regra de criador');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select lives_ok(
  $$ select public.accept_commission_rule((select id from public.commission_rules where version = 1)) $$,
  'criador dá ciência da regra vigente');
reset role;

-- Pedido PPV: preço e comissão calculados no banco ------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_ord as
  select public.create_order('ppv', '66666666-0000-4000-a000-000000000001', 99999, 'pix', 'pedido-ppv-001') as id;
grant select on t_ord to authenticated, service_role;
select results_eq(
  $$ select gross_cents, commission_bps, commission_cents, creator_net_cents, status::text from public.orders where id = (select id from t_ord) $$,
  $$ values (1990, 1000, 199, 1791, 'pending') $$,
  'PPV R$ 19,90: valor do banco (ignora o informado), comissão 10% = R$ 1,99, criador R$ 17,91');
select is(public.create_order('ppv', '66666666-0000-4000-a000-000000000001', null, 'pix', 'pedido-ppv-001'),
  (select id from t_ord), 'mesma chave de idempotência devolve o mesmo pedido');
select throws_ok(
  $$ select public.confirm_payment('simulado', 'evt-1', 'ref-1', 'paid', '{}'::jsonb) $$,
  '42501', null, 'fã não confirma pagamento (só o servidor)');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000001')), 0,
  'antes do pagamento a mídia PPV segue bloqueada');
select throws_ok(
  $$ update public.orders set status = 'paid' where id = (select id from t_ord) $$,
  '42501', null, 'fã não altera o próprio pedido');
reset role;

-- Confirmação pelo servidor (service_role) -------------------------------------------
select pg_temp.as_service();
select lives_ok($$ select public.attach_order_charge((select id from t_ord), 'simulado', 'ref-ppv-1') $$,
  'servidor vincula a cobrança');
select is(public.confirm_payment('simulado', 'evt-ppv-1', 'ref-ppv-1', 'paid', '{}'::jsonb), 'paid', 'webhook confirma o pagamento');
select is(public.confirm_payment('simulado', 'evt-ppv-1', 'ref-ppv-1', 'paid', '{}'::jsonb), 'duplicate',
  'webhook duplicado não processa de novo');
reset role;
select is((select count(*)::int from public.entitlements where order_id = (select id from t_ord)), 1,
  'um único acesso liberado mesmo com evento duplicado');

select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000001')), 1,
  'comprador vê a mídia PPV');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000002')), 0,
  'comprar PPV não libera post de assinantes');
select throws_ok(
  $$ select public.create_order('ppv', '66666666-0000-4000-a000-000000000001', null, 'pix', 'pedido-ppv-002') $$,
  '23505', null, 'não compra duas vezes o mesmo PPV');
select throws_ok(
  $$ select public.create_order('tip', '00000000-0000-4000-a000-000000000002', 100, 'pix', 'gorjeta-baixa') $$,
  '22023', null, 'gorjeta abaixo de R$ 5 é recusada');
reset role;

-- Moderador (outro usuário) não vê a mídia comprada pelo fã sem MFA --------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000001')), 0,
  'acesso comprado é individual');
select is((select count(*)::int from public.orders), 0, 'terceiro não lê pedidos alheios');
reset role;

-- Assinatura ------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_sub as
  select public.create_order('subscription', '00000000-0000-4000-a000-000000000002', null, 'card', 'assinatura-001') as id;
grant select on t_sub to authenticated, service_role;
reset role;
select pg_temp.as_service();
select public.attach_order_charge((select id from t_sub), 'simulado', 'ref-sub-1');
select is(public.confirm_payment('simulado', 'evt-sub-1', 'ref-sub-1', 'paid', '{}'::jsonb), 'paid', 'assinatura paga');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000002')), 1,
  'assinante vê post de assinantes');
select lives_ok($$ select public.cancel_subscription('00000000-0000-4000-a000-000000000002') $$, 'fã cancela a assinatura');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000002')), 1,
  'cancelamento respeita a vigência já paga');
reset role;

-- Estorno revê o acesso ---------------------------------------------------------------
select pg_temp.as_service();
select is(public.confirm_payment('simulado', 'evt-ppv-2', 'ref-ppv-1', 'chargeback', '{}'::jsonb), 'chargeback', 'chargeback recebido');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.post_media_for('66666666-0000-4000-a000-000000000001')), 0,
  'chargeback revoga o acesso ao PPV');
reset role;

-- Mudança de taxa: sem retroatividade e com segunda aprovação --------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal1');
select throws_ok($$ select public.propose_commission_rule(1500, now() + interval '1 day', true, 'sem mfa') $$,
  '42501', null, 'proposta exige MFA');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal2');
select throws_ok($$ select public.propose_commission_rule(1500, now() - interval '1 day', true, 'retroativa') $$,
  '22023', null, 'taxa retroativa é recusada');
select is(public.propose_commission_rule(1500, now() + interval '1 day', true, 'Reajuste planejado'), 2, 'super admin propõe 15%');
select throws_ok($$ select public.decide_commission_rule((select id from public.commission_rules where version = 2), true, 'eu mesmo') $$,
  '42501', null, 'quem propôs não aprova a própria proposta');
reset role;
select is((select commission_bps from public.orders where id = (select id from t_ord)), 1000,
  'pedido anterior mantém a taxa original');

select * from finish();
rollback;
