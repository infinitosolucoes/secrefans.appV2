"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export async function markAllNotificationsReadAction(): Promise<void> {
  await requireUser("/notificacoes");
  const supabase = await createServerSupabase();
  await supabase.rpc("mark_notifications_read", {});
  revalidatePath("/", "layout");
}

export async function saveNotificationPrefsAction(
  _: { ok: boolean; message: string } | null,
  fd: FormData,
): Promise<{ ok: boolean; message: string }> {
  await requireUser("/notificacoes");
  const on = (k: string) => fd.get(k) === "on";
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_notification_prefs", {
    p_email_sales: on("emailSales"),
    p_email_messages: on("emailMessages"),
    p_email_account: on("emailAccount"),
    p_inapp_new_posts: on("inappNewPosts"),
    p_inapp_engagement: on("inappEngagement"),
  });
  if (error) return { ok: false, message: "Não foi possível salvar." };
  revalidatePath("/notificacoes");
  return { ok: true, message: "Preferências salvas." };
}
