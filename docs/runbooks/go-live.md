# Checklist de produção (go-live)

Nada de cobrança real antes de **todos** os itens de "Bloqueantes".

## Bloqueantes
- [ ] **Asaas:** aprovação escrita para o segmento +18; conta de produção CNPJ aprovada; split
      habilitado; chave Pix da conta; Pix de saque testado em produção com valor baixo.
- [ ] **Jurídico:** Termos de uso, Política de privacidade (LGPD), política de compras e
      reembolso, regras de conteúdo e de consentimento revisadas por advogado.
- [ ] **Ambiente de produção separado:** novo projeto Supabase (plano pago, região sa-east-1) e
      novo projeto Vercel (plano Pro, região gru1). Não reaproveitar a homologação.
- [ ] **Domínio:** apontar o domínio final, `NEXT_PUBLIC_SITE_URL` e as URLs de redirecionamento
      do Supabase Auth.

## Configuração do ambiente de produção
- [ ] Variáveis (ver `.env.example`): `APP_STAGE=producao`, `PAYMENT_PROVIDER=asaas`,
      `ASAAS_ENV=production`, `ALLOW_SIMULATED_PAYMENTS=false`, chaves novas (nunca as de HML).
- [ ] `ASAAS_WEBHOOK_TOKEN`, `ASAAS_TRANSFER_VALIDATION_TOKEN` e `CRON_SECRET` gerados de novo.
- [ ] Webhook do Asaas registrado (`scripts/asaas-register-webhook.mjs`) e validação de saque
      ativada no painel de produção (sem validação de splits).
- [ ] Resend: chave de produção só com permissão de envio; SMTP do Supabase Auth apontando para
      ela.
- [ ] Upstash Redis de produção conectado.
- [ ] `npx supabase db push` no projeto novo (sem `seed.sql`).
- [ ] Taxas estimadas (Financeiro) e comissão (Comissões) conferidas com o contrato do Asaas.
- [ ] Prazos de liberação de saque: 7 dias Pix, 32 cartão; saque mínimo definido.
- [ ] Super Admin e equipe com MFA; separar quem aprova saque de quem é criador.

## Antes de abrir para o público
- [ ] Logo vetorial (SVG) e imagens licenciadas.
- [ ] Monitoramento de erros (ex.: Sentry) e alertas de falha no webhook e na rotina diária.
- [ ] Backup do banco conferido (plano pago do Supabase) e teste de restauração.
- [ ] Rodar a suíte completa contra o ambiente de produção antes de abrir (com dados de teste
      apagados em seguida).
- [ ] Revisar `docs/runbooks/homologacao.md` → "Dados de teste" (nada disso deve existir em
      produção).
