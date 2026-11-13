-- S3: pacotes com versões e vídeo em posts (spec M05 e pacotes configuráveis).
-- Usuários do seed.sql: fan ...001, criador ...002.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

-- Estado limpo (desfeito no rollback) e criador aprovado.
delete from public.packages where creator_id = '00000000-0000-4000-a000-000000000002';
delete from public.user_blocks;
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000002', 'creator')
on conflict do nothing;

create temp table t_items as select
  '[{"kind":"image","path":"00000000-0000-4000-a000-000000000002/packages/44444444-0000-4000-a000-000000000001/55555555-0000-4000-a000-000000000001.webp","width":800,"height":600},
    {"kind":"video","path":"00000000-0000-4000-a000-000000000002/packages/44444444-0000-4000-a000-000000000001/55555555-0000-4000-a000-000000000002.mp4","poster":"00000000-0000-4000-a000-000000000002/packages/44444444-0000-4000-a000-000000000001/55555555-0000-4000-a000-000000000003.webp","duration":42}]'::jsonb as items;
grant select on t_items to authenticated, anon;

-- Fã não cria pacote ------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok(
  $$ select public.save_package('44444444-0000-4000-a000-000000000009', 'Pacote do fã', '', null, 4990, 'all', null, (select items from t_items), true, true) $$,
  '42501', null, 'fã sem papel creator não cria pacote');
reset role;

-- Criador: rascunho → publicação v1 ---------------------------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is(public.save_package('44444444-0000-4000-a000-000000000001', 'Ensaio Neon', 'desc', 'lifestyle', 4990, 'all', null,
          (select items from t_items), false), 1, 'rascunho cria a versão 1');
reset role;
select pg_temp.as_anon();
select is((select count(*)::int from public.public_packages where id = '44444444-0000-4000-a000-000000000001'), 0,
  'rascunho não aparece na vitrine');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is(public.save_package('44444444-0000-4000-a000-000000000001', 'Ensaio Neon', 'desc', 'lifestyle', 4990, 'all', null,
          (select items from t_items), true, true), 1, 'publicar o rascunho mantém a versão 1');
select throws_ok(
  $$ select public.save_package('44444444-0000-4000-a000-000000000002', 'Caminho alheio', '', null, 4990, 'all', null,
       '[{"kind":"image","path":"00000000-0000-4000-a000-000000000001/packages/44444444-0000-4000-a000-000000000002/55555555-0000-4000-a000-000000000009.webp"}]'::jsonb, false) $$,
  '22023', null, 'item com caminho de outro usuário é recusado');
select throws_ok(
  $$ select public.save_package('44444444-0000-4000-a000-000000000003', 'Preço baixo', '', null, 100, 'all', null, (select items from t_items), false) $$,
  '23514', null, 'preço abaixo do mínimo é recusado');
reset role;

-- Visitante e fã ---------------------------------------------------------------
select pg_temp.as_anon();
select results_eq(
  $$ select title, photo_count, video_count, price_cents from public.public_packages where id = '44444444-0000-4000-a000-000000000001' $$,
  $$ values ('Ensaio Neon'::text, 1, 1, 4990) $$,
  'visitante vê título, contagens e preço na vitrine');
select throws_ok($$ select * from public.package_items $$, '42501', null, 'visitante não lê itens do pacote');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.package_items), 0, 'fã sem compra não lê caminhos dos itens');
select is((select count(*)::int from public.packages), 0, 'fã não lê a tabela de pacotes');
select throws_ok(
  $$ select public.set_package_status('44444444-0000-4000-a000-000000000001', 'archived') $$,
  'P0002', null, 'fã não arquiva pacote alheio');
reset role;

-- Nova versão: v1 continua na vitrine até publicar a v2 ------------------------
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is(public.save_package('44444444-0000-4000-a000-000000000001', 'Ensaio Neon v2', 'desc', 'lifestyle', 5990, 'all', null,
          (select items from t_items), false), 2, 'editar pacote publicado cria a versão 2');
reset role;
select pg_temp.as_anon();
select is((select title from public.public_packages where id = '44444444-0000-4000-a000-000000000001'), 'Ensaio Neon',
  'vitrine continua com a v1 enquanto a v2 é rascunho');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select is(public.save_package('44444444-0000-4000-a000-000000000001', 'Ensaio Neon v2', 'desc', 'lifestyle', 5990, 'all', null,
          (select items from t_items), true, true), 2, 'publica a versão 2');
select is((select status::text from public.package_versions where package_id = '44444444-0000-4000-a000-000000000001' and version = 1),
  'superseded', 'versão 1 fica preservada como substituída');
select throws_ok(
  $$ select public.delete_package_draft('44444444-0000-4000-a000-000000000001') $$,
  '42501', null, 'pacote já publicado não pode ser excluído (compradores mantêm acesso)');
select lives_ok($$ select public.set_package_status('44444444-0000-4000-a000-000000000001', 'archived') $$,
  'criador arquiva o próprio pacote');
reset role;
select pg_temp.as_anon();
select is((select count(*)::int from public.public_packages where id = '44444444-0000-4000-a000-000000000001'), 0,
  'pacote arquivado sai da vitrine');
reset role;

-- Tipo de perfil: só valores da lista.
select pg_temp.as_user('00000000-0000-4000-a000-000000000002');
select throws_ok(
  $$ update public.profiles set creator_type = 'outro_valor' where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'tipo de perfil fora da lista é recusado');
reset role;

select * from finish();
rollback;
