# ADR 0003 — Abstração de provedor de pagamentos

- **Status:** proposto (05/11/2026)

## Contexto

A intenção é usar Asaas (cobranças, split, subcontas BaaS, transferências). A disponibilidade técnica **não** equivale à aprovação comercial do segmento da SecretFans. Não há aprovação escrita até esta data.

## Decisão

- Toda integração financeira passa pela interface `PaymentProvider` (`src/server/providers/payments/PaymentProvider.ts`).
- Nenhuma implementação real até: aprovação escrita do Asaas (ramo, BaaS para fãs e criadores, cada operação) **ou** escolha de provedor substituto elegível.
- Webhooks: verificação de assinatura, idempotência por `(provider, event_id)`, fila/retry e reconciliação diária (S5).
- Ledger de dupla entrada imutável; saldos são projeção, não custódia no Supabase.

## Consequências

- Nada de cobrança real antes do go/no-go financeiro e jurídico.

## Atualização (13/11/2026): implementação em sandbox

- `AsaasPaymentProvider` implementado e em uso na homologação (`ASAAS_ENV=sandbox`): cliente com
  CPF/CNPJ só no Asaas, Pix com QR, cartão na página segura do Asaas, assinatura mensal,
  estorno, split para a carteira do criador (conta própria ou subconta), transferências Pix.
- O provedor `simulado` continua para desenvolvimento e testes; produção o bloqueia
  (`APP_STAGE=producao`).
- Ledger e pedidos: [ADR 0004](0004-ledger-e-pedidos.md). Saques: [ADR 0005](0005-saques.md).
- A condição desta decisão continua valendo: **cobrança real só com a aprovação escrita do
  Asaas para o segmento +18** (ou outro provedor elegível). Checklist em
  [docs/runbooks/go-live.md](../runbooks/go-live.md).
