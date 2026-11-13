-- S6: saques do criador (chave Pix, saldo disponível com retenção, aprovação e liquidação no ledger).
-- Usuários do seed.sql: fan ...001, criador ...002, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
delete from public.withdrawals;
delete from public.creator_pix_keys;
delete from public.entitlements;
delete from public.subscriptions;
delete from public.payment_events;
delete from public.orders;
delete from public.notifications;
delete from public.commission_rules where version > 1;
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.creator_commission_acceptances (creator_id, rule_id)
  select '00000000-0000-4000-a000-000000000002', id from public.commission_rules where version = 1
  on conflict do nothing;
delete from public.creator_verifications where user_id = '00000000-0000-4000-a000-000000000002';

-- Duas vendas de mimo (R$ 100 cada, Pix): uma antiga (liberada) e uma recente (retida).
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_ord as
  select 1 as n, public.create_order('tip', '00000000-0000-4000-a000-000000000002', 10000, 'pix', 'payout-tip-001') as id
  union all
  select 2, public.create_order('tip', '00000000-0000-4000-a000-000000000002', 10000, 'pix', 'payout-tip-002');
grant select on t_ord to authenticated, service_role;
reset role;
select pg_temp.as_service();
select public.prepare_order_charge(id, 'asaas') from t_ord;
select public.attach_order_charge(id, 'asaas', 'pay_payout_' || n) from t_ord;
select public.confirm_payment('asaas', 'evt_payout_' || n, 'pay_payout_' || n, 'paid', '{}'::jsonb, 9801) from t_ord;
reset role;
update public.orders set paid_at = now() - interval '10 days' where id = (select id from t_ord where n = 1);

-- Saldo: R$ 88,01 por venda (100 − 10 − 1,99); a recente fica retida 7 dias.
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select results_eq(
  $$ select balance_cents, held_cents, reserved_cents, available_cents, min_cents from public.creator_payout_summary() $$,
  $$ values (17602::bigint, 8801::bigint, 0::bigint, 8801::bigint, 2000) $$,
  'saldo 176,02 · retido 88,01 (venda recente) · disponível 88,01 · mínimo 20,00');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select * from public.creator_payout_summary('00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'fã não vê o saldo do criador');
select throws_ok($$ select public.set_payout_pix_key('email', 'fa@exemplo.com') $$,
  '42501', null, 'fã não cadastra chave de saque');
reset role;

-- Chave Pix ----------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.set_payout_pix_key('cpf', '123') $$, '22023', null, 'CPF com formato inválido é recusado');
select throws_ok($$ select public.set_payout_pix_key('phone', '11999998888') $$, '22023', null, 'telefone sem +55 é recusado');
select throws_ok($$ select public.request_withdrawal(5000) $$, '42501', null,
  'sem verificação de identidade aprovada, não saca');
reset role;
insert into public.creator_verifications (user_id, status, legal_name, birth_date, document_front_path, selfie_path,
  decided_at, decision_reason)
values ('00000000-0000-4000-a000-000000000002', 'approved', 'Criador Teste', '1990-01-01', 'x/doc.jpg', 'x/selfie.jpg',
  now(), 'ok');

select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.request_withdrawal(5000) $$, '55000', null, 'sem chave Pix, não saca');
select lives_ok($$ select public.set_payout_pix_key('email', 'criador@exemplo.com') $$, 'criador cadastra chave Pix (e-mail)');
reset role;
select is((select email_status from public.notifications where user_id = '00000000-0000-4000-a000-000000000002' and kind = 'payout'),
  'pending', 'troca de chave sempre avisa por e-mail');

-- Pedido de saque ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.request_withdrawal(1999) $$, '22023', null, 'abaixo do mínimo é recusado');
select throws_ok($$ select public.request_withdrawal(8802) $$, '22023', null, 'acima do disponível é recusado (retido não conta)');
create temp table t_w as select public.request_withdrawal(5000) as id;
grant select on t_w to authenticated, service_role;
select results_eq($$ select reserved_cents, available_cents from public.creator_payout_summary() $$,
  $$ values (5000::bigint, 3801::bigint) $$, 'saque aberto reserva o valor');
select throws_ok($$ select public.request_withdrawal(2000) $$, '55000', null, 'um saque aberto por vez');
select throws_ok($$ select public.set_payout_pix_key('email', 'outro@exemplo.com') $$, '55000', null,
  'não troca a chave com saque em andamento');
reset role;

-- Decisão do financeiro -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000004');
select throws_ok($$ select public.decide_withdrawal((select id from t_w), true, null) $$, '42501', null,
  'sem MFA (aal1) não aprova');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002', 'aal2');
select throws_ok($$ select public.decide_withdrawal((select id from t_w), true, null) $$, '42501', null,
  'criador não aprova saque');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal2');
select is((select status from public.decide_withdrawal((select id from t_w), true, null)), 'processing',
  'super admin com MFA aprova → processando');
reset role;
select pg_temp.as_service();
select lives_ok($$ select public.attach_withdrawal_transfer((select id from t_w), 'asaas', 'tr_123') $$,
  'servidor vincula a transferência');
select is(public.settle_withdrawal((select id from t_w), 'paid', 0), 'ok', 'provedor confirma o Pix');
select is(public.settle_withdrawal((select id from t_w), 'paid', 0), 'duplicate', 'confirmação repetida é ignorada');
reset role;

select results_eq(
  $$ select l.account_code, l.debit_cents, l.credit_cents from public.ledger_lines l
       join public.ledger_entries e on e.id = l.entry_id
      where e.withdrawal_id = (select id from t_w) order by l.account_code $$,
  $$ values ('creator_payable:00000000-0000-4000-a000-000000000002', 5000, 0),
            ('provider_clearing:asaas', 0, 5000) $$,
  'saque pago: D criador / C clearing');
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select results_eq($$ select balance_cents, reserved_cents, available_cents from public.creator_payout_summary() $$,
  $$ values (12602::bigint, 0::bigint, 3801::bigint) $$, 'saldo cai R$ 50 e a reserva é liberada');
reset role;

-- Recusa devolve o valor; falha não lança no ledger.
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
create temp table t_w2 as select public.request_withdrawal(3000) as id;
grant select on t_w2 to authenticated, service_role;
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal2');
select throws_ok($$ select public.decide_withdrawal((select id from t_w2), false, '') $$, '22023', null,
  'recusar exige justificativa');
select is((select status from public.decide_withdrawal((select id from t_w2), false, 'chave de terceiro')), 'rejected',
  'financeiro recusa com motivo');
reset role;
select is((select count(*)::int from public.ledger_entries where withdrawal_id = (select id from t_w2)), 0,
  'saque recusado não lança no ledger');

select * from finish();
rollback;
