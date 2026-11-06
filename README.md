# Secretfans 2.0

Plataforma web de criadores e fãs. Next.js 15 + TypeScript + Tailwind v4 + Supabase.
Especificação: `SecretFans_2_0_SPEC_MVP_Comissao_v1_2.md` (MVP somente por comissão).

**Estado atual: rodada 1 (S0 + S1).** Inclui fundação, design system, autenticação, papéis/RLS, verificação de criador e shell do Super Admin com MFA. Pagamentos, mídia, feed, pacotes e comissão ainda não foram implementados.

## Rodando localmente

Pré-requisitos: Node 20.18+, Docker Desktop.

```bash
npm install
npx supabase start          # Postgres, Auth, Storage, Mailpit
npx supabase db reset       # migrations + seed de teste
cp .env.example .env.local  # preencha com os valores de `npx supabase status`
npm run dev                 # http://localhost:3000
```

Usuários de teste, senha e segredo TOTP: ver `supabase/README.md`. E-mails locais: http://127.0.0.1:54324.

## Scripts

| Comando                      | O que faz                                                         |
| ---------------------------- | ----------------------------------------------------------------- |
| `npm run lint` / `typecheck` | ESLint e TypeScript strict                                        |
| `npm test`                   | Vitest (schemas, authz, rate limit, tokens)                       |
| `npm run db:test`            | pgTAP: RLS, elevação de privilégio, auditoria imutável            |
| `npm run test:e2e`           | Playwright: aviso +18, cadastro, login, MFA, verificação. Use `E2E_PORT` se a 3000 estiver ocupada (o link de confirmação de e-mail usa a 3000) |
| `npm run tokens`             | Regenera `src/styles/tokens.css` a partir de `design/tokens.json` |
| `npm run db:types`           | Regenera `src/types/database.ts`                                  |

## Estrutura

```
src/app/aviso-18        aviso +18 (visitante confirma a maioridade antes de qualquer página)
src/app/(public)        landing (/), descoberta (/descobrir) e perfil público /[handle]
src/app/(auth)          entrar, criar-conta, confirmar-email, esqueci/redefinir senha
src/app/(fan)           início, conta/perfil (+ placeholders S2+)
src/app/(creator)       estudio, estudio/verificacao
src/app/super-admin     MFA + painel (usuários, verificações, auditoria, configurações)
src/features/*          ações, formulários e regras por domínio
src/server/*            sessão, autorização, segurança, contrato PaymentProvider
supabase/migrations     esquema, RLS, storage, RPCs auditadas
design/                 tokens e brand book exportados do design system Secretfans
docs/adr                decisões de arquitetura
```

## Segurança (resumo)

- RLS deny-by-default em todas as tabelas; visitantes leem só a view `public_profiles`.
- Papéis em `user_roles`, sem escrita pelo cliente; concessão só por RPC `grant_role` (Super Admin + MFA), com auditoria imutável.
- Área administrativa exige sessão `aal2` (TOTP), checada no middleware, no servidor e no banco.
- Documentos de verificação em bucket privado; abertura por URL assinada de 60s, registrada na auditoria.

## Pendências conhecidas

- Logo: PNG raster do design system. Pedir ao designer o vetor SVG.
- Arte do hero/banner usa o padrão geométrico do Cover do DS até haver fotografia licenciada.
- Rate limiting de app em memória: trocar por store distribuído antes da Vercel.
- CSP usa `'unsafe-inline'` para scripts: migrar para nonce antes do go-live.
- Termos de uso e política de privacidade: textos jurídicos pendentes.
- Projetos HML/PROD (Vercel e Supabase) ainda não foram criados.
