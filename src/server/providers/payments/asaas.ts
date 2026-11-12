import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ProviderChargeResult, VerifiedProviderEvent } from "./PaymentProvider";

/**
 * Provedor Asaas (API v3). Cartão é pago na página segura do Asaas (invoiceUrl): dados de cartão
 * nunca passam pela Secretfans. Webhook: token no header + nova consulta do pagamento na API
 * (só confiamos no status e no valor líquido que a própria API devolve).
 */
export const ASAAS_BASE_URL = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

/**
 * Grupo de clientes no Asaas: separa as cobranças da Secretfans de outras da mesma conta
 * (o painel e GET /payments?customerGroupName=… filtram por ele).
 */
export const ASAAS_CUSTOMER_GROUP = "secrefans.app";

export interface AsaasConfig {
  apiKey: string;
  env: keyof typeof ASAAS_BASE_URL;
  webhookToken?: string;
  fetchImpl?: typeof fetch;
}

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Evento que não muda o pedido (ex.: PAYMENT_CREATED, visualizações). */
export class IgnoredEvent extends Error {}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType?: string;
  invoiceUrl?: string;
  subscription?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
  split?: Array<{ walletId: string; fixedValue?: number; totalValue?: number; status?: string }>;
}

/** Total repassado via split (ignora splits cancelados/recusados), em centavos. */
export function splitTotalCents(p: Pick<AsaasPayment, "split">): number {
  return (p.split ?? [])
    .filter((s) => !["CANCELLED", "REFUSED"].includes(s.status ?? ""))
    .reduce((sum, s) => sum + Math.round((s.totalValue ?? s.fixedValue ?? 0) * 100), 0);
}

export interface SplitTarget {
  walletId: string;
  fixedValueCents: number;
}

const toReais = (cents: number) => Math.round(cents) / 100;
const toCents = (reais: number) => Math.round(reais * 100);

/** Data de hoje em São Paulo (AAAA-MM-DD), usada como vencimento. */
export const todayInSaoPaulo = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

/** Status do pagamento na API → status normalizado do banco (null = não muda o pedido). */
export function normalizeAsaasStatus(p: Pick<AsaasPayment, "status" | "deleted">) {
  if (p.deleted) return "failed" as const;
  switch (p.status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid" as const;
    case "REFUNDED":
      return "refunded" as const;
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "chargeback" as const;
    case "OVERDUE":
      return "failed" as const;
    default:
      return null;
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export class AsaasPaymentProvider {
  readonly name = "asaas";
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: AsaasConfig) {
    this.base = ASAAS_BASE_URL[cfg.env];
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // GET pode ser repetido com segurança; POST/DELETE não (evita cobrança duplicada).
    const attempts = method === "GET" ? 2 : 1;
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: {
            access_token: this.cfg.apiKey,
            "Content-Type": "application/json",
            "User-Agent": "secretfans",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) {
          const err = new AsaasError(`Asaas ${method} ${path}: ${res.status}`, res.status, data);
          if (res.status >= 500 && i + 1 < attempts) {
            lastError = err;
            continue;
          }
          throw err;
        }
        return data as T;
      } catch (e) {
        if (e instanceof AsaasError) throw e;
        lastError = e;
      }
    }
    throw lastError;
  }

  async ensureCustomer(input: {
    existingId?: string | null;
    name: string;
    email?: string;
    cpf: string;
    userId: string;
  }): Promise<string> {
    if (input.existingId) return input.existingId;
    const c = await this.request<{ id: string }>("POST", "/customers", {
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpf,
      externalReference: input.userId,
      groupName: ASAAS_CUSTOMER_GROUP,
      notificationDisabled: true,
    });
    return c.id;
  }

  private async withPix(p: AsaasPayment): Promise<ProviderChargeResult> {
    const result: ProviderChargeResult = {
      providerChargeId: p.id,
      status: "pending",
      amount: toCents(p.value),
      checkoutUrl: p.invoiceUrl,
    };
    if (p.billingType === "PIX") {
      const qr = await this.request<{
        encodedImage: string;
        payload: string;
        expirationDate?: string;
      }>("GET", `/payments/${p.id}/pixQrCode`);
      result.pix = {
        copyPaste: qr.payload,
        qrCodeBase64: qr.encodedImage,
        expiresAt: qr.expirationDate,
      };
    }
    return result;
  }

  private splitBody(split?: SplitTarget) {
    return split && split.fixedValueCents > 0
      ? [{ walletId: split.walletId, fixedValue: toReais(split.fixedValueCents) }]
      : undefined;
  }

  async createCharge(input: {
    orderId: string;
    customerId: string;
    amount: number;
    method: "pix" | "card";
    description: string;
    split?: SplitTarget;
  }): Promise<ProviderChargeResult> {
    const p = await this.request<AsaasPayment>("POST", "/payments", {
      customer: input.customerId,
      billingType: input.method === "pix" ? "PIX" : "CREDIT_CARD",
      value: toReais(input.amount),
      dueDate: todayInSaoPaulo(),
      description: input.description.slice(0, 500),
      externalReference: input.orderId,
      split: this.splitBody(input.split),
    });
    return this.withPix(p);
  }

  /** Assinatura mensal: cria no Asaas e devolve a 1ª cobrança (para vincular ao pedido inicial). */
  async createSubscription(input: {
    orderId: string;
    customerId: string;
    amount: number;
    method: "pix" | "card";
    description: string;
    split?: SplitTarget;
  }): Promise<{ subscriptionId: string; charge: ProviderChargeResult }> {
    const sub = await this.request<{ id: string }>("POST", "/subscriptions", {
      customer: input.customerId,
      billingType: input.method === "pix" ? "PIX" : "CREDIT_CARD",
      value: toReais(input.amount),
      nextDueDate: todayInSaoPaulo(),
      cycle: "MONTHLY",
      description: input.description.slice(0, 500),
      externalReference: input.orderId,
      split: this.splitBody(input.split),
    });
    const list = await this.request<{ data: AsaasPayment[] }>(
      "GET",
      `/subscriptions/${sub.id}/payments`,
    );
    const first = list.data?.[0];
    if (!first) throw new AsaasError("Assinatura sem a primeira cobrança", 502);
    return { subscriptionId: sub.id, charge: await this.withPix(first) };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.request("DELETE", `/subscriptions/${subscriptionId}`);
  }

  async refund(paymentId: string, description?: string): Promise<void> {
    await this.request("POST", `/payments/${paymentId}/refund`, { description });
  }

  getPayment(paymentId: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>("GET", `/payments/${paymentId}`);
  }

  async getCharge(paymentId: string): Promise<ProviderChargeResult> {
    return this.withPix(await this.getPayment(paymentId));
  }

  /** Subconta do criador (destino do split). A apiKey só é devolvida nesta chamada. */
  async createFinancialAccount(input: {
    name: string;
    email: string;
    cpfCnpj: string;
    birthDate?: string;
    companyType?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
    mobilePhone: string;
    incomeValue: number;
    address: string;
    addressNumber: string;
    complement?: string;
    province: string;
    postalCode: string;
  }): Promise<{ accountId: string; walletId: string; apiKey?: string }> {
    const acc = await this.request<{
      id: string;
      walletId: string;
      apiKey?: string;
      accessToken?: { apiKey?: string };
    }>("POST", "/accounts", input);
    return {
      accountId: acc.id,
      walletId: acc.walletId,
      apiKey: acc.accessToken?.apiKey ?? acc.apiKey,
    };
  }

  /** Carteiras da própria conta da plataforma (nunca podem ser destino de split). */
  async listOwnWalletIds(): Promise<string[]> {
    const r = await this.request<{ data: Array<{ id: string }> }>("GET", "/wallets");
    return (r.data ?? []).map((w) => w.id.toLowerCase());
  }

  /** Confere o token do webhook (comparação em tempo constante). */
  checkWebhookToken(headers: Headers): boolean {
    const expected = this.cfg.webhookToken;
    const received = headers.get("asaas-access-token");
    if (!expected || !received) return false;
    return timingSafeEqual(sha256(received), sha256(expected));
  }

  async verifyWebhook(headers: Headers, rawBody: string): Promise<VerifiedProviderEvent> {
    if (!this.checkWebhookToken(headers)) throw new AsaasError("token do webhook inválido", 401);
    let body: { id?: string; event?: string; payment?: { id?: string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new AsaasError("corpo inválido", 400);
    }
    if (!body.id || !body.event?.startsWith("PAYMENT_") || !body.payment?.id) {
      throw new IgnoredEvent(body.event ?? "sem evento");
    }
    // Fonte da verdade: a API, não o corpo recebido.
    const payment = await this.getPayment(body.payment.id);
    const status =
      body.event === "PAYMENT_DELETED" ? ("failed" as const) : normalizeAsaasStatus(payment);
    if (!status) throw new IgnoredEvent(`${body.event}/${payment.status}`);
    return {
      provider: this.name,
      eventId: body.id,
      type: body.event,
      payload: { event: body.event, payment: { id: payment.id, status: payment.status } },
      chargeId: payment.id,
      status,
      netCents:
        status === "paid" && payment.netValue != null ? toCents(payment.netValue) : undefined,
      subscriptionId: payment.subscription ?? undefined,
      splitCents: status === "paid" ? splitTotalCents(payment) : undefined,
    };
  }
}
