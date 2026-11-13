"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePixKey, PIX_KEY_TYPES } from "@/lib/pix";
import { requireRole, requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { dispatchPendingEmails } from "@/server/email";
import { executeWithdrawal, resolveStuckWithdrawal } from "@/server/payouts";
import { parsePriceToCents } from "@/features/content/schemas";

export interface WithdrawalResult {
  ok: boolean;
  message: string;
}

const dbMessage = (msg?: string) => {
  const known = [
    "há um saque em andamento: aguarde para trocar a chave",
    "verificação de identidade pendente",
    "cadastre uma chave Pix antes de sacar",
    "já existe um saque em andamento",
    "valor abaixo do mínimo de saque",
    "saldo disponível insuficiente",
    "saque não encontrado ou já em processamento",
    "saque não encontrado ou já decidido",
    "saldo do criador não cobre mais este saque",
    "justificativa obrigatória para recusar",
  ];
  const hit = known.find((k) => msg?.includes(k));
  return hit ? hit.charAt(0).toUpperCase() + hit.slice(1) + "." : "Não foi possível concluir.";
};

export async function setPixKeyAction(
  _: WithdrawalResult | null,
  fd: FormData,
): Promise<WithdrawalResult> {
  await requireRole(["creator"], "/carteira");
  const type = z.enum(PIX_KEY_TYPES).safeParse(fd.get("keyType"));
  if (!type.success) return { ok: false, message: "Escolha o tipo da chave." };
  const value = normalizePixKey(type.data, String(fd.get("keyValue") ?? ""));
  if (!value) return { ok: false, message: "Chave Pix inválida para o tipo escolhido." };
  if (fd.get("confirm") !== "on")
    return { ok: false, message: "Confirme que a chave está no seu nome." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_payout_pix_key", { p_type: type.data, p_value: value });
  if (error) return { ok: false, message: dbMessage(error.message) };
  after(() => dispatchPendingEmails().catch(() => undefined));
  revalidatePath("/carteira");
  return { ok: true, message: "Chave Pix salva. Enviamos um aviso para o seu e-mail." };
}

export async function requestWithdrawalAction(
  _: WithdrawalResult | null,
  fd: FormData,
): Promise<WithdrawalResult> {
  await requireRole(["creator"], "/carteira");
  const cents = parsePriceToCents(String(fd.get("amount") ?? ""));
  if (!cents) return { ok: false, message: "Informe o valor do saque." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("request_withdrawal", { p_amount_cents: cents });
  if (error) return { ok: false, message: dbMessage(error.message) };
  revalidatePath("/carteira");
  return {
    ok: true,
    message: "Saque solicitado. O financeiro confere e envia o Pix em até 2 dias úteis.",
  };
}

export async function cancelWithdrawalAction(fd: FormData) {
  await requireRole(["creator"], "/carteira");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const supabase = await createServerSupabase();
  await supabase.rpc("cancel_withdrawal", { p_id: id.data });
  revalidatePath("/carteira");
}

/** Financeiro (MFA): aprova e já envia o Pix pelo provedor, ou recusa com motivo. */
export async function approveWithdrawalAction(
  _: WithdrawalResult | null,
  fd: FormData,
): Promise<WithdrawalResult> {
  return decideWithdrawal(fd, true);
}

export async function rejectWithdrawalAction(
  _: WithdrawalResult | null,
  fd: FormData,
): Promise<WithdrawalResult> {
  return decideWithdrawal(fd, false);
}

async function decideWithdrawal(fd: FormData, approve: boolean): Promise<WithdrawalResult> {
  await requireStaffMfa("payout.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!id.success) return { ok: false, message: "Saque inválido." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("decide_withdrawal", {
    p_id: id.data,
    p_approve: approve,
    p_reason: reason,
  });
  if (error) return { ok: false, message: dbMessage(error.message) };
  let message = "Saque recusado. O criador foi avisado.";
  if (approve) {
    try {
      const r = await executeWithdrawal(id.data);
      message =
        r === "ok"
          ? "Saque aprovado e concluído pelo provedor."
          : "Saque aprovado. Pix enviado ao provedor; a confirmação chega pelo webhook.";
    } catch {
      message =
        "Saque aprovado, mas o provedor não respondeu. Ele segue em processamento; tente de novo mais tarde.";
    }
  }
  after(() => dispatchPendingEmails().catch(() => undefined));
  revalidatePath("/super-admin/saques");
  return { ok: true, message };
}

/** Financeiro: saque aprovado sem confirmação do provedor → procura no provedor e resolve. */
export async function resolveStuckWithdrawalAction(fd: FormData) {
  await requireStaffMfa("payout.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  await resolveStuckWithdrawal(id.data).catch(() => undefined);
  after(() => dispatchPendingEmails().catch(() => undefined));
  revalidatePath("/super-admin/saques");
}
