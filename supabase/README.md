# Supabase local

Pré-requisito: Docker Desktop rodando.

```bash
npx supabase start      # sobe Postgres, Auth, Storage, Mailpit
npx supabase db reset   # aplica migrations + seed.sql
npx supabase test db    # testes pgTAP em supabase/tests
npx supabase status     # URLs e chaves locais (copie para .env.local)
```

- Studio: http://127.0.0.1:54323
- Mailpit (e-mails de confirmação/recuperação): http://127.0.0.1:54324

## Usuários de teste (SOMENTE LOCAL)

Senha de todos: `Secret-Teste-2026`

| E-mail | Papéis | MFA |
|---|---|---|
| fa@secretfans.test | fan | — |
| criador@secretfans.test | fan (intenção de criador, sem verificação) | — |
| moderador@secretfans.test | fan, moderator | TOTP |
| admin@secretfans.test | fan, super_admin | TOTP |

Segredo TOTP dos usuários de equipe (para app autenticador ou testes): `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`.

Esses dados existem apenas no banco local; `seed.sql` nunca deve rodar em HML/PROD.

## Migrations

| Arquivo | Conteúdo |
|---|---|
| `…01_extensions_helpers` | citext, pgcrypto, enums, schema `private` |
| `…02_identity` | profiles, user_roles, permissions, user_blocks, consent_records |
| `…03_auth_triggers` | perfil + papel `fan` + consentimentos ao criar conta |
| `…04_authz_functions` | `has_role`, `has_permission`, `is_mfa_session`, `is_staff`, `staff_can` |
| `…05_verification` | creator_verifications |
| `…06_operations` | admin_audit_logs (imutável), platform_settings, feature_flags |
| `…07_rls` | RLS deny-by-default, view `public_profiles` |
| `…08_storage` | buckets privados e policies |
| `…09_rpcs` | verificação, papéis, status de conta, consultas admin |
