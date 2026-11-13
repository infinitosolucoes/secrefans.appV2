-- Planos por período e promoção (1º período com desconto, vagas reais, renovação ao preço normal).
-- Usuários do seed.sql: fan ...001, criador ...002, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end; $$;

delete from public.ledger_lines;
delete from public.ledger_entries;
delete from public.entitlements;
delete from public.subscriptions;
delete from public.payment_events;
delete from public.orders;
delete from public.subscription_promotions;
delete from public.subscription_plans;
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.creator_commission_acceptances (creator_id, rule_id)
  select '00000000-0000-4000-a000-000000000002', id from public.commission_rules where version = 1
  on conflict do nothing;
update public.profiles set subscription_price_cents = 10000 where id = '00000000-0000-4000-a000-000000000002';

-- Criador define planos e promoção ------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.set_subscription_plans('[{"months":3,"discount_bps":1500}]') $$, '42501', null,
  'fã não define planos');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.set_subscription_plans('[{"months":2,"discount_bps":1500}]') $$, '22023', null,
  'período fora de 3, 6 e 12 é recusado');
select throws_ok($$ select public.set_subscription_plans('[{"months":3,"discount_bps":7000}]') $$, '22023', null,
  'desconto de plano acima de 60% é recusado');
select lives_ok($$ select public.set_subscription_plans('[{"months":3,"discount_bps":1500},{"months":6,"discount_bps":4000}]') $$,
  'criador ativa trimestral (15%) e semestral (40%)');
select throws_ok($$ select public.start_subscription_promotion(12, 8000, 'oi', now() + interval '2 days', 5) $$, '22023', null,
  'promoção exige o plano do período ativo');
select throws_ok($$ select public.start_subscription_promotion(1, 8000, 'oi', now() + interval '90 days', 5) $$, '22023', null,
  'promoção dura no máximo 60 dias');
select lives_ok($$ select public.start_subscription_promotion(1, 8000, '80% de desconto, últimas vagas!', now() + interval '2 days', 1) $$,
  'criador abre promoção de 80% no mensal com 1 vaga');
reset role;

-- Visitante vê as opções (preços calculados no banco)
select pg_temp.as_anon();
select results_eq(
  $$ select months, regular_cents, promo_cents, promo_left from public.creator_subscription_options('00000000-0000-4000-a000-000000000002') $$,
  $$ values (1, 10000, 2000, 1), (3, 25500, null::integer, null::integer), (6, 36000, null::integer, null::integer) $$,
  'mensal R$ 100 (promo R$ 20, 1 vaga), trimestral R$ 255, semestral R$ 360');
reset role;

-- Fã assina com a promoção -------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.create_subscription_order('00000000-0000-4000-a000-000000000002', 12, false, 'pix', 'plan-x') $$,
  'P0002', null, 'plano não oferecido é recusado');
create temp table t_o as
  select public.create_subscription_order('00000000-0000-4000-a000-000000000002', 1, true, 'pix', 'plan-promo-1') as id;
grant select on t_o to authenticated, service_role;
reset role;
select results_eq(
  $$ select gross_cents, renewal_price_cents, period_months, description from public.orders where id = (select id from t_o) $$,
  $$ values (2000, 10000, 1::smallint, 'Assinatura mensal (promoção)') $$,
  'pedido com preço promocional e preço de renovação normal');

select pg_temp.as_service();
select public.attach_order_charge((select id from t_o), 'simulado', 'sim_plan_1', 'sub_plan_1');
select is(public.confirm_payment('simulado', 'evt_plan_1', 'sim_plan_1', 'paid'), 'paid', 'pagamento confirmado');
reset role;
select results_eq(
  $$ select price_cents, period_months, current_period_end::date from public.subscriptions
      where fan_id = '00000000-0000-4000-a000-000000000001' $$,
  $$ values (10000, 1::smallint, (now() + interval '1 month')::date) $$,
  'assinatura renova ao preço normal; acesso por 1 mês do calendário');
select results_eq(
  $$ select redemptions, ended_at is not null from public.subscription_promotions $$,
  $$ values (1, true) $$, 'vaga consumida e promoção encerrada ao esgotar');
select pg_temp.as_anon();
select is((select count(*)::int from public.creator_subscription_options('00000000-0000-4000-a000-000000000002') where promo_id is not null), 0,
  'promoção esgotada some das opções');
reset role;

-- Renovação: preço normal, mesmo período
select pg_temp.as_service();
select isnt(public.create_renewal_order('simulado', 'sim_plan_2', 'sub_plan_1'), null, 'cobrança da renovação vira pedido');
reset role;
select results_eq(
  $$ select gross_cents, period_months, description from public.orders where provider_ref = 'sim_plan_2' $$,
  $$ values (10000, 1::smallint, 'Assinatura mensal (renovação)') $$,
  'renovação cobra o preço normal');

-- Termos de renovação para o provedor (valor e líquido do criador)
select pg_temp.as_service();
select results_eq($$ select renewal_cents from public.subscription_renewal_terms((select id from t_o)) $$,
  $$ values (10000) $$, 'servidor obtém o valor de renovação');
reset role;

-- Trimestral sem promoção: 3 meses de acesso
delete from public.subscriptions;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_q as
  select public.create_subscription_order('00000000-0000-4000-a000-000000000002', 3, false, 'pix', 'plan-q-1') as id;
grant select on t_q to service_role;
select throws_ok($$ select public.create_subscription_order('00000000-0000-4000-a000-000000000002', 1, true, 'pix', 'plan-promo-2') $$,
  'P0002', null, 'promoção encerrada não é aceita');
reset role;
select pg_temp.as_service();
select public.attach_order_charge((select id from t_q), 'simulado', 'sim_plan_q', 'sub_plan_q');
select public.confirm_payment('simulado', 'evt_plan_q', 'sim_plan_q', 'paid');
reset role;
select results_eq(
  $$ select price_cents, period_months, current_period_end::date from public.subscriptions
      where fan_id = '00000000-0000-4000-a000-000000000001' $$,
  $$ values (25500, 3::smallint, (now() + interval '3 months')::date) $$,
  'trimestral: R$ 255 e 3 meses de acesso');

select * from finish();
rollback;
