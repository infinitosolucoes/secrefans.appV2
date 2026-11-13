# ADR 0005 — Saques do criador por Pix

- **Status:** aceito (13/11/2026)

## Contexto

Criadores com conta Asaas vinculada recebem cada venda por split, direto na conta deles. Sem
conta vinculada, o líquido fica com a Secretfans (`creator_payable` no ledger) e precisa ser
sacado. Saque é a operação de maior risco: dinheiro sai e não volta.

## Decisão

- **Saldo disponível** = saldo a receber − vendas ainda em liberação − saque aberto. A liberação
  vale 7 dias no Pix e 32 no cartão (prazo de recebimento do provedor e janela de contestação).
  Os prazos e o saque mínimo ficam em Super Admin → Configurações (auditado).
- **Pedido de saque** (`request_withdrawal`): criador ativo, com verificação de identidade aprovada,
  chave Pix cadastrada, valor entre o mínimo e o disponível, um saque aberto por vez. Trocar a
  chave Pix sempre avisa por e-mail e não é possível com saque aberto.
- **Aprovação humana:** o financeiro (permissão `payout.manage`, sessão com MFA) aprova ou recusa
  com motivo. Ao aprovar, o servidor cria a transferência Pix no Asaas com
  `externalReference = withdrawal:<id>`.
- **Validação por webhook** (mecanismo de segurança do Asaas): antes de executar qualquer
  transferência da conta, o Asaas pergunta à Secretfans. Só aprovamos a que corresponde a um saque
  em processamento (mesmo valor e mesma chave Pix, aprovado há menos de 15 minutos); todo o resto
  é recusado. Isso substitui o token SMS e impede saída de dinheiro não pedida pela plataforma,
  mesmo com a chave da API vazada.
- **Ledger só quando o Pix é confirmado** (`settle_withdrawal`, via webhook `TRANSFER_*` ou
  conciliação diária): D criador / C clearing; a tarifa da transferência fica com a plataforma.
  Falha ou recusa devolve o valor ao saldo, sem lançamento.
- **Sem Pix em dobro:** se o provedor não responder a tempo, o saque fica em processamento e não
  é reenviado automaticamente. "Verificar no Asaas" (e a conciliação, após 10 minutos) procura a
  transferência pela referência: achou, aplica o status; não achou, marca como falha.
- **Limites:** 5 pedidos de saque por minuto por usuário (rate limit) e MFA recomendado ao criador.

## Consequências

- Em produção, ativar a validação de saque na conta Asaas com um token próprio e **não** marcar
  a validação de splits (bloquearia os repasses automáticos).
- Hoje o próprio Super Admin pode aprovar o saque se também for criador; em produção, o ideal é
  separar quem aprova.
- O sandbox do Asaas recusa Pix de saque com `invalid_action`; o fluxo completo foi validado com
  o provedor simulado e com transferências internas no sandbox.
