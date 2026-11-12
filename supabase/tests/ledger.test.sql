-- S5: taxa estimada paga pelo criador, ledger de partidas dobradas, renovação pelo provedor.
-- Usuários do seed.sql: fan ...001, criador ...002, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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
delete from public.ledger_lines;
delete from public.ledger_entries;
delete from public.entitlements;
delete from public.subscriptions;
delete from public.payment_events;
delete from public.orders;
delete from public.commission_rules where version > 1;
delete from public.posts where creator_id = '00000000-0000-4000-a000-000000000002';
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.creator_commission_acceptances (creator_id, rule_id)
  select '00000000-0000-4000-a000-000000000002', id from public.commission_rules where version = 1
  on conflict do nothing;
update public.profiles set subscription_price_cents = 2990 where id = '00000000-0000-4000-a000-000000000002';
insert into public.posts (id, creator_id, body, visibility, price_cents, status) values
  ('66666666-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000002', 'ppv s5', 'ppv', 1990, 'published');

-- Pedido PPV por Pix no Asaas -----------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_ord as
  select public.create_order('ppv', '66666666-0000-4000-a000-000000000011', null, 'pix', 'ledger-ppv-001') as id;
grant select on t_ord to authenticated, service_role;
select throws_ok($$ select public.prepare_order_charge((select id from t_ord), 'asaas') $$,
  '42501', null, 'fã não prepara cobrança (só o servidor)');
select throws_ok($$ select public.register_payout_account('00000000-0000-4000-a000-000000000001', 'asaas', 'acc', 'w', 'approved', '1234') $$,
  '42501', null, 'fã não registra conta de recebimento');
reset role;

select pg_temp.as_service();
select is(public.prepare_order_charge((select id from t_ord), 'asaas'), 1592,
  'líquido do criador = R$ 19,90 − 10% (R$ 1,99) − taxa Pix estimada (R$ 1,99) = R$ 15,92');
select lives_ok($$ select public.attach_order_charge((select id from t_ord), 'asaas', 'pay_ppv_1') $$,
  'servidor vincula a cobrança do Asaas');
-- Taxa real R$ 2,10 (net R$ 17,80): R$ 0,11 acima da estimada, absorvido pela plataforma.
select is(public.confirm_payment('asaas', 'evt_s5_1', 'pay_ppv_1', 'paid', '{}'::jsonb, 1780), 'paid',
  'pagamento confirmado com o líquido real do provedor');
reset role;

select results_eq(
  $$ select external_fees_cents, actual_fee_cents, creator_net_cents from public.orders where id = (select id from t_ord) $$,
  $$ values (199, 210, 1592) $$, 'pedido guarda a taxa estimada, a real e o líquido do criador');
select results_eq(
  $$ select l.account_code, l.debit_cents, l.credit_cents from public.ledger_lines l
       join public.ledger_entries e on e.id = l.entry_id
      where e.order_id = (select id from t_ord) and e.kind = 'sale' order by l.account_code $$,
  $$ values ('creator_payable:00000000-0000-4000-a000-000000000002', 0, 1592),
            ('fee_variance', 11, 0),
            ('platform_revenue', 0, 199),
            ('provider_clearing:asaas', 1780, 0) $$,
  'venda: D clearing R$ 17,80 = C criador R$ 15,92 + C plataforma R$ 1,99 − variação R$ 0,11');
select is((select sum(debit_cents) - sum(credit_cents) from public.ledger_lines)::int, 0,
  'ledger inteiro balanceado');

-- Evento duplicado não lança de novo
select pg_temp.as_service();
select is(public.confirm_payment('asaas', 'evt_s5_1', 'pay_ppv_1', 'paid', '{}'::jsonb, 1780), 'duplicate',
  'evento repetido é descartado');
reset role;
select is((select count(*)::int from public.ledger_entries where order_id = (select id from t_ord)), 1,
  'um único lançamento por venda');

-- Imutabilidade e balanço obrigatório
select throws_ok($$ update public.ledger_lines set credit_cents = 1 where account_code = 'platform_revenue' $$,
  '42501', null, 'linha do ledger não pode ser alterada');
select throws_ok($$ update public.ledger_entries set memo = 'x' $$, '42501', null, 'lançamento não pode ser alterado');
set constraints all immediate;
select throws_ok(
  $$ with e as (insert into public.ledger_entries (order_id, kind) values ((select id from t_ord), 'chargeback') returning id)
     insert into public.ledger_lines (entry_id, account_code, debit_cents) select id, 'platform_revenue', 100 from e $$,
  '23514', null, 'lançamento desbalanceado é recusado');
set constraints all deferred;

-- Visibilidade
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is((select balance_cents::int from public.creator_balance), 1592, 'criador vê o próprio saldo a repassar');
select is((select count(*)::int from public.ledger_lines), 0, 'criador não lê o ledger da plataforma');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.creator_balance), 0, 'fã não vê saldo de criador');
select is((select count(*)::int from public.ledger_entries), 0, 'fã não lê o ledger');
reset role;

-- Estorno: lançamento inverso e saldo do criador volta a zero
select pg_temp.as_service();
select is(public.confirm_payment('asaas', 'evt_s5_2', 'pay_ppv_1', 'refunded', '{}'::jsonb), 'refunded', 'estorno aplicado');
reset role;
select is((select count(*)::int from public.ledger_entries where order_id = (select id from t_ord) and kind = 'refund'), 1,
  'estorno gera lançamento de reversão');
select is((select coalesce(sum(credit_cents) - sum(debit_cents), 0)::int from public.ledger_lines
            where account_code = 'creator_payable:00000000-0000-4000-a000-000000000002'), 0,
  'saldo do criador volta a zero após o estorno');
select is((select count(*)::int from public.entitlements where order_id = (select id from t_ord) and revoked_at is null), 0,
  'estorno revoga o acesso');

-- Assinatura no Asaas e renovação com a regra vigente ------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_sub as
  select public.create_order('subscription', '00000000-0000-4000-a000-000000000002', null, 'card', 'ledger-sub-001') as id;
grant select on t_sub to authenticated, service_role;
reset role;
select pg_temp.as_service();
select public.prepare_order_charge((select id from t_sub), 'asaas');
select public.attach_order_charge((select id from t_sub), 'asaas', 'pay_sub_1', 'sub_abc');
select is(public.create_renewal_order('asaas', 'pay_sub_x', 'sub_desconhecida'), null,
  'cobrança de assinatura desconhecida não cria pedido');
select public.confirm_payment('asaas', 'evt_s5_3', 'pay_sub_1', 'paid', '{}'::jsonb, 2840);
reset role;
select is((select provider_subscription_id from public.subscriptions
            where fan_id = '00000000-0000-4000-a000-000000000001' and creator_id = '00000000-0000-4000-a000-000000000002'),
  'sub_abc', 'assinatura guarda o vínculo com o provedor');

-- Nova regra (15%) vigente: a renovação usa a regra da data da renovação.
insert into public.commission_rules (version, rate_bps, effective_from, status, reason, decided_at)
values (2, 1500, now() - interval '1 second', 'approved', 'teste de renovação', now());
select pg_temp.as_service();
create temp table t_ren as select public.create_renewal_order('asaas', 'pay_sub_2', 'sub_abc') as id;
reset role;
select results_eq(
  $$ select commission_bps, commission_cents, renewal_of is not null, provider_ref from public.orders where id = (select id from t_ren) $$,
  $$ values (1500, 449, true, 'pay_sub_2') $$,
  'renovação usa a regra vigente (15%) e aponta para o pedido anterior');
select pg_temp.as_service();
select is(public.create_renewal_order('asaas', 'pay_sub_2', 'sub_abc'), (select id from t_ren),
  'renovação é idempotente pela cobrança');
reset role;

-- Taxa estimada: só staff com MFA
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.set_payment_fee('asaas', 'pix', 50, 0, 'teste de taxa') $$, '42501', null,
  'fã não altera taxa');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal1');
select throws_ok($$ select public.set_payment_fee('asaas', 'pix', 50, 0, 'teste de taxa') $$, '42501', null,
  'super admin sem MFA não altera taxa');
reset role;

select * from finish();
rollback;
