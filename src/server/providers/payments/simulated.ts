import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  CreateChargeInput,
  PaymentProvider,
  ProviderChargeResult,
  VerifiedProviderEvent,
} from "./PaymentProvider";

const STATUSES = ["paid", "failed", "refunded", "chargeback"] as const;

/**
 * Provedor simulado (S4): mesmo contrato do provedor real. Cria cobranças fictícias e só confirma
 * por evento assinado (HMAC), seguindo o mesmo caminho do webhook real até o banco.
 * Proibido em produção (ver getPaymentProvider).
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = "simulado";
  constructor(private readonly secret: string) {}

  async createCharge(input: CreateChargeInput): Promise<ProviderChargeResult> {
    const id = `sim_${randomUUID()}`;
    return {
      providerChargeId: id,
      status: "pending",
      amount: input.amount,
      ...(input.method === "pix"
        ? {
            pix: {
              copyPaste: `00020126SIMULADO-SECRETFANS-${id}-5204000053039865405${(input.amount / 100).toFixed(2)}`,
              expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
            },
          }
        : { checkoutUrl: undefined }),
    };
  }

  async getCharge(id: string): Promise<ProviderChargeResult> {
    return { providerChargeId: id, status: "pending", amount: 0 };
  }

  /** Monta o corpo e a assinatura de um evento, como o provedor enviaria ao webhook. */
  signEvent(chargeId: string, status: (typeof STATUSES)[number]) {
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      chargeId,
      status,
      at: new Date().toISOString(),
    });
    return { body, signature: this.sign(body) };
  }

  private sign(body: string) {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  async verifyWebhook(headers: Headers, rawBody: string): Promise<VerifiedProviderEvent> {
    const received = headers.get("x-simulado-signature") ?? "";
    const expected = this.sign(rawBody);
    const ok =
      received.length === expected.length &&
      timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
    if (!ok) throw new Error("assinatura inválida");
    const data = JSON.parse(rawBody) as { id: string; chargeId: string; status: string };
    if (!STATUSES.includes(data.status as (typeof STATUSES)[number]))
      throw new Error("status inválido");
    return {
      provider: this.name,
      eventId: data.id,
      type: `charge.${data.status}`,
      payload: data,
      chargeId: data.chargeId,
      status: data.status as VerifiedProviderEvent["status"],
    };
  }

  async createFinancialAccount(): Promise<never> {
    throw new Error("Contas financeiras chegam com o parceiro BaaS (S6).");
  }
  async requestTransfer(): Promise<never> {
    throw new Error("Transferências chegam com o parceiro BaaS (S6).");
  }
  async getBalance(): Promise<never> {
    throw new Error("Saldo chega com o parceiro BaaS (S6).");
  }
}
