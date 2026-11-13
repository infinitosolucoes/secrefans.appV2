# Secretfans 2.0

Plataforma web de criadores e fãs (+18). Next.js 15 + TypeScript + Tailwind v4 + Supabase.
Especificação: `SecretFans_2_0_SPEC_MVP_Comissao_v1_2.md` (MVP somente por comissão).

**Estado atual: MVP completo no código (S0 a S8).** Homologação no ar em
https://secretfans-hml.vercel.app (Asaas sandbox). Produção ainda não existe: ver
[docs/runbooks/go-live.md](docs/runbooks/go-live.md).

| Etapa | O que entrega |
| ----- | ------------- |
| S0/S1 | Fundação, design system, aviso +18, cadastro/login, papéis + RLS, verificação de criador, Super Admin com MFA e auditoria |
| S2    | Perfis, seguir, Explorar, feed, publicações (grátis, assinantes, PPV), curtidas, comentários, denúncias e moderação |
| S3    | Vídeos e pacotes de mídia com versões |
| S4    | Comissão versionada (aprovação em duas etapas), checkout e pedidos, assinaturas |
| S5    | Asaas (Pix e cartão, assinatura recorrente, split para a conta do criador), webhooks, ledger de partidas dobradas, conciliação diária |
| S6    | Chat fã ↔ criador (mídia, mensagem paga, mensagem em massa), Mimo, notificações no site e por e-mail (Resend), extrato com CSV, Carteira e saques por Pix |
| S7    | Avisos de venda, mimo, assinante, renovação, mensagem, post, seguidor, curtida, comentário, verificação, assinatura acabando e saque |
| S8    | Configurações editáveis e auditadas, rate limit com Upstash, declaração de direitos/consentimento ao publicar, MFA opcional para todos, CSP com nonce |

## Rodando localmente

Pré-requisitos: Node 20.18+, Docker Desktop.

```bash
npm install
npx supabase start          # Postgres, Auth, Storage, Mailpit
npx supabase db reset       # migrations + seed de teste
cp .env.example .env.local  # preencha com os valores de `npx supabase status`
npm run dev                 # http://localhost:3000
```

Sem chaves do Asaas, Resend ou Upstash o app funciona localmente: pagamentos e saques usam o
provedor **simulado**, os e-mails ficam na fila (não saem) e o rate limit fica em memória.

Usuários de teste, senha e segredo TOTP: ver `supabase/README.md`. E-mails locais: http://127.0.0.1:54324.

## Scripts

| Comando                      | O que faz |
| ---------------------------- | --------- |
| `npm run lint` / `typecheck` | ESLint e TypeScript strict |
| `npm test`                   | Vitest: schemas, authz, Asaas (cliente e webhooks), saques, rate limit, CSP, extrato, e-mails |
| `npm run db:test`            | pgTAP: RLS, comissão, ledger, chat, notificações, saques, configurações e declarações |
| `npm run test:e2e`           | Playwright (build de produção): cadastro, login, MFA, publicação, checkout simulado, chat, saques, admin. Use `E2E_PORT` se a 3000 estiver ocupada |
| `npm run tokens`             | Regenera `src/styles/tokens.css` a partir de `design/tokens.json` |
| `npm run db:types`           | Regenera `src/types/database.ts` |

Scripts operacionais: `scripts/asaas-register-webhook.mjs` (registra o webhook de cobranças e
transferências no Asaas) e `scripts/build-email-templates.mjs` (e-mails de login em pt-BR).

## Estrutura

```
src/app/aviso-18          aviso +18 (visitante confirma a maioridade antes de qualquer página)
src/app/(public)          landing, descoberta e perfil público /[handle]
src/app/(auth)            entrar (+ código MFA), criar-conta, confirmar-email, senha
src/app/(fan)             início, feed, biblioteca, checkout, pedido, mensagens, notificações,
                          carteira (compras; criador: saldo e saques), conta (perfil, segurança)
src/app/(creator)/estudio publicações, pacotes, vendas, extrato, recebimentos (conta Asaas), comissão
src/app/super-admin       MFA + painel: usuários, verificações, comissões, financeiro, saques,
                          denúncias, auditoria, configurações
src/app/api/webhooks      asaas (cobranças e transferências), asaas/validacao-saque
src/app/api/cron          conciliar (diário: pedidos, saques, avisos de vencimento, fila de e-mail)
src/features/*            ações, formulários e regras por domínio
src/server/*              sessão, autorização, provedores de pagamento, saques, e-mail, rate limit
supabase/migrations       esquema, RLS, storage, RPCs (security definer) e gatilhos
docs/adr                  decisões de arquitetura
docs/runbooks             operação da homologação e checklist de produção
```

## Segurança (resumo)

- RLS deny-by-default em todas as tabelas; escrita sensível só por RPCs `security definer`.
- Papéis em `user_roles`, concedidos só pelo Super Admin com MFA; auditoria imutável.
- Área administrativa exige sessão `aal2` (TOTP). Fãs e criadores podem ativar o MFA; quem ativou
  digita o código a cada login.
- Dinheiro: ledger de partidas dobradas imutável ([ADR 0004](docs/adr/0004-ledger-e-pedidos.md));
  saques aprovados pelo financeiro e validados por webhook antes de o Asaas executar
  ([ADR 0005](docs/adr/0005-saques.md)).
- Webhooks: token comparado em tempo constante e nova consulta à API do Asaas (o corpo recebido
  não é confiável). Eventos idempotentes.
- CSP com nonce por requisição (sem `'unsafe-inline'` para scripts), HSTS e demais cabeçalhos.
- Rate limit (Upstash Redis) em login, cadastro, senha, checkout, mensagens e saques.
- Conteúdo +18: publicar post, pacote ou mídia no chat exige a declaração do criador (direitos,
  maioridade e consentimento de quem aparece), gravada com horário do servidor e versão do texto.
- Documentos de verificação em bucket privado; abertura por URL assinada de 60 s, auditada.

## Pendências conhecidas

- **Asaas:** o Pix de saque falha no sandbox com `invalid_action` (chamado com o suporte).
  Produção exige conta CNPJ, split e aceite do segmento +18 ([ADR 0003](docs/adr/0003-payment-provider-abstraction.md)).
- **Jurídico:** textos de Termos de uso e Política de privacidade.
- **Produção:** projeto separado na Vercel e no Supabase, domínio, planos pagos ([go-live](docs/runbooks/go-live.md)).
- Recuperação de MFA é pelo suporte (sem códigos de recuperação nesta versão).
- Logo em PNG raster; pedir o vetor SVG ao designer.
- Feature flags (`payments_enabled`, `creator_publishing`, `wallets`) ainda não controlam o site.
