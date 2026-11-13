-- Mimo com mensagem: gravada no pedido pendente e entregue no chat só depois do pagamento.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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

delete from public.user_blocks;
delete from public.conversations where creator_id = '00000000-0000-4000-a000-000000000002';
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.creator_commission_acceptances (creator_id, rule_id)
  select '00000000-0000-4000-a000-000000000002', id from public.commission_rules where version = 1
  on conflict do nothing;
-- Criador só aceita mensagens de assinantes: o mimo entrega mesmo assim.
update public.profiles set dm_policy = 'subscribers' where id = '00000000-0000-4000-a000-000000000002';

select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
create temp table t_tip as
  select public.create_order('tip', '00000000-0000-4000-a000-000000000002', 2500, 'pix', 'tip-msg-1') as id;
grant select on t_tip to authenticated, service_role;
select throws_ok($$ select public.set_tip_message((select id from t_tip), repeat('a', 501)) $$, '22023', null,
  'mensagem acima de 500 caracteres é recusada');
select lives_ok($$ select public.set_tip_message((select id from t_tip), '  Você é incrível!  ') $$,
  'fã grava a mensagem no próprio mimo pendente');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004');
select throws_ok($$ select public.set_tip_message((select id from t_tip), 'invasão') $$, 'P0002', null,
  'outra pessoa não altera a mensagem');
reset role;

select is((select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
            where c.creator_id = '00000000-0000-4000-a000-000000000002'
              and c.fan_id = '00000000-0000-4000-a000-000000000001'), 0,
  'nada chega ao chat antes do pagamento');

select pg_temp.as_service();
select public.attach_order_charge((select id from t_tip), 'simulado', 'sim_tip_msg', null);
select is(public.confirm_payment('simulado', 'evt_tip_msg', 'sim_tip_msg', 'paid'), 'paid', 'mimo pago');
reset role;
select is((select m.body from public.messages m join public.conversations c on c.id = m.conversation_id
            where c.creator_id = '00000000-0000-4000-a000-000000000002'
              and c.fan_id = '00000000-0000-4000-a000-000000000001'),
  E'🎁 Mimo de R$ 25,00\nVocê é incrível!', 'mensagem entregue no chat do criador, com o valor');
select is((select creator_unread from public.conversations
            where creator_id = '00000000-0000-4000-a000-000000000002' and fan_id = '00000000-0000-4000-a000-000000000001'), 1,
  'conversa marca a mensagem como não lida para o criador');

select * from finish();
rollback;
