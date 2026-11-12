import "server-only";
import { createServerSupabase } from "@/server/auth/supabase";
import type { CheckoutSlug, OrderKind } from "./constants";

export interface CommissionRule {
  id: string;
  version: number;
  rateBps: number;
  appliesToTips: boolean;
  effectiveFrom: string;
}

/** O fã já tem cadastro de cliente no provedor (CPF informado antes)? */
export async function hasPaymentCustomer(userId: string, provider: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("payment_customers")
    .select("user_id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return Boolean(data);
}

/** Conta de recebimento do criador (subconta do provedor), se houver. */
export async function getPayoutAccount(creatorId: string, provider: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("creator_payout_accounts")
    .select("provider_account_id, wallet_id, status, document_last4, created_at")
    .eq("creator_id", creatorId)
    .eq("provider", provider)
    .maybeSingle();
  return data;
}

/** Saldo a repassar do criador (ledger). */
export async function getCreatorBalanceCents(): Promise<number> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("creator_balance").select("balance_cents").maybeSingle();
  return Number(data?.balance_cents ?? 0);
}

export async function getCurrentCommissionRule(): Promise<CommissionRule | null> {
  const supabase = await createServerSupabase();
  // Mesma regra de current_commission_rule(): aprovada e já vigente, a mais recente.
  const { data } = await supabase
    .from("commission_rules")
    .select("id, version, rate_bps, applies_to_tips, effective_from")
    .eq("status", "approved")
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    version: data.version,
    rateBps: data.rate_bps,
    appliesToTips: data.applies_to_tips,
    effectiveFrom: data.effective_from,
  };
}

/** Versões de pacote que o usuário comprou (acesso ativo). */
export async function getOwnedPackageVersions(userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("entitlements")
    .select("target_id")
    .eq("user_id", userId)
    .eq("kind", "package_version")
    .is("revoked_at", null);
  return new Set((data ?? []).map((e) => e.target_id));
}

export interface ViewerSubscription {
  status: "active" | "canceled" | "expired";
  currentPeriodEnd: string;
}

export async function getViewerSubscription(
  userId: string | undefined,
  creatorId: string,
): Promise<ViewerSubscription | null> {
  if (!userId) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("fan_id", userId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (!data || new Date(data.current_period_end) <= new Date()) return null;
  return { status: data.status, currentPeriodEnd: data.current_period_end };
}

export interface CheckoutItem {
  kind: OrderKind;
  targetId: string;
  title: string;
  detail: string;
  priceCents: number | null;
  creatorHandle: string;
  creatorName: string;
  /** Mensagem quando a compra não é possível (indisponível, já comprado, etc.). */
  blocked?: string;
}

/** Resumo do item para a tela de checkout. O preço exibido é conferido de novo no banco. */
export async function getCheckoutItem(
  slug: CheckoutSlug,
  id: string,
  viewerId: string,
): Promise<CheckoutItem | null> {
  const supabase = await createServerSupabase();
  const creator = async (creatorId: string) =>
    (
      await supabase
        .from("public_profiles")
        .select("handle, display_name, subscription_price_cents")
        .eq("id", creatorId)
        .maybeSingle()
    ).data;

  if (slug === "ppv") {
    const { data: post } = await supabase
      .from("feed_posts")
      .select(
        "id, creator_id, body, price_cents, visibility, media_count, video_count, unlocked, handle, display_name",
      )
      .eq("id", id)
      .maybeSingle();
    if (!post || post.visibility !== "ppv") return null;
    const photos = (post.media_count ?? 0) - (post.video_count ?? 0);
    return {
      kind: "ppv",
      targetId: id,
      title: post.body ? post.body.slice(0, 80) : "Publicação PPV",
      detail: `Desbloqueio avulso · ${photos} foto(s) · ${post.video_count ?? 0} vídeo(s)`,
      priceCents: post.price_cents,
      creatorHandle: post.handle ?? "",
      creatorName: post.display_name || post.handle || "",
      blocked:
        post.creator_id === viewerId
          ? "Esta publicação é sua."
          : post.unlocked
            ? "Você já desbloqueou esta publicação."
            : undefined,
    };
  }
  if (slug === "mensagem") {
    // RLS: só participantes da conversa leem a mensagem.
    const { data: msg } = await supabase
      .from("messages")
      .select("id, body, price_cents, sender_id, deleted_at, conversations(creator_id, fan_id)")
      .eq("id", id)
      .maybeSingle();
    const conv = msg?.conversations as { creator_id: string; fan_id: string } | null | undefined;
    if (!msg || !conv || msg.price_cents == null || msg.deleted_at) return null;
    const c = await creator(conv.creator_id);
    const { count } = await supabase
      .from("entitlements")
      .select("id", { count: "exact", head: true })
      .eq("kind", "message")
      .eq("target_id", id)
      .is("revoked_at", null);
    const name = c?.display_name || c?.handle || "";
    return {
      kind: "message",
      targetId: id,
      title: msg.body ? msg.body.slice(0, 80) : `Mensagem exclusiva de ${name}`,
      detail: "Mensagem paga no chat · desbloqueio avulso",
      priceCents: msg.price_cents,
      creatorHandle: c?.handle ?? "",
      creatorName: name,
      blocked:
        conv.fan_id !== viewerId
          ? "Esta mensagem não é para você."
          : count
            ? "Você já desbloqueou esta mensagem."
            : undefined,
    };
  }
  if (slug === "pacote") {
    const { data: pkg } = await supabase
      .from("public_packages")
      .select(
        "id, creator_id, title, version, version_id, price_cents, audience, photo_count, video_count, handle, display_name",
      )
      .eq("id", id)
      .maybeSingle();
    if (!pkg?.version_id) return null;
    const { data: owned } = await supabase.rpc("has_entitlement", {
      p_kind: "package_version",
      p_target_id: pkg.version_id,
    });
    const { data: subscribed } = await supabase.rpc("has_active_subscription", {
      p_creator_id: pkg.creator_id!,
    });
    return {
      kind: "package",
      targetId: id,
      title: pkg.title ?? "Pacote",
      detail: `Pacote · ${pkg.photo_count ?? 0} foto(s) · ${pkg.video_count ?? 0} vídeo(s) · versão ${pkg.version}`,
      priceCents: pkg.price_cents,
      creatorHandle: pkg.handle ?? "",
      creatorName: pkg.display_name || pkg.handle || "",
      blocked:
        pkg.creator_id === viewerId
          ? "Este pacote é seu."
          : owned
            ? "Você já comprou esta versão do pacote."
            : pkg.audience === "subscribers" && !subscribed
              ? "Pacote exclusivo para assinantes deste criador."
              : undefined,
    };
  }
  const c = await creator(id);
  if (!c) return null;
  const name = c.display_name || c.handle || "";
  if (slug === "assinatura") {
    const { data: subscribed } = await supabase.rpc("has_active_subscription", {
      p_creator_id: id,
    });
    return {
      kind: "subscription",
      targetId: id,
      title: `Assinatura de ${name}`,
      detail: "Mensal · publicações para assinantes · cancele quando quiser",
      priceCents: c.subscription_price_cents,
      creatorHandle: c.handle ?? "",
      creatorName: name,
      blocked:
        id === viewerId
          ? "Você não pode assinar o próprio perfil."
          : c.subscription_price_cents == null
            ? "Este criador ainda não oferece assinatura."
            : subscribed
              ? "Você já assina este criador."
              : undefined,
    };
  }
  return {
    kind: "tip",
    targetId: id,
    title: `Mimo para ${name}`,
    detail: "Um carinho direto para o criador",
    priceCents: null,
    creatorHandle: c.handle ?? "",
    creatorName: name,
    blocked: id === viewerId ? "Você não pode enviar um mimo para si." : undefined,
  };
}
