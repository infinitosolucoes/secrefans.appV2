-- Dados sintéticos SOMENTE para desenvolvimento local (supabase db reset).
-- Credenciais documentadas em supabase/README.md. Nunca rodar em HML/PROD.

-- Marca o banco como local: libera a limpeza do ledger imutável nos testes (E2E/pgTAP).
insert into private.environment_markers (key) values ('local_test_db') on conflict do nothing;

do $$
declare
  pw text := extensions.crypt('Secret-Teste-2026', extensions.gen_salt('bf'));
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'fa@secretfans.test',        'fa_teste',        'Fã Teste',        false),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'criador@secretfans.test',   'criador_teste',   'Criador Teste',   true),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'moderador@secretfans.test', 'moderador_teste', 'Moderador Teste', false),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'admin@secretfans.test',     'admin_teste',     'Super Admin',     false)
    ) as t(id, email, handle, display_name, creator_intent)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('handle', u.handle, 'display_name', u.display_name, 'creator_intent', u.creator_intent,
        'consents', jsonb_build_array(jsonb_build_object('type','terms','version','2026-11'),
                                      jsonb_build_object('type','privacy','version','2026-11'),
                                      jsonb_build_object('type','age_18','version','2026-11'))),
      now(), now(), '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now());
  end loop;
end;
$$;

-- Papéis de equipe (o trigger já deu 'fan' a todos).
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-a000-000000000003', 'moderator'),
  ('00000000-0000-4000-a000-000000000004', 'super_admin');

-- Fator TOTP verificado para a equipe, com segredo fixo conhecido (permite E2E calcular o código).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003', 'seed-totp', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000004', 'seed-totp', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
