import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createServiceSupabase } from "@/server/auth/supabase";
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

export function getPaymentProvider(): SimulatedPaymentProvider {
  const env = serverEnv();
  if (env.PAYMENT_PROVIDER === "asaas")
    throw new Error("Provedor Asaas ainda não configurado (S5, depende de aprovação formal).");
  if (!simulatedPaymentsAllowed())
    throw new Error("Pagamentos simulados não são permitidos neste ambiente.");
  // Fora do desenvolvimento local, o segredo de desenvolvimento (público no código) não vale.
  if (!env.SIMULATED_WEBHOOK_SECRET && process.env.NODE_ENV === "production")
    throw new Error("SIMULATED_WEBHOOK_SECRET é obrigatório fora do desenvolvimento local.");
  return new SimulatedPaymentProvider(env.SIMULATED_WEBHOOK_SECRET ?? DEV_SECRET);
}

/**
 * Aplica um evento de pagamento JÁ VERIFICADO (assinatura conferida) no banco.
 * Único caminho que libera acesso; o banco garante idempotência por (provedor, evento).
 */
export async function applyPaymentEvent(event: VerifiedProviderEvent): Promise<string> {
  const { data, error } = await createServiceSupabase().rpc("confirm_payment", {
    p_provider: event.provider,
    p_event_id: event.eventId,
    p_provider_ref: event.chargeId,
    p_status: event.status,
    p_payload: event.payload as never,
  });
  if (error) throw new Error(`confirm_payment: ${error.code ?? "erro"}`);
  return data ?? "ignored";
}
