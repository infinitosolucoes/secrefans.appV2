# ADR 0001 — Stack da aplicação

- **Status:** aceito (05/11/2026)
- **Contexto:** spec v1.2 define Next.js + React + TypeScript + Vercel + Supabase PostgreSQL; Lovable fora do escopo.

## Decisão
- Next.js 15 (App Router, Server Actions, Route Handlers), React 19, TypeScript strict.
- Tailwind CSS v4 com variáveis CSS geradas de `design/tokens.json` (design system Secretfans, tema `neon`).
- Supabase: Auth (e-mail + TOTP MFA), PostgreSQL com RLS, Storage privado, Realtime (futuro).
- Desenvolvimento local com Supabase CLI (Docker). HML/PROD em projetos Supabase e Vercel isolados.
- Testes: Vitest (unidade), pgTAP (banco/RLS), Playwright (E2E). npm como gerenciador.

## Consequências
- Lógica sensível (finanças, URLs privadas, papéis) roda só no servidor ou em funções `security definer` auditadas.
- Transcodificação de vídeo não roda em funções serverless (decisão de provedor de mídia na S3).
