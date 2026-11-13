-- Bot do Telegram: vínculo, moderação e denúncias (RPCs só do service role).
-- Usuários do seed.sql: fã ...001, criador ...002, moderador ...003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
delete from public.reports;
delete from public.telegram_links;

create temp table codes (k text primary key, v text);
grant select, insert on codes to authenticated, service_role;

-- Código de vínculo: só o service role, e só com conta ativa e consentimento de 18+ ------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$ select public.telegram_create_link_code('00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'usuário logado não gera código direto (só o servidor)');
reset role;

delete from public.consent_records
 where user_id = '00000000-0000-4000-a000-000000000001' and consent_type = 'age_18';
select pg_temp.as_service();
select throws_ok($$ select public.telegram_create_link_code('00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'sem consentimento de 18+ não gera código');
reset role;

insert into public.consent_records (user_id, consent_type, version, granted)
values ('00000000-0000-4000-a000-000000000001', 'age_18', '2026-11', true);
select pg_temp.as_service();
insert into codes select 'fan', public.telegram_create_link_code('00000000-0000-4000-a000-000000000001');
reset role;
select is(char_length((select v from codes where k = 'fan')), 32, 'código tem 32 caracteres');

-- Consumo do código ---------------------------------------------------------------------------
select pg_temp.as_service();
select is(public.telegram_consume_link_code((select v from codes where k = 'fan'), 100, 'fa_tg'),
  '00000000-0000-4000-a000-000000000001'::uuid, 'código válido devolve o usuário');
select throws_ok(format($$ select public.telegram_consume_link_code(%L, 100, 'fa_tg') $$, (select v from codes where k = 'fan')),
  'P0002', null, 'código já usado não vale de novo');

insert into codes select 'mod1', public.telegram_create_link_code('00000000-0000-4000-a000-000000000003');
select throws_ok(format($$ select public.telegram_consume_link_code(%L, 100, 'outro') $$, (select v from codes where k = 'mod1')),
  '23505', null, 'Telegram já ligado a outro usuário é recusado');
select is(public.telegram_consume_link_code((select v from codes where k = 'mod1'), 200, 'mod_tg'),
  '00000000-0000-4000-a000-000000000003'::uuid, 'o código recusado continua válido para outro Telegram');
reset role;

-- Consulta do usuário vinculado ------------------------------------------------------------------
select pg_temp.as_service();
select is((select can_moderate from public.telegram_user_for(200)), true, 'moderador vinculado pode moderar');
select is((select can_moderate from public.telegram_user_for(100)), false, 'fã vinculado não modera');
reset role;

-- RLS ------------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.telegram_links), 1, 'o fã só vê o próprio vínculo');
select throws_ok($$ select count(*) from public.telegram_link_codes $$, '42501', null,
  'códigos de vínculo não são legíveis pelo cliente');
reset role;

-- Denúncia urgente -----------------------------------------------------------------------------
select pg_temp.as_service();
insert into codes select 'rep', public.telegram_create_report('00000000-0000-4000-a000-000000000001',
  'menor_de_idade', 'parece menor', -1001, 55, 300, 'texto da mensagem', false)::text;
reset role;
select results_eq(
  $$ select target_type::text, reason from public.reports where reporter_id = '00000000-0000-4000-a000-000000000001' $$,
  $$ values ('telegram_message', 'menor_de_idade') $$,
  'denúncia grava reports com target telegram_message');
select is((select count(*)::int from public.notifications
            where kind = 'report_urgent' and user_id = '00000000-0000-4000-a000-000000000003'), 1,
  'denúncia urgente notifica o moderador');

-- Denúncia repetida da mesma mensagem devolve a existente ------------------------------------------
select pg_temp.as_service();
select is(public.telegram_create_report('00000000-0000-4000-a000-000000000001',
    'menor_de_idade', 'de novo', -1001, 55, 300, 'texto da mensagem', false)::text,
  (select v from codes where k = 'rep'), 'denúncia repetida devolve o id existente');
reset role;
select is((select count(*)::int from public.telegram_reported_messages), 1, 'e não grava outra mensagem denunciada');

-- Auditoria ---------------------------------------------------------------------------------------
select pg_temp.as_service();
select public.telegram_log_action('00000000-0000-4000-a000-000000000003', 'telegram.mute', '300', 'flood', '{"hours":24}'::jsonb);
reset role;
select is((select count(*)::int from public.admin_audit_logs
            where action = 'telegram.mute' and target_type = 'telegram_user' and metadata ->> 'source' = 'telegram_bot'), 1,
  'ação do bot entra na trilha de auditoria');

select * from finish();
rollback;
