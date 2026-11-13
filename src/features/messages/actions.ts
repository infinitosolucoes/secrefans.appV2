"use server";

import { checkUserRateLimit } from "@/server/security/rateLimit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { dispatchPendingEmails } from "@/server/email";
import { requireRole, requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { UUID_RE } from "@/features/content/constants";

export interface ChatResult {
  ok: boolean;
  message?: string;
}

const errors: Record<string, string> = {
  P0001: "Este criador só recebe mensagens de assinantes.",
  P0002: "Conversa indisponível.",
  "42501": "Você não pode enviar esta mensagem.",
  "22023": "Revise a mensagem: mensagem paga precisa de mídia e preço entre R$ 5 e R$ 1.000.",
};

/** Abre (ou reabre) a conversa e leva até ela. */
export async function startConversationAction(fd: FormData): Promise<void> {
  const otherId = String(fd.get("otherId") ?? "");
  await requireUser("/mensagens");
  if (!UUID_RE.test(otherId)) redirect("/mensagens");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("start_conversation", { p_other_id: otherId });
  if (error || !data) redirect(`/mensagens?erro=${encodeURIComponent(error?.code ?? "P0002")}`);
  redirect(`/mensagens/${data}`);
}

const mediaSchema = z
  .array(
    z.object({
      kind: z.enum(["image", "video"]),
      path: z.string().max(200),
      poster_path: z.string().max(200).nullable().optional(),
      width: z.number().int().positive().max(10000).optional(),
      height: z.number().int().positive().max(10000).optional(),
      duration_seconds: z.number().int().min(1).max(3600).optional(),
    }),
  )
  .max(10);

const sendSchema = z.object({
  messageId: z.string().regex(UUID_RE),
  conversationId: z.string().regex(UUID_RE),
  body: z.string().max(2000),
  priceCents: z.number().int().min(500).max(100000).nullable(),
  media: mediaSchema,
  attested: z.boolean().default(false),
});

export async function sendMessageAction(input: unknown): Promise<ChatResult> {
  const me = await requireUser("/mensagens");
  const limited = await checkUserRateLimit("message", me.id);
  if (limited) return { ok: false, message: limited };
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Mensagem inválida." };
  const d = parsed.data;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("send_message", {
    p_message_id: d.messageId,
    p_conversation_id: d.conversationId,
    p_body: d.body,
    p_price_cents: d.priceCents as number,
    p_media: d.media,
    p_attested: d.attested,
  });
  if (error) return { ok: false, message: errors[error.code ?? ""] ?? "Não foi possível enviar." };
  after(() => dispatchPendingEmails().catch(() => undefined));
  revalidatePath(`/mensagens/${d.conversationId}`);
  revalidatePath("/mensagens");
  return { ok: true };
}

const broadcastSchema = z.object({
  broadcastId: z.string().regex(UUID_RE),
  body: z.string().max(2000),
  priceCents: z.number().int().min(500).max(100000).nullable(),
  media: mediaSchema,
  attested: z.boolean().default(false),
});

export async function sendBroadcastAction(
  input: unknown,
): Promise<ChatResult & { recipients?: number }> {
  await requireRole(["creator"], "/mensagens/massa");
  const parsed = broadcastSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Mensagem inválida." };
  const d = parsed.data;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("send_broadcast", {
    p_broadcast_id: d.broadcastId,
    p_body: d.body,
    p_price_cents: d.priceCents as number,
    p_media: d.media,
    p_attested: d.attested,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "P0001"
          ? "Aguarde 10 minutos entre envios em massa."
          : (errors[error.code ?? ""] ?? "Não foi possível enviar."),
    };
  after(() => dispatchPendingEmails(50).catch(() => undefined));
  revalidatePath("/mensagens", "layout");
  return {
    ok: true,
    recipients: data ?? 0,
    message: data
      ? `Enviada para ${data} assinante${data === 1 ? "" : "s"}.`
      : "Você ainda não tem assinantes ativos.",
  };
}

export async function markReadAction(conversationId: string): Promise<void> {
  if (!UUID_RE.test(conversationId)) return;
  await requireUser("/mensagens");
  const supabase = await createServerSupabase();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

export async function deleteMessageAction(fd: FormData): Promise<void> {
  await requireUser("/mensagens");
  const id = String(fd.get("messageId") ?? "");
  const conversationId = String(fd.get("conversationId") ?? "");
  if (!UUID_RE.test(id)) return;
  const supabase = await createServerSupabase();
  await supabase.rpc("delete_message", { p_message_id: id });
  if (UUID_RE.test(conversationId)) revalidatePath(`/mensagens/${conversationId}`);
}

export async function setDmPolicyAction(fd: FormData): Promise<void> {
  const user = await requireRole(["creator"], "/mensagens");
  const policy = fd.get("policy") === "everyone" ? "everyone" : "subscribers";
  const supabase = await createServerSupabase();
  await supabase.from("profiles").update({ dm_policy: policy }).eq("id", user.id);
  revalidatePath("/mensagens");
  revalidatePath(`/${user.handle}`);
}

/** Bloquear / desbloquear a outra pessoa da conversa. */
export async function toggleBlockAction(fd: FormData): Promise<void> {
  const user = await requireUser("/mensagens");
  const otherId = String(fd.get("otherId") ?? "");
  const conversationId = String(fd.get("conversationId") ?? "");
  if (!UUID_RE.test(otherId) || otherId === user.id) return;
  const supabase = await createServerSupabase();
  if (fd.get("block") === "1")
    await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: otherId });
  else
    await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", otherId);
  if (UUID_RE.test(conversationId)) revalidatePath(`/mensagens/${conversationId}`);
}
