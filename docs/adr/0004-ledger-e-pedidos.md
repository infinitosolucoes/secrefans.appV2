# ADR 0004 — Pedidos, comissão e ledger de partidas dobradas

- **Status:** aceito (12/11/2026)

## Contexto
A Secretfans vende assinaturas, PPV, pacotes, mimos e mensagens pagas, fica com uma comissão e
repassa o restante ao criador. O dinheiro passa pelo Asaas, com ou sem split. Precisamos saber,
a qualquer momento e de forma auditável, quanto pertence a cada criador, quanto é receita da
plataforma e quanto ainda está no provedor, sem que um bug ou uma edição manual apague histórico.

## Decisão
- **Pedido (`orders`)** congela no momento da compra: valor bruto, regra de comissão vigente
  (versão), comissão, taxa estimada do meio de pagamento e líquido do criador. Mudar a comissão
  depois não altera pedidos antigos.
- **Comissão** em `commission_rules`, versionada, sem retroatividade e com aprovação de um segundo
  administrador. O criador aceita a versão vigente.
- **Taxa do meio de pagamento** é paga pelo criador: estimada em `payment_fee_settings` e
  descontada do líquido. A diferença para a taxa real fica com a plataforma (`fee_variance`).
- **Confirmação** só por `confirm_payment`, chamada pelo webhook ou pela conciliação, depois de
  reconsultar o pagamento na API do provedor. Idempotente por `(provider, event_id)`.
- **Ledger** em `ledger_entries` + `ledger_lines`: imutável (gatilhos bloqueiam UPDATE, DELETE e
  TRUNCATE) e balanceado (débitos = créditos, conferido no fim da transação). Contas:
  - `provider_clearing:<provedor>`: dinheiro no provedor;
  - `platform_revenue`: comissões;
  - `creator_payable:<criador>`: o que a plataforma deve ao criador;
  - `fee_variance`: diferença entre a taxa estimada e a real.
- **Lançamentos:**
  - `sale`: D clearing (líquido real) = C criador + C plataforma ± variação de taxa;
  - `refund` / `chargeback`: lançamento inverso da venda (o saldo do criador pode ficar negativo);
  - `split_settlement`: quando o Asaas já pagou o criador por split: D criador / C clearing;
  - `payout`: saque pago ao criador (ver [ADR 0005](0005-saques.md)).
- **Saldo** é projeção do ledger (`creator_balance`, `creator_payout_summary`), nunca um campo
  editável.
- **Renovação** de assinatura: cada cobrança do Asaas vira um pedido novo, com a regra de comissão
  vigente naquela data.

## Consequências
- Correções são feitas com novos lançamentos, nunca editando os antigos.
- A tela Super Admin → Financeiro mostra os totais por tipo de conta e confere o balanço.
- Testes pgTAP cobrem venda, taxa real, split, estorno, imutabilidade e balanço.
- Só o banco local de testes permite apagar o ledger (marcador em `private.environment_markers`).
