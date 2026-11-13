import "server-only";
import { createServiceSupabase } from "@/server/auth/supabase";
import { getAsaasProvider } from "@/server/providers/payments";

/**
 * Promoção vale só no 1º período: depois que a 1ª cobrança (com desconto) é paga, a assinatura no
 * Asaas passa a cobrar o preço normal, com o split recalculado para o novo líquido do criador.
 * Idempotente: confere o valor atual no Asaas antes de alterar.
 */
export async function syncPromotionalSubscription(orderId: string): Promise<"ok" | "skip"> {
  const db = createServiceSupabase();
  const { data: o } = await db
    .from("orders")
    .select(
      "id, creator_id, provider, provider_subscription_id, promotion_id, renewal_of, gross_cents, renewal_price_cents, status",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (
    !o ||
    o.status !== "paid" ||
    o.provider !== "asaas" ||
    !o.provider_subscription_id ||
    o.renewal_of ||
    o.renewal_price_cents == null ||
    o.renewal_price_cents === o.gross_cents
  )
    return "skip";

  const { data: terms } = await db
    .rpc("subscription_renewal_terms", { p_order_id: o.id })
    .maybeSingle();
  if (!terms) return "skip";
  const asaas = getAsaasProvider();
  const current = await asaas.getSubscription(o.provider_subscription_id);
  if (Math.round(current.value * 100) === terms.renewal_cents) return "ok";

  const { data: payout } = await db
    .from("creator_payout_accounts")
    .select("wallet_id, status")
    .eq("creator_id", o.creator_id)
    .eq("provider", "asaas")
    .maybeSingle();
  const split =
    payout?.status === "approved" && terms.creator_net_cents > 0
      ? { walletId: payout.wallet_id, fixedValueCents: terms.creator_net_cents }
      : undefined;
  await asaas.updateSubscriptionValue(o.provider_subscription_id, terms.renewal_cents, split);
  return "ok";
}

/** Conciliação: promoções pagas nos últimos 3 dias cuja assinatura ainda cobra o valor antigo. */
export async function reconcilePromotionalSubscriptions() {
  const db = createServiceSupabase();
  const { data } = await db
    .from("orders")
    .select("id")
    .eq("provider", "asaas")
    .eq("status", "paid")
    .not("promotion_id", "is", null)
    .is("renewal_of", null)
    .gt("paid_at", new Date(Date.now() - 3 * 86400_000).toISOString())
    .limit(100);
  let synced = 0;
  for (const o of data ?? []) {
    try {
      if ((await syncPromotionalSubscription(o.id)) === "ok") synced++;
    } catch {
      // tenta de novo na próxima execução
    }
  }
  return { checked: data?.length ?? 0, synced };
}
