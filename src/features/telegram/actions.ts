"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import { telegramConfig, type TelegramConfig } from "@/server/telegram/config";
import { removeUserFromGroup } from "@/server/telegram/group";

const PROFILE = "/conta/perfil";

function loadConfig(): TelegramConfig | null {
  try {
    return telegramConfig();
  } catch {
    return null;
  }
}

/** Gera um código de vínculo e manda o usuário para o bot com ?start=<código>. */
export async function startTelegramLinkAction(): Promise<void> {
  const user = await requireUser(PROFILE);
  const config = loadConfig();
  if (!config) redirect(PROFILE);

  const db = createServiceSupabase();
  const { data, error } = await db.rpc("telegram_create_link_code", { p_user: user.id });
  if (error?.code === "42501") redirect(`${PROFILE}?telegram=sem-consentimento`);
  if (error || !data) redirect(`${PROFILE}?telegram=erro`);
  redirect(`https://t.me/${config.botUsername}?start=${data}`);
}

/** Tira o usuário do grupo e apaga o vínculo (delete pelo client do usuário, sob RLS). */
export async function unlinkTelegramAction(): Promise<void> {
  const user = await requireUser(PROFILE);
  if (!loadConfig()) redirect(PROFILE);

  try {
    await removeUserFromGroup(user.id, "desvinculou", user.id);
  } catch {
    // Sem vínculo, a varredura diária remove quem ficou no grupo.
    console.error("[telegram] falha ao remover do grupo ao desvincular");
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("telegram_links").delete().eq("user_id", user.id);
  revalidatePath(PROFILE);
  redirect(error ? `${PROFILE}?telegram=erro` : PROFILE);
}
