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
