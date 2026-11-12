"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/session";
import { createServiceSupabase } from "@/server/auth/supabase";
import { serverEnv } from "@/lib/env.server";
import { getAsaasProvider } from "@/server/providers/payments";
import { AsaasError } from "@/server/providers/payments/asaas";
import { isValidCnpj, isValidCpf, last4, onlyDigits } from "@/lib/cpf";
import { parsePriceToCents } from "@/features/content/schemas";

export interface PayoutResult {
  ok: boolean;
  message: string;
}

const schema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(5, "Informe o nome completo ou a razão social.")
      .max(120)
      // O Asaas bloqueia a aprovação com dígitos ou símbolos no nome.
      .regex(/^[\p{L}\s.'&]+$/u, "Use só letras no nome (sem números ou símbolos)."),
    document: z.string().transform(onlyDigits),
    birthDate: z.string().optional(),
    companyType: z.enum(["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"]).optional(),
    mobilePhone: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v.length === 11, "Celular com DDD (11 dígitos)."),
    income: z.string(),
    postalCode: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v.length === 8, "CEP com 8 dígitos."),
    address: z.string().trim().min(3, "Informe o endereço."),
    addressNumber: z.string().trim().min(1, "Informe o número."),
    complement: z.string().trim().max(60).optional(),
    province: z.string().trim().min(2, "Informe o bairro."),
  })
  .superRefine((d, ctx) => {
    if (d.document.length === 11) {
      if (!isValidCpf(d.document)) ctx.addIssue({ code: "custom", message: "CPF inválido." });
      if (!d.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate))
        ctx.addIssue({ code: "custom", message: "Informe a data de nascimento." });
    } else if (d.document.length === 14) {
      if (!isValidCnpj(d.document)) ctx.addIssue({ code: "custom", message: "CNPJ inválido." });
      if (!d.companyType) ctx.addIssue({ code: "custom", message: "Informe o tipo de empresa." });
    } else {
      ctx.addIssue({ code: "custom", message: "Informe um CPF ou CNPJ válido." });
    }
  });

/** Cria a subconta Asaas do criador (destino do split das vendas). */
export async function registerPayoutAccountAction(
  _: PayoutResult | null,
  fd: FormData,
): Promise<PayoutResult> {
  const user = await requireRole(["creator"], "/estudio/recebimentos");
  const get = (k: string) => {
    const v = fd.get(k);
    return v === null || v === "" ? undefined : String(v);
  };
  const parsed = schema.safeParse({
    legalName: get("legalName") ?? "",
    document: get("document") ?? "",
    birthDate: get("birthDate"),
    companyType: get("companyType"),
    mobilePhone: get("mobilePhone") ?? "",
    income: get("income") ?? "",
    postalCode: get("postalCode") ?? "",
    address: get("address") ?? "",
    addressNumber: get("addressNumber") ?? "",
    complement: get("complement"),
    province: get("province") ?? "",
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Revise os dados." };
  const d = parsed.data;
  const income = parsePriceToCents(d.income);
  if (!income || Number.isNaN(income) || income < 100)
    return { ok: false, message: "Informe a renda ou faturamento mensal." };

  const db = createServiceSupabase();
  const { data: existing } = await db
    .from("creator_payout_accounts")
    .select("status")
    .eq("creator_id", user.id)
    .eq("provider", "asaas")
    .maybeSingle();
  if (existing) return { ok: false, message: "Sua conta de recebimento já foi cadastrada." };

  const { data: authUser } = await db.auth.admin.getUserById(user.id);
  const email = authUser.user?.email;
  if (!email) return { ok: false, message: "Sua conta precisa de um e-mail confirmado." };

  let account;
  try {
    account = await getAsaasProvider().createFinancialAccount({
      name: d.legalName,
      email,
      cpfCnpj: d.document,
      birthDate: d.document.length === 11 ? d.birthDate : undefined,
      companyType: d.document.length === 14 ? d.companyType : undefined,
      mobilePhone: d.mobilePhone,
      incomeValue: income / 100,
      address: d.address,
      addressNumber: d.addressNumber,
      complement: d.complement,
      province: d.province,
      postalCode: d.postalCode,
    });
  } catch (e) {
    const detail =
      e instanceof AsaasError
        ? ((e.details as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ?? "")
        : "";
    return {
      ok: false,
      message: detail
        ? `O Asaas recusou o cadastro: ${detail}`
        : "Não foi possível criar a conta de recebimento agora.",
    };
  }

  // Sandbox aprova automaticamente; em produção a aprovação do Asaas é acompanhada depois.
  const status = serverEnv().ASAAS_ENV === "sandbox" ? "approved" : "pending";
  const { error } = await db.rpc("register_payout_account", {
    p_creator_id: user.id,
    p_provider: "asaas",
    p_account_id: account.accountId,
    p_wallet_id: account.walletId,
    p_status: status,
    p_document_last4: last4(d.document),
    p_secret: account.apiKey ? { apiKey: account.apiKey } : undefined,
  });
  if (error) return { ok: false, message: "Conta criada no Asaas, mas não foi possível salvar." };
  revalidatePath("/estudio", "layout");
  return {
    ok: true,
    message:
      status === "approved"
        ? "Conta de recebimento ativa. Suas próximas vendas já caem nela."
        : "Cadastro enviado. O Asaas vai analisar seus dados.",
  };
}
