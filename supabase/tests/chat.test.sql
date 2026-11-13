-- S6: chat fã ↔ criador, mídia e mensagem paga, mensagem em massa.
-- Usuários do seed.sql: fan ...001, criador ...002, moderador ...003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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
delete from public.messages;
delete from public.conversations;
delete from public.message_broadcasts;
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;
insert into public.creator_commission_acceptances (creator_id, rule_id)
  select '00000000-0000-4000-a000-000000000002', id from public.commission_rules where version = 1
  on conflict do nothing;
update public.profiles set dm_policy = 'subscribers' where id = '00000000-0000-4000-a000-000000000002';

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, service_role;
insert into ids values
  ('ppv',   'aaaaaaaa-0000-4000-a000-000000000001'),
  ('txt',   'aaaaaaaa-0000-4000-a000-000000000002'),
  ('fanmsg','aaaaaaaa-0000-4000-a000-000000000003'),
  ('bc',    'aaaaaaaa-0000-4000-a000-000000000004');

-- Política "só assinantes" ------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.start_conversation('00000000-0000-4000-a000-000000000002') $$,
  'P0001', null, 'não assinante não abre conversa quando o criador aceita só assinantes');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select lives_ok($$ update public.profiles set dm_policy = 'everyone' where id = auth.uid() $$,
  'criador libera mensagens de qualquer fã');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
insert into ids select 'conv', public.start_conversation('00000000-0000-4000-a000-000000000002');
select ok((select v from ids where k = 'conv') is not null, 'fã abre conversa');
select is(public.start_conversation('00000000-0000-4000-a000-000000000002'), (select v from ids where k = 'conv'),
  'abrir de novo devolve a mesma conversa');
select lives_ok($$ select public.send_message((select v from ids where k = 'fanmsg'), (select v from ids where k = 'conv'), 'Oi! Adoro seu conteúdo') $$,
  'fã envia texto');
select throws_ok(
  $$ select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'x', null,
       jsonb_build_array(jsonb_build_object('kind','image','path','00000000-0000-4000-a000-000000000001/messages/aaaaaaaa-0000-4000-a000-000000000009/bbbbbbbb-0000-4000-a000-000000000001.webp'))) $$,
  '42501', null, 'fã não envia mídia');
select throws_ok($$ select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'pague', 1000) $$,
  '42501', null, 'fã não envia mensagem paga');
select throws_ok($$ insert into public.messages (id, conversation_id, sender_id, body) values (gen_random_uuid(), (select v from ids where k = 'conv'), auth.uid(), 'direto') $$,
  '42501', null, 'escrita direta na tabela é bloqueada');
reset role;
select is((select creator_unread from public.conversations where id = (select v from ids where k = 'conv')), 1,
  'criador tem 1 não lida');

-- Criador: texto, PPV com mídia -----------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.send_message((select v from ids where k = 'txt'), (select v from ids where k = 'conv'), 'Obrigada! ❤️') $$,
  'criador responde');
select throws_ok($$ select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'sem mídia', 1990) $$,
  '22023', null, 'mensagem paga exige mídia');
select throws_ok(
  $$ select public.send_message((select v from ids where k = 'ppv'), (select v from ids where k = 'conv'), 'exclusivo', 1990,
       jsonb_build_array(jsonb_build_object('kind','image','path','00000000-0000-4000-a000-000000000002/outra-pasta/x.webp'))) $$,
  '22023', null, 'caminho de mídia fora da pasta da mensagem é recusado');
select throws_ok(
  $$ select public.send_message((select v from ids where k = 'ppv'), (select v from ids where k = 'conv'), 'Exclusivo pra você', 1990,
       jsonb_build_array(jsonb_build_object('kind','image','path','00000000-0000-4000-a000-000000000002/messages/aaaaaaaa-0000-4000-a000-000000000001/bbbbbbbb-0000-4000-a000-000000000001.webp','width',800,'height',600))) $$,
  '22023', null, 'mídia no chat sem a declaração do criador é recusada');
select lives_ok(
  $$ select public.send_message((select v from ids where k = 'ppv'), (select v from ids where k = 'conv'), 'Exclusivo pra você', 1990,
       jsonb_build_array(jsonb_build_object('kind','image','path','00000000-0000-4000-a000-000000000002/messages/aaaaaaaa-0000-4000-a000-000000000001/bbbbbbbb-0000-4000-a000-000000000001.webp','width',800,'height',600)), true) $$,
  'criador envia mensagem paga com foto (com a declaração)');
select is((select count(*)::int from public.message_media_for((select v from ids where k = 'ppv'))), 1,
  'criador vê a própria mídia');
select lives_ok($$ select public.mark_conversation_read((select v from ids where k = 'conv')) $$, 'criador marca como lida');
reset role;
select results_eq(
  $$ select creator_unread, fan_unread, last_message_preview from public.conversations where id = (select v from ids where k = 'conv') $$,
  $$ values (0, 2, '🔒 Mensagem paga') $$,
  'contadores e prévia atualizados');

-- Isolamento --------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.conversations), 0, 'terceiro não vê conversas alheias');
select is((select count(*)::int from public.messages), 0, 'terceiro não vê mensagens alheias');
select is((select count(*)::int from public.message_media_for((select v from ids where k = 'ppv'))), 0,
  'terceiro não acessa a mídia');
reset role;

-- Compra da mensagem paga ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.message_media_for((select v from ids where k = 'ppv'))), 0,
  'fã não vê a mídia antes de pagar');
insert into ids select 'order', public.create_order('message', (select v from ids where k = 'ppv'), null, 'pix', 'chat-ppv-001');
select is((select gross_cents from public.orders where id = (select v from ids where k = 'order')), 1990,
  'preço da mensagem vem do banco');
reset role;
select pg_temp.as_service();
select public.prepare_order_charge((select v from ids where k = 'order'), 'simulado');
select public.attach_order_charge((select v from ids where k = 'order'), 'simulado', 'sim-chat-1');
select is(public.confirm_payment('simulado', 'evt-chat-1', 'sim-chat-1', 'paid', '{}'::jsonb), 'paid', 'pagamento confirmado');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.message_media_for((select v from ids where k = 'ppv'))), 1,
  'depois de pagar, o fã vê a mídia');
select throws_ok($$ select public.create_order('message', (select v from ids where k = 'ppv'), null, 'pix', 'chat-ppv-002') $$,
  '23505', null, 'não compra a mesma mensagem duas vezes');
reset role;

-- Bloqueio --------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.send_message(gen_random_uuid(), (select v from ids where k = 'conv'), 'oi?') $$,
  '42501', null, 'bloqueio impede novas mensagens');
delete from public.user_blocks where blocker_id = auth.uid();
reset role;

-- Mensagem em massa -------------------------------------------------------------------
insert into public.subscriptions (fan_id, creator_id, price_cents, status, current_period_end)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 2990, 'active', now() + interval '20 days');
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.send_broadcast(gen_random_uuid(), 'spam') $$, '42501', null, 'fã não envia em massa');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is(public.send_broadcast((select v from ids where k = 'bc'), 'Novidade para assinantes!'), 1,
  'mensagem em massa chega ao assinante');
select throws_ok($$ select public.send_broadcast(gen_random_uuid(), 'de novo') $$, 'P0001', null,
  'intervalo mínimo entre envios em massa');
reset role;

select * from finish();
rollback;
