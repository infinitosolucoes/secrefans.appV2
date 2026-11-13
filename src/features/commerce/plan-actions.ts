"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export interface PlanResult {
  ok: boolean;
  message: string;
}

const pct = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** Criador: liga/desliga os planos de 3, 6 e 12 meses e define o desconto de cada um. */
export async function savePlansAction(_: PlanResult | null, fd: FormData): Promise<PlanResult> {
  const user = await requireRole(["creator"], "/estudio/vendas");
  const plans = [3, 6, 12].map((months) => ({
    months,
    active: fd.get(`active_${months}`) === "on",
    discount_bps: pct(fd.get(`discount_${months}`) || "0"),
  }));
  if (
    plans.some((p) => Number.isNaN(p.discount_bps) || p.discount_bps < 0 || p.discount_bps > 6000)
  )
    return { ok: false, message: "Desconto de 0% a 60% em cada plano." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_subscription_plans", { p_plans: plans });
  if (error) return { ok: false, message: "Não foi possível salvar os planos." };
  revalidatePath("/estudio/vendas");
  revalidatePath(`/${user.handle}`);
  return { ok: true, message: "Planos salvos." };
}

/** Criador: abre uma promoção (vale só no 1º período do fã). */
export async function startPromotionAction(
  _: PlanResult | null,
  fd: FormData,
): Promise<PlanResult> {
  const user = await requireRole(["creator"], "/estudio/vendas");
  const months = Number(fd.get("months"));
  const discount = pct(fd.get("discount"));
  const days = Number(fd.get("days"));
  const vagasRaw = String(fd.get("vagas") ?? "").trim();
  const vagas = vagasRaw ? Number(vagasRaw) : null;
  if (![1, 3, 6, 12].includes(months)) return { ok: false, message: "Escolha o plano." };
  if (Number.isNaN(discount) || discount < 500 || discount > 9000)
    return { ok: false, message: "Desconto entre 5% e 90%." };
  if (!Number.isInteger(days) || days < 1 || days > 60)
    return { ok: false, message: "Duração de 1 a 60 dias." };
  if (vagas !== null && (!Number.isInteger(vagas) || vagas < 1 || vagas > 100000))
    return { ok: false, message: "Vagas: deixe em branco ou informe de 1 a 100.000." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("start_subscription_promotion", {
    p_months: months,
    p_discount_bps: discount,
    p_message: String(fd.get("message") ?? "").slice(0, 200),
    p_ends_at: new Date(Date.now() + days * 86400_000).toISOString(),
    p_max_redemptions: vagas as number,
  });
  if (error)
    return {
      ok: false,
      message: /plano deste período/.test(error.message)
        ? "Ative esse plano antes de criar a promoção."
        : /preço da assinatura/.test(error.message)
          ? "Defina o preço da assinatura antes."
          : "Não foi possível criar a promoção.",
    };
  revalidatePath("/estudio/vendas");
  revalidatePath(`/${user.handle}`);
  return { ok: true, message: "Promoção no ar." };
}

export async function endPromotionAction() {
  const user = await requireRole(["creator"], "/estudio/vendas");
  const supabase = await createServerSupabase();
  await supabase.rpc("end_subscription_promotion");
  revalidatePath("/estudio/vendas");
  revalidatePath(`/${user.handle}`);
}
