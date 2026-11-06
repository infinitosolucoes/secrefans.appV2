-- Testes de RLS, elevação de privilégio e auditoria (spec §6.2, §12 cenários 7 e 8).
-- Usuários do seed.sql: fan ...001, criador ...002, moderador ...003, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Helpers locais de sessão simulada.
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

-- Fixtures (como postgres): verificação pendente do criador e um documento no storage.
-- Limpa o que execuções E2E anteriores deixaram no banco local (tudo é desfeito no rollback).
delete from public.creator_verifications where user_id = '00000000-0000-4000-a000-000000000002';
delete from public.user_roles where user_id = '00000000-0000-4000-a000-000000000002' and role = 'creator';
insert into storage.objects (bucket_id, name, owner_id)
values ('verification-documents', '00000000-0000-4000-a000-000000000002/doc.jpg', '00000000-0000-4000-a000-000000000002');
insert into public.creator_verifications (id, user_id, legal_name, birth_date, document_front_path, selfie_path)
values ('11111111-1111-4111-a111-111111111111', '00000000-0000-4000-a000-000000000002', 'Criador Teste', '1990-01-01',
        '00000000-0000-4000-a000-000000000002/doc.jpg', '00000000-0000-4000-a000-000000000002/doc.jpg');

-- Cadastro ---------------------------------------------------------------
select results_eq(
  $$ select role::text from public.user_roles where user_id = '00000000-0000-4000-a000-000000000001' $$,
  array['fan'], 'conta nova recebe só o papel mínimo fan');
select is((select count(*)::int from public.consent_records where user_id = '00000000-0000-4000-a000-000000000001'), 3,
  'consentimentos do cadastro registrados');

-- Visitante --------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'visitante não lê a tabela profiles');
select ok((select count(*) from public.public_profiles) >= 4, 'visitante lê a view pública de perfis');
select throws_ok($$ select * from public.user_roles $$, '42501', null, 'visitante não lê user_roles');
reset role;

-- Fã ---------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.profiles), 1, 'fã só enxerga o próprio perfil');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-a000-000000000004'), 0,
  'fã não lê perfil de outro usuário');
select throws_ok(
  $$ insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000001', 'super_admin') $$,
  '42501', null, 'fã não se autoatribui super_admin');
select throws_ok(
  $$ update public.user_roles set role = 'super_admin' where user_id = '00000000-0000-4000-a000-000000000001' $$,
  '42501', null, 'fã não altera user_roles');
select throws_ok(
  $$ update public.profiles set status = 'active' where id = '00000000-0000-4000-a000-000000000001' $$,
  '42501', null, 'fã não altera a coluna status do próprio perfil');
select lives_ok(
  $$ update public.profiles set bio = 'nova bio' where id = '00000000-0000-4000-a000-000000000001' $$,
  'fã altera a própria bio');
update public.profiles set bio = 'invasão' where id = '00000000-0000-4000-a000-000000000004';
select is(public.grant_role('00000000-0000-4000-a000-000000000001', 'super_admin', 'tentativa'), false,
  'fã chamando grant_role recebe negação');
select is((select count(*)::int from public.admin_audit_logs), 0, 'fã não lê auditoria');
select is((select count(*)::int from public.creator_verifications), 0, 'fã não lê verificações de outros');
select is((select count(*)::int from storage.objects where bucket_id = 'verification-documents'), 0,
  'fã não lê documentos de outro usuário (acesso direto negado)');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('verification-documents', '00000000-0000-4000-a000-000000000002/x.jpg') $$,
  '42501', null, 'fã não envia arquivo na pasta de outro usuário');
select throws_ok(
  $$ select public.submit_creator_verification('Menor de Idade', (current_date - interval '17 years')::date, 'a', null, 'b', true, true) $$,
  '22023', null, 'menor de 18 anos não envia verificação');
select throws_ok(
  $$ select public.decide_creator_verification('11111111-1111-4111-a111-111111111111', 'approved', 'ok') $$,
  '42501', null, 'fã não decide verificação');
reset role;

select is((select bio from public.profiles where id = '00000000-0000-4000-a000-000000000004'), '',
  'update em perfil alheio não teve efeito');
select ok(exists (select 1 from public.admin_audit_logs where action = 'role.grant_denied'
  and actor_id = '00000000-0000-4000-a000-000000000001'), 'tentativa de elevação ficou registrada na auditoria');
select ok(not exists (select 1 from public.user_roles where user_id = '00000000-0000-4000-a000-000000000001' and role = 'super_admin'),
  'fã continua sem super_admin');

-- Moderador sem MFA ------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000003', 'aal1');
select is((select count(*)::int from public.creator_verifications), 0, 'moderador sem MFA não lê a fila');
select is((select count(*)::int from storage.objects where bucket_id = 'verification-documents'), 0,
  'moderador sem MFA não lê documentos');
select throws_ok(
  $$ select public.decide_creator_verification('11111111-1111-4111-a111-111111111111', 'approved', 'ok') $$,
  '42501', null, 'moderador sem MFA não decide');
reset role;

-- Moderador com MFA ------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000003', 'aal2');
select is((select count(*)::int from storage.objects where bucket_id = 'verification-documents'
            and name = '00000000-0000-4000-a000-000000000002/doc.jpg'), 1,
  'moderador com MFA lê documentos');
select lives_ok(
  $$ select public.decide_creator_verification('11111111-1111-4111-a111-111111111111', 'approved', 'Documentos conferidos') $$,
  'moderador com MFA aprova verificação');
select is(public.grant_role('00000000-0000-4000-a000-000000000001', 'moderator', 'teste'), false,
  'moderador não concede papéis');
reset role;
select ok(exists (select 1 from public.user_roles where user_id = '00000000-0000-4000-a000-000000000002' and role = 'creator'),
  'aprovação concede papel creator');

-- Super Admin ------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal1');
select is(public.grant_role('00000000-0000-4000-a000-000000000001', 'moderator', 'sem mfa'), false,
  'super_admin sem MFA não concede papel');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal2');
select is(public.grant_role('00000000-0000-4000-a000-000000000001', 'support', 'Atendimento N1'), true,
  'super_admin com MFA concede papel');
select throws_ok(
  $$ select public.revoke_role('00000000-0000-4000-a000-000000000004', 'super_admin', 'auto') $$,
  '42501', null, 'super_admin não altera os próprios papéis');
reset role;

-- Auditoria imutável -----------------------------------------------------
select throws_ok($$ update public.admin_audit_logs set reason = 'x' $$, '42501', null, 'auditoria não aceita UPDATE');
select throws_ok($$ delete from public.admin_audit_logs $$, '42501', null, 'auditoria não aceita DELETE');

select * from finish();
rollback;
