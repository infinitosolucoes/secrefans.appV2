# ADR 0002 — Autorização: RBAC + ABAC + RLS

- **Status:** aceito (05/11/2026)

## Decisão
1. **Papéis** (`app_role`): `fan, creator, moderator, support, finance, admin_ops, super_admin`, guardados em `public.user_roles`. Toda conta nova recebe só `fan` (trigger em `auth.users`).
2. **Ninguém se autoatribui papel:** `authenticated` não tem `insert/update/delete` em `user_roles`. Concessão só por `grant_role`/`revoke_role` (`security definer`), exigindo `super_admin` + sessão `aal2`, proibindo alvo = si mesmo e gravando `admin_audit_logs`.
3. **Permissões** finas em `permissions`/`role_permissions`, checadas com `has_permission()`.
4. **ABAC** via RLS: propriedade (`auth.uid() = owner`), status de verificação, bloqueios, MFA (`is_mfa_session()`).
5. **Deny by default:** RLS ligada em todas as tabelas; tabelas sem policy ficam inacessíveis ao cliente.
6. O frontend só esconde botões por conveniência; a decisão de acesso é sempre do banco/servidor.
7. `service_role` é segredo server-side e não substitui checagem de negócio.

## Consequências
- Áreas de equipe exigem MFA TOTP; o middleware redireciona para `/super-admin/mfa`.
- Logs de auditoria são imutáveis (trigger bloqueia UPDATE/DELETE).
