"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole, requireUser } from "@/server/auth/session";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import {
  applyPaymentEvent,
  getPaymentProvider,
  simulatedPaymentsAllowed,
} from "@/server/providers/payments";
import { UUID_RE } from "@/features/content/constants";
import { parsePriceToCents } from "@/features/content/schemas";
import { CHECKOUT_KINDS, SUBSCRIPTION_PRICE_MAX, SUBSCRIPTION_PRICE_MIN } from "./constants";

export interface CheckoutResult {
  ok: boolean;
  message?: string;
}

const checkoutSchema = z.object({
  tipo: z.enum(
    Object.keys(CHECKOUT_KINDS) as [
      keyof typeof CHECKOUT_KINDS,
      ...Array<keyof typeof CHECKOUT_KINDS>,
    ],
  ),
  id: z.string().regex(UUID_RE),
  method: z.enum(["pix", "card"]),
  idempotencyKey: z.string().regex(UUID_RE),
  accept: z.literal("on", { message: "Aceite a política de compras para continuar." }),
});

const orderErrors: Record<string, string> = {
  "23505": "Você já tem acesso a este conteúdo.",
  P0002: "Este conteúdo não está disponível para compra.",
  P0001: "Este criador ainda não está habilitado para vendas.",
  "42501": "Você não pode comprar este conteúdo.",
  "22023": "Revise o valor e a forma de pagamento.",
};

/** Cria o pedido (preço e comissão calculados no banco) e a cobrança no provedor. */
export async function startCheckoutAction(
  _: CheckoutResult | null,
  fd: FormData,
): Promise<CheckoutResult> {
  await requireUser("/biblioteca");
  const parsed = checkoutSchema.safeParse({
    tipo: fd.get("tipo"),
    id: fd.get("id"),
    method: fd.get("method"),
    idempotencyKey: fd.get("idempotencyKey"),
    accept: fd.get("accept"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  const kind = CHECKOUT_KINDS[d.tipo];

  let amount: number | null = null;
  if (kind === "tip") {
    const raw = fd.get("amount") === "outro" ? fd.get("customAmount") : fd.get("amount");
    amount = parsePriceToCents(raw);
    if (amount === null || Number.isNaN(amount) || amount < 500 || amount > 100000)
      return { ok: false, message: "Escolha uma gorjeta entre R$ 5 e R$ 1.000." };
  }

  const supabase = await createServerSupabase();
  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_kind: kind,
    p_target_id: d.id,
    p_amount_cents: amount as number,
    p_method: d.method,
    p_idempotency_key: d.idempotencyKey,
  });
  if (error || !orderId)
    return {
      ok: false,
      message: orderErrors[error?.code ?? ""] ?? "Não foi possível criar o pedido.",
    };

  const { data: order } = await supabase
    .from("orders")
    .select("id, gross_cents, buyer_id, method, provider_ref")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, message: "Pedido não encontrado." };

  if (!order.provider_ref) {
    try {
      const provider = getPaymentProvider();
      const charge = await provider.createCharge({
        orderId: order.id,
        amount: order.gross_cents,
        method: order.method as "pix" | "card",
        payerUserId: order.buyer_id,
      });
      await createServiceSupabase().rpc("attach_order_charge", {
        p_order_id: order.id,
        p_provider: provider.name,
        p_provider_ref: charge.providerChargeId,
      });
    } catch {
      return { ok: false, message: "Pagamentos indisponíveis neste ambiente no momento." };
    }
  }
  redirect(`/pedido/${order.id}`);
}

/**
 * Ambiente de teste: simula o provedor enviando o evento ao webhook. Passa pela mesma verificação
 * de assinatura e pelo mesmo confirm_payment idempotente; nunca disponível em produção.
 */
export async function simulatePaymentAction(fd: FormData): Promise<void> {
  const user = await requireUser("/biblioteca");
  const orderId = String(fd.get("orderId") ?? "");
  const status = fd.get("status") === "failed" ? "failed" : "paid";
  if (!UUID_RE.test(orderId) || !simulatedPaymentsAllowed()) return;
  const supabase = await createServerSupabase();
  const { data: order } = await supabase
    .from("orders")
    .select("id, buyer_id, provider, provider_ref")
    .eq("id", orderId)
    .single();
  if (!order || order.buyer_id !== user.id || order.provider !== "simulado" || !order.provider_ref)
    return;
  const provider = getPaymentProvider();
  const { body, signature } = provider.signEvent(order.provider_ref, status);
  const event = await provider.verifyWebhook(
    new Headers({ "x-simulado-signature": signature }),
    body,
  );
  await applyPaymentEvent(event);
  revalidatePath(`/pedido/${orderId}`);
  revalidatePath("/biblioteca");
}

export async function cancelSubscriptionAction(fd: FormData): Promise<void> {
  await requireUser("/biblioteca");
  const creatorId = String(fd.get("creatorId") ?? "");
  if (!UUID_RE.test(creatorId)) return;
  const supabase = await createServerSupabase();
  await supabase.rpc("cancel_subscription", { p_creator_id: creatorId });
  revalidatePath("/biblioteca");
}

export async function setSubscriptionPriceAction(
  _: CheckoutResult | null,
  fd: FormData,
): Promise<CheckoutResult> {
  const user = await requireRole(["creator"], "/estudio/vendas");
  const disable = fd.get("disable") === "1";
  let cents: number | null = null;
  if (!disable) {
    cents = parsePriceToCents(fd.get("price"));
    if (
      cents === null ||
      Number.isNaN(cents) ||
      cents < SUBSCRIPTION_PRICE_MIN * 100 ||
      cents > SUBSCRIPTION_PRICE_MAX * 100
    )
      return {
        ok: false,
        message: `Informe um preço entre R$ ${SUBSCRIPTION_PRICE_MIN} e R$ ${SUBSCRIPTION_PRICE_MAX}.`,
      };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ subscription_price_cents: cents })
    .eq("id", user.id);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: disable ? "Assinatura desativada para novos fãs." : "Preço da assinatura atualizado.",
  };
}

export async function acceptCommissionAction(fd: FormData): Promise<void> {
  await requireRole(["creator"], "/estudio/comissao");
  const ruleId = String(fd.get("ruleId") ?? "");
  if (!UUID_RE.test(ruleId)) return;
  const supabase = await createServerSupabase();
  await supabase.rpc("accept_commission_rule", { p_rule_id: ruleId });
  revalidatePath("/estudio", "layout");
}
