import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createServiceSupabase } from "@/server/auth/supabase";
import { AsaasPaymentProvider } from "./asaas";
import type { VerifiedProviderEvent } from "./PaymentProvider";
import { isSimulatedAllowed } from "./policy";
import { SimulatedPaymentProvider } from "./simulated";

/** Segredo de desenvolvimento quando SIMULATED_WEBHOOK_SECRET não está definido (só local). */
const DEV_SECRET = "dev-only-simulated-webhook-secret";

export function simulatedPaymentsAllowed(): boolean {
  const env = serverEnv();
  return isSimulatedAllowed({
    provider: env.PAYMENT_PROVIDER,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    allowSimulated: env.ALLOW_SIMULATED_PAYMENTS === "true",
    appStage: env.APP_STAGE,
  });
}

export function getSimulatedProvider(): SimulatedPaymentProvider {
  const env = serverEnv();
  if (!simulatedPaymentsAllowed())
    throw new Error("Pagamentos simulados não são permitidos neste ambiente.");
  // Fora do desenvolvimento local, o segredo de desenvolvimento (público no código) não vale.
  if (!env.SIMULATED_WEBHOOK_SECRET && process.env.NODE_ENV === "production")
    throw new Error("SIMULATED_WEBHOOK_SECRET é obrigatório fora do desenvolvimento local.");
  return new SimulatedPaymentProvider(env.SIMULATED_WEBHOOK_SECRET ?? DEV_SECRET);
}

export function getAsaasProvider(): AsaasPaymentProvider {
  const env = serverEnv();
  if (!env.ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada.");
  return new AsaasPaymentProvider({
    apiKey: env.ASAAS_API_KEY,
    env: env.ASAAS_ENV,
    webhookToken: env.ASAAS_WEBHOOK_TOKEN,
  });
}

/** Provedor ativo do ambiente (PAYMENT_PROVIDER). */
export function getPaymentProvider(): SimulatedPaymentProvider | AsaasPaymentProvider {
  return serverEnv().PAYMENT_PROVIDER === "asaas" ? getAsaasProvider() : getSimulatedProvider();
}

export const activeProviderName = () => serverEnv().PAYMENT_PROVIDER;

/**
 * Aplica um evento de pagamento JÁ VERIFICADO no banco. Único caminho que libera acesso;
 * o banco garante idempotência por (provedor, evento) e lança no ledger na mesma transação.
 * Mensalidades geradas pelo provedor viram um pedido de renovação antes da confirmação.
 */
export async function applyPaymentEvent(event: VerifiedProviderEvent): Promise<string> {
  const db = createServiceSupabase();
  if (event.subscriptionId) {
    const { error } = await db.rpc("create_renewal_order", {
      p_provider: event.provider,
      p_provider_ref: event.chargeId,
      p_provider_subscription_id: event.subscriptionId,
    });
    if (error) throw new Error(`create_renewal_order: ${error.code ?? "erro"}`);
  }
  const { data, error } = await db.rpc("confirm_payment", {
    p_provider: event.provider,
    p_event_id: event.eventId,
    p_provider_ref: event.chargeId,
    p_status: event.status,
    p_payload: event.payload as never,
    ...(event.netCents != null ? { p_net_cents: event.netCents } : {}),
  });
  if (error) throw new Error(`confirm_payment: ${error.code ?? "erro"}`);
  return data ?? "ignored";
}
