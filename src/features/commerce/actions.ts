"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { dispatchPendingEmails } from "@/server/email";
import { requireRole, requireUser } from "@/server/auth/session";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import {
  activeProviderName,
  applyPaymentEvent,
  getAsaasProvider,
  getSimulatedProvider,
  simulatedPaymentsAllowed,
} from "@/server/providers/payments";
import { isValidCpf, last4, onlyDigits } from "@/lib/cpf";
import { UUID_RE } from "@/features/content/constants";
import { parsePriceToCents } from "@/features/content/schemas";
import {
  CHECKOUT_KINDS,
  SUBSCRIPTION_PRICE_MAX,
  SUBSCRIPTION_PRICE_MIN,
  TIP_OPTIONS,
} from "./constants";

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
    // Botões prontos enviam centavos (TIP_OPTIONS); "Outro valor" é digitado em reais.
    const preset = Number(fd.get("amount"));
    amount =
      fd.get("amount") === "outro"
        ? parsePriceToCents(fd.get("customAmount"))
        : (TIP_OPTIONS as readonly number[]).includes(preset)
          ? preset
          : null;
    if (amount === null || Number.isNaN(amount) || amount < 500 || amount > 100000)
      return { ok: false, message: "Escolha um mimo entre R$ 5 e R$ 1.000." };
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
    .select("id, gross_cents, buyer_id, creator_id, kind, description, method, provider_ref")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false, message: "Pedido não encontrado." };

  if (!order.provider_ref) {
    const result =
      activeProviderName() === "asaas"
        ? await chargeWithAsaas(order, fd.get("cpf"))
        : await chargeSimulated(order);
    if (!result.ok) return result;
  }
  redirect(`/pedido/${order.id}`);
}

interface PendingOrder {
  id: string;
  gross_cents: number;
  buyer_id: string;
  creator_id: string;
  kind: string;
  description: string;
  method: string;
}

async function chargeSimulated(order: PendingOrder): Promise<CheckoutResult> {
  try {
    const provider = getSimulatedProvider();
    const db = createServiceSupabase();
    const { error } = await db.rpc("prepare_order_charge", {
      p_order_id: order.id,
      p_provider: provider.name,
    });
    if (error) throw error;
    const charge = await provider.createCharge({
      orderId: order.id,
      amount: order.gross_cents,
      method: order.method as "pix" | "card",
      payerUserId: order.buyer_id,
    });
    await db.rpc("attach_order_charge", {
      p_order_id: order.id,
      p_provider: provider.name,
      p_provider_ref: charge.providerChargeId,
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Pagamentos indisponíveis neste ambiente no momento." };
  }
}

async function chargeWithAsaas(order: PendingOrder, cpfInput: FormDataEntryValue | null) {
  const db = createServiceSupabase();
  let asaas;
  try {
    asaas = getAsaasProvider();
  } catch {
    return { ok: false, message: "Pagamentos indisponíveis no momento." };
  }

  // Cliente do fã no Asaas (CPF exigido só na primeira compra; guardamos só o final).
  const { data: customer } = await db
    .from("payment_customers")
    .select("provider_customer_id")
    .eq("user_id", order.buyer_id)
    .eq("provider", "asaas")
    .maybeSingle();
  let customerId = customer?.provider_customer_id ?? null;
  if (!customerId) {
    const cpf = onlyDigits(cpfInput);
    if (!isValidCpf(cpf)) return { ok: false, message: "Informe um CPF válido." };
    const { data: authUser } = await db.auth.admin.getUserById(order.buyer_id);
    const { data: profile } = await db
      .from("profiles")
      .select("display_name, handle")
      .eq("id", order.buyer_id)
      .single();
    try {
      customerId = await asaas.ensureCustomer({
        name: profile?.display_name || profile?.handle || "Cliente Secretfans",
        email: authUser.user?.email,
        cpf,
        userId: order.buyer_id,
      });
    } catch {
      return {
        ok: false,
        message: "Não foi possível validar seus dados no provedor de pagamentos.",
      };
    }
    await db.from("payment_customers").upsert({
      user_id: order.buyer_id,
      provider: "asaas",
      provider_customer_id: customerId,
      cpf_last4: last4(cpf),
    });
  }

  // Taxa estimada (paga pelo criador) e split para a subconta do criador, se aprovada.
  const { data: creatorNet, error: prepError } = await db.rpc("prepare_order_charge", {
    p_order_id: order.id,
    p_provider: "asaas",
  });
  if (prepError || creatorNet == null)
    return {
      ok: false,
      message:
        prepError?.code === "22023"
          ? "Valor baixo demais para esta forma de pagamento."
          : "Não foi possível preparar o pagamento.",
    };
  const { data: payout } = await db
    .from("creator_payout_accounts")
    .select("wallet_id, status")
    .eq("creator_id", order.creator_id)
    .eq("provider", "asaas")
    .maybeSingle();
  const split =
    payout?.status === "approved"
      ? { walletId: payout.wallet_id, fixedValueCents: creatorNet }
      : undefined;

  const input = {
    orderId: order.id,
    customerId,
    amount: order.gross_cents,
    method: order.method as "pix" | "card",
    description: `Secretfans · ${order.description}`,
    split,
  };
  try {
    if (order.kind === "subscription") {
      const { subscriptionId, charge } = await asaas.createSubscription(input);
      await db.rpc("attach_order_charge", {
        p_order_id: order.id,
        p_provider: "asaas",
        p_provider_ref: charge.providerChargeId,
        p_provider_subscription_id: subscriptionId,
      });
    } else {
      const charge = await asaas.createCharge(input);
      await db.rpc("attach_order_charge", {
        p_order_id: order.id,
        p_provider: "asaas",
        p_provider_ref: charge.providerChargeId,
      });
    }
  } catch {
    return { ok: false, message: "O provedor de pagamentos não respondeu. Tente novamente." };
  }
  return { ok: true };
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
  const provider = getSimulatedProvider();
  const { body, signature } = provider.signEvent(order.provider_ref, status);
  const event = await provider.verifyWebhook(
    new Headers({ "x-simulado-signature": signature }),
    body,
  );
  await applyPaymentEvent(event);
  after(() => dispatchPendingEmails().catch(() => undefined));
  revalidatePath(`/pedido/${orderId}`);
  revalidatePath("/biblioteca");
}

export async function cancelSubscriptionAction(fd: FormData): Promise<void> {
  const user = await requireUser("/biblioteca");
  const creatorId = String(fd.get("creatorId") ?? "");
  if (!UUID_RE.test(creatorId)) return;
  const supabase = await createServerSupabase();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id")
    .eq("fan_id", user.id)
    .eq("creator_id", creatorId)
    .maybeSingle();
  const { error } = await supabase.rpc("cancel_subscription", { p_creator_id: creatorId });
  // Interrompe as próximas cobranças no provedor (o acesso segue até o fim do período pago).
  if (!error && sub?.provider === "asaas" && sub.provider_subscription_id) {
    try {
      await getAsaasProvider().cancelSubscription(sub.provider_subscription_id);
    } catch {
      // A conciliação diária detecta assinaturas canceladas aqui e ainda ativas no provedor.
    }
  }
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
