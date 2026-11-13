-- S8: configurações editáveis (faixas, MFA, auditoria) e declaração do criador ao publicar.
-- Usuários do seed.sql: fan ...001, criador ...002, super_admin ...004.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create or replace function pg_temp.as_user(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  execute 'set local role authenticated';
end; $$;

insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator') on conflict do nothing;

-- Configurações ----------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000004');
select throws_ok($$ select public.update_platform_setting('payout_min_cents', '5000', 'teste de mudança') $$,
  '42501', null, 'sem MFA não altera');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002', 'aal2');
select throws_ok($$ select public.update_platform_setting('payout_min_cents', '5000', 'teste de mudança') $$,
  '42501', null, 'criador não altera configurações');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-000000000004', 'aal2');
select lives_ok($$ select public.update_platform_setting('payout_min_cents', '5000', 'mínimo maior no teste') $$,
  'super admin com MFA altera o saque mínimo');
select throws_ok($$ select public.update_platform_setting('payout_min_cents', '5000', 'oi') $$,
  '22023', null, 'justificativa obrigatória');
select throws_ok($$ select public.update_platform_setting('creator_min_age', '17', 'menor de idade não') $$,
  '22023', null, 'idade mínima não pode ficar abaixo de 18');
select throws_ok($$ select public.update_platform_setting('payout_hold_days_pix', '2.5', 'meio dia não vale') $$,
  '22023', null, 'só números inteiros');
select throws_ok($$ select public.update_platform_setting('payout_hold_days_pix', '"7"', 'texto não vale') $$,
  '22023', null, 'valor precisa ser número');
select throws_ok($$ select public.update_platform_setting('commission_model', '1', 'chave fixa do MVP') $$,
  '22023', null, 'chave fora da lista não é editável');
reset role;

select is((select value from public.platform_settings where key = 'payout_min_cents'), '5000'::jsonb,
  'valor gravado');
select is((select metadata from public.admin_audit_logs where action = 'settings.update' and target_id = 'payout_min_cents'
            order by created_at desc limit 1),
  jsonb_build_object('old', 2000, 'new', 5000), 'auditoria guarda o valor anterior e o novo');

-- Declaração ao publicar ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ insert into public.posts (id, creator_id, body, visibility, status)
  values ('77777777-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'sem declaração', 'free', 'published') $$,
  '22023', null, 'publicar sem a declaração é recusado');
select lives_ok($$ insert into public.posts (id, creator_id, body, visibility, status)
  values ('77777777-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', 'rascunho', 'free', 'draft') $$,
  'rascunho não precisa da declaração');
select throws_ok($$ update public.posts set status = 'published' where id = '77777777-0000-4000-a000-000000000002' $$,
  '22023', null, 'publicar o rascunho sem declarar é recusado');
select lives_ok($$ update public.posts set status = 'published', content_attested_at = '2000-01-01'
  where id = '77777777-0000-4000-a000-000000000002' $$, 'publica ao declarar');
reset role;
select ok((select content_attested_at > now() - interval '1 minute' and content_attestation_version = '2026-11'
             from public.posts where id = '77777777-0000-4000-a000-000000000002'),
  'horário da declaração é o do servidor (ignora o enviado) e guarda a versão do texto');

select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.save_package('88888888-0000-4000-a000-000000000001', 'Pacote', '', null, 1990,
  'all', null,
  jsonb_build_array(jsonb_build_object('kind', 'image', 'path',
    '00000000-0000-4000-a000-000000000002/packages/88888888-0000-4000-a000-000000000001/99999999-0000-4000-a000-000000000001.webp')),
  true) $$, '22023', null, 'publicar pacote sem a declaração é recusado');
reset role;

select * from finish();
rollback;
