"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import type { AdminResult } from "./actions";

const proposeSchema = z.object({
  percent: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .pipe(z.number().min(0, "Mínimo 0%").max(50, "Máximo 50%")),
  effectiveFrom: z.string().min(10, "Informe a data de início da vigência."),
  appliesToTips: z.boolean(),
  reason: z.string().trim().min(5, "Justificativa obrigatória (mín. 5 caracteres).").max(500),
});

const messages: Record<string, string> = {
  "42501": "Acesso negado.",
  "22023": "Vigência precisa ser futura (sem retroatividade).",
  P0002: "Proposta não encontrada ou já decidida.",
};

export async function proposeCommissionAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  await requireStaffMfa("commission.manage");
  const parsed = proposeSchema.safeParse({
    percent: String(fd.get("percent") ?? ""),
    effectiveFrom: String(fd.get("effectiveFrom") ?? ""),
    appliesToTips: fd.get("appliesToTips") === "on",
    reason: String(fd.get("reason") ?? ""),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  // O campo datetime-local vem sem fuso: interpretamos no horário de Brasília (UTC-3).
  const effective = new Date(`${parsed.data.effectiveFrom}:00-03:00`);
  if (Number.isNaN(effective.getTime())) return { ok: false, message: "Data inválida." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("propose_commission_rule", {
    p_rate_bps: Math.round(parsed.data.percent * 100),
    p_effective_from: effective.toISOString(),
    p_applies_to_tips: parsed.data.appliesToTips,
    p_reason: parsed.data.reason,
  });
  if (error)
    return { ok: false, message: messages[error.code ?? ""] ?? "Não foi possível propor." };
  revalidatePath("/super-admin/comissoes");
  return {
    ok: true,
    message: `Versão ${data} enviada para aprovação. Outro administrador precisa aprovar.`,
  };
}

const feeSchema = z.object({
  provider: z.enum(["asaas"]),
  method: z.enum(["pix", "card"]),
  fixed: z
    .string()
    .trim()
    .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
    .pipe(z.number().int().min(0, "Valor fixo inválido").max(10000, "Máximo R$ 100")),
  percent: z
    .string()
    .trim()
    .transform((v) => Math.round(Number(v.replace(",", ".") || "0") * 100))
    .pipe(z.number().int().min(0, "Percentual inválido").max(2000, "Máximo 20%")),
  reason: z.string().trim().min(5, "Justificativa obrigatória (mín. 5 caracteres).").max(500),
});

/** Atualiza a taxa ESTIMADA do meio de pagamento (paga pelo criador). Vale para pedidos novos. */
export async function setPaymentFeeAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  await requireStaffMfa("commission.manage");
  const parsed = feeSchema.safeParse({
    provider: fd.get("provider"),
    method: fd.get("method"),
    fixed: String(fd.get("fixed") ?? ""),
    percent: String(fd.get("percent") ?? ""),
    reason: String(fd.get("reason") ?? ""),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_payment_fee", {
    p_provider: parsed.data.provider,
    p_method: parsed.data.method,
    p_fixed_cents: parsed.data.fixed,
    p_bps: parsed.data.percent,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: messages[error.code ?? ""] ?? "Não foi possível salvar." };
  revalidatePath("/super-admin/financeiro");
  return { ok: true, message: "Taxa atualizada para os próximos pedidos." };
}

export async function decideCommissionAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  await requireStaffMfa("commission.manage");
  const id = z.uuid().safeParse(fd.get("ruleId"));
  const reason = String(fd.get("reason") ?? "").trim();
  const approve = fd.get("decision") === "approve";
  if (!id.success) return { ok: false, message: "Proposta inválida." };
  if (reason.length < 3) return { ok: false, message: "Informe o motivo da decisão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("decide_commission_rule", {
    p_rule_id: id.data,
    p_approve: approve,
    p_reason: reason,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "A aprovação precisa ser de outro administrador."
          : (messages[error.code ?? ""] ?? "Não foi possível decidir."),
    };
  revalidatePath("/super-admin/comissoes");
  return { ok: true, message: approve ? "Nova taxa aprovada e agendada." : "Proposta rejeitada." };
}
