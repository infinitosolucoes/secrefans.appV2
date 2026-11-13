# Operação da homologação

Site: https://secretfans-hml.vercel.app · Vercel `secretfans-hml` (região gru1) · Supabase
`secretfans-hml` (sa-east-1) · Asaas **sandbox**.

## Deploy

- Todo push no `main` publica na Vercel (Git integration). Variáveis novas só valem a partir do
  próximo deploy (use "Redeploy" na Vercel se mudar só variável).
- Migrations do banco **não** são automáticas:
  ```bash
  npx supabase db push --remote
  ```
  A CLI pede confirmação. Se outra pessoa aplicou uma migration com número maior antes da sua,
  use `--include-all` (aplica a sua fora de ordem).

## Segredos

- Ficam no `.env.hml.local` (fora do Git) e nas variáveis da Vercel (marcadas como sensíveis).
- Nunca cole chaves em chat, issue ou commit. Se uma chave vazar, gere outra no painel do
  serviço e atualize os dois lugares.

## Asaas (sandbox)

- **Webhook de cobranças e transferências:** `/api/webhooks/asaas`, token `ASAAS_WEBHOOK_TOKEN`.
  Para registrar ou atualizar os eventos:
  ```bash
  node scripts/asaas-register-webhook.mjs .env.hml.local https://secretfans-hml.vercel.app
  ```
- **Validação de saque:** Menu do usuário → Integrações → Mecanismos de segurança. URL
  `/api/webhooks/asaas/validacao-saque`, token `ASAAS_TRANSFER_VALIDATION_TOKEN`. Não marcar
  validação de splits nem de estornos Pix.
- **Pix de teste:** no sandbox só funcionam chaves de homologação (ex.:
  `cliente-a00001@pix.bcb.gov.br`). Hoje o Pix de saque falha com `invalid_action` (chamado com o
  suporte); transferências internas por walletId funcionam.
- Clientes da Secretfans ficam no grupo `secrefans.app` no Asaas.

## Rotina diária

- Vercel Cron chama `/api/cron/conciliar` às 09:00 UTC (plano Hobby: 1 vez por dia) com
  `Authorization: Bearer CRON_SECRET`. Ela: reconsulta pedidos pendentes e pagos recentes,
  resolve saques em processamento ou travados, avisa assinaturas que acabam em até 3 dias e
  envia a fila de e-mails atrasados.

## E-mail

- Resend, domínio `secretfans.app.br` verificado, remetente `EMAIL_FROM`. Os e-mails de login do
  Supabase também saem pelo Resend (SMTP em `supabase/config.toml`, `[remotes.hml]`).

## Rate limit

- Upstash Redis conectado pela integração da Vercel (`KV_REST_API_URL`/`KV_REST_API_TOKEN`).
  Sem ele, o limite cai para a memória de cada servidor.

## Dados de teste que precisam sair antes de dados reais

- Verificação de identidade do admin aprovada direto no banco ("teste HML").
- Prazos de liberação de saque zerados (voltar para 7 dias Pix / 32 cartão em
  Super Admin → Configurações).
- Conta de recebimento "TEST" vinculada ao admin (walletId da subconta de teste).
- Pedidos, saques e notificações de teste.
