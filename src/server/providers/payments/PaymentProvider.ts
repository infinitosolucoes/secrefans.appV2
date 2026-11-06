/**
 * Contrato interno de provedor de pagamentos (spec §7.3).
 * Sem implementação nesta rodada: Asaas/BaaS depende de aprovação formal por escrito.
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
}

export interface PaymentProvider {
  createFinancialAccount(input: FinancialAccountInput): Promise<ProviderAccountResult>;
  createCharge(input: CreateChargeInput): Promise<ProviderChargeResult>;
  getCharge(id: string): Promise<ProviderChargeResult>;
  requestTransfer(input: TransferInput): Promise<ProviderTransferResult>;
  getBalance(accountId: string): Promise<ProviderBalance>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<VerifiedProviderEvent>;
}
