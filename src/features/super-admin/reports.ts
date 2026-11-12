"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { banTelegramUser, deleteGroupMessage, muteTelegramUser } from "@/server/telegram/group";
import type { AdminResult } from "./actions";

const TELEGRAM_FAIL = "Não foi possível executar a ação no Telegram. A denúncia continua aberta.";
const TELEGRAM_DONE = {
  none: "",
  delete: " Mensagem apagada no Telegram.",
  mute24: " Autor silenciado por 24 h no Telegram.",
  ban: " Autor banido do grupo do Telegram.",
} as const;
type TelegramAction = keyof typeof TELEGRAM_DONE;

const schema = z.object({
  reportId: z.uuid(),
  status: z.enum(["resolved", "dismissed"]),
  reason: z.string().trim().min(5, "Informe o motivo (mín. 5 caracteres).").max(500),
  removeTarget: z.boolean(),
  telegramAction: z.enum(["none", "delete", "mute24", "ban"]).default("none"),
});

/**
 * Executa no Telegram a ação escolhida para uma denúncia de mensagem do grupo. Devolve false se o
 * alvo não for `telegram_message` ou a denúncia não estiver aberta (nada a fazer). Lança se a mensagem não for encontrada, o bot
 * estiver desligado ou a Bot API falhar.
 */
async function runTelegramAction(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  reportId: string,
  action: Exclude<TelegramAction, "none">,
  actor: string,
  reason: string,
): Promise<boolean> {
  const { data: report, error } = await supabase
    .from("reports")
    .select("target_type, target_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  // Já decidida: nada no Telegram; o decide_report responde "já foi decidida".
  if (report?.target_type !== "telegram_message" || report.status !== "open") return false;

  const { data: msg, error: msgError } = await supabase
    .from("telegram_reported_messages")
    .select("chat_id, message_id, author_telegram_user_id")
    .eq("id", report.target_id)
    .maybeSingle();
  if (msgError) throw msgError;
  if (!msg) throw new Error("Mensagem denunciada não encontrada.");

  if (action === "delete") await deleteGroupMessage(msg.chat_id, msg.message_id);
  else if (action === "mute24")
    await muteTelegramUser(msg.author_telegram_user_id, 24, actor, reason);
  else await banTelegramUser(msg.author_telegram_user_id, actor, reason);
  return true;
}

export async function decideReportAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  const user = await requireStaffMfa("reports.decide");
  const parsed = schema.safeParse({
    reportId: fd.get("reportId"),
    status: fd.get("status"),
    reason: fd.get("reason"),
    removeTarget: fd.get("removeTarget") === "on",
    telegramAction: fd.get("telegramAction") ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createServerSupabase();

  // A ação no Telegram vem antes do registro: se falhar, a denúncia segue aberta para nova tentativa.
  let telegramDone = false;
  const { telegramAction } = parsed.data;
  if (parsed.data.status === "resolved" && telegramAction !== "none") {
    try {
      telegramDone = await runTelegramAction(
        supabase,
        parsed.data.reportId,
        telegramAction,
        user.id,
        parsed.data.reason,
      );
    } catch {
      return { ok: false, message: TELEGRAM_FAIL };
    }
  }
  const { error } = await supabase.rpc("decide_report", {
    p_report_id: parsed.data.reportId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
    p_remove_target: parsed.data.removeTarget,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Acesso negado."
          : error.code === "P0002"
            ? "Esta denúncia já foi decidida."
            : "Não foi possível registrar a decisão.",
    };
  revalidatePath("/super-admin/denuncias");
  return {
    ok: true,
    message:
      parsed.data.status === "resolved"
        ? parsed.data.removeTarget
          ? "Denúncia procedente. Conteúdo retirado."
          : `Denúncia procedente.${telegramDone ? TELEGRAM_DONE[telegramAction] : ""}`
        : "Denúncia arquivada.",
  };
}
