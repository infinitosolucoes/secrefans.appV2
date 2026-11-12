"use server";

import { revalidatePath } from "next/cache";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import type { AdminResult } from "./actions";
import { telegramSettingsSchema } from "./telegram-settings";

export async function saveTelegramSettingsAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  const user = await requireStaffMfa("settings.manage");
  const parsed = telegramSettingsSchema.safeParse({
    rulesText: fd.get("rulesText") ?? "",
    welcomeText: fd.get("welcomeText") ?? "",
    allowedDomains: fd.get("allowedDomains") ?? "",
    warnLimit: fd.get("warnLimit"),
    autoMuteHours: fd.get("autoMuteHours"),
    floodRepeatLimit: fd.get("floodRepeatLimit"),
    floodWindowSeconds: fd.get("floodWindowSeconds"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const s = parsed.data;

  // Client do usuário: a RLS (staff_can('settings.manage')) decide quem pode gravar.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("telegram_settings")
    .update({
      rules_text: s.rulesText,
      welcome_text: s.welcomeText,
      allowed_domains: s.allowedDomains,
      warn_limit: s.warnLimit,
      auto_mute_hours: s.autoMuteHours,
      flood_repeat_limit: s.floodRepeatLimit,
      flood_window_seconds: s.floodWindowSeconds,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error) return { ok: false, message: "Não foi possível salvar as configurações do bot." };
  // RLS que barra o update não dá erro: só não atualiza linha nenhuma.
  if (!data?.length) return { ok: false, message: "Acesso negado." };
  revalidatePath("/super-admin/configuracoes");
  return { ok: true, message: "Configurações do bot salvas." };
}
