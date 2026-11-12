/**
 * Contrato interno de provedor de pagamentos (spec §7.3).
 * S4: implementação "simulado" para desenvolvimento/homologação (simulated.ts).
 * Asaas/BaaS (S5) depende de aprovação formal por escrito.
 * Ver docs/adr/0003-payment-provider-abstraction.md.
 */
export type Cents = number;

export interface FinancialAccountInput {
  userId: string;
  kind: "creator" | "fan";
}
export interface ProviderAccountResult {
  providerAccountId: string;
  status: "pending" | "approved" | "rejected";
}
export interface CreateChargeInput {
  orderId: string;
  amount: Cents;
  method: "pix" | "card";
  payerUserId: string;
  splits?: Array<{ providerAccountId: string; amount: Cents }>;
}
export interface ProviderChargeResult {
  providerChargeId: string;
  status: "pending" | "confirmed" | "failed" | "refunded" | "chargeback";
  amount: Cents;
  /** Pix: código copia-e-cola (e QR, quando o provedor devolver). */
  pix?: { copyPaste: string; qrCodeBase64?: string; expiresAt?: string };
  /** Cartão: URL do formulário seguro do provedor (dados do cartão nunca passam pela Secretfans). */
  checkoutUrl?: string;
}
export interface TransferInput {
  fromAccountId: string;
  amount: Cents;
  destination: { type: "pix"; key: string } | { type: "account"; providerAccountId: string };
  idempotencyKey: string;
}
export interface ProviderTransferResult {
  providerTransferId: string;
  status: "pending" | "done" | "failed";
}
export interface ProviderBalance {
  available: Cents;
  pending: Cents;
}
export interface VerifiedProviderEvent {
  provider: string;
  eventId: string;
  type: string;
  payload: unknown;
  /** Normalizado para o banco: referência da cobrança e o novo status. */
  chargeId: string;
  status: "paid" | "failed" | "refunded" | "chargeback";
  /** Valor líquido real (após a taxa do provedor), em centavos. Ausente no simulado. */
  netCents?: number;
  /** Assinatura do provedor à qual a cobrança pertence (renovações). */
  subscriptionId?: string;
  /** Quanto o provedor repassou direto ao criador via split, em centavos. */
  splitCents?: number;
}

export interface PaymentProvider {
  createFinancialAccount(input: FinancialAccountInput): Promise<ProviderAccountResult>;
  createCharge(input: CreateChargeInput): Promise<ProviderChargeResult>;
  getCharge(id: string): Promise<ProviderChargeResult>;
  requestTransfer(input: TransferInput): Promise<ProviderTransferResult>;
  getBalance(accountId: string): Promise<ProviderBalance>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<VerifiedProviderEvent>;
}
