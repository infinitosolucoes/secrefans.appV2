import "server-only";
import { createBotApi, TelegramApiError, type BotApi } from "./client";
import { telegramConfig, type TelegramConfig } from "./config";
import { publicEnv } from "@/lib/env";
import type { Ctx } from "./handler";
import { applyBan, applyMute } from "./punishments";
import { createTelegramRepo, type TelegramRepo } from "./repo";

export interface GroupDeps {
  api: BotApi;
  repo: TelegramRepo;
  groupId: number;
}

const SWEEP_REASON = "conta inativa no site";

/** Config do bot; env malformado (zod lança) conta como bot desligado. */
function loadConfig(): TelegramConfig | null {
  try {
    return telegramConfig();
  } catch {
    return null;
  }
}

function defaultDeps(): GroupDeps | null {
  const config = loadConfig();
  if (!config) return null;
  return { api: createBotApi(config.token), repo: createTelegramRepo(), groupId: config.groupId };
}

/**
 * Tira do grupo a conta do site vinculada a `userId`. Sem vínculo ou com o bot desligado não faz
 * nada. `ban` bane de vez (status banned); senão expulsa sem banir (status left). Erros da Bot API
 * propagam para quem chamou decidir.
 */
export async function removeUserFromGroup(
  userId: string,
  reason: string,
  actor: string | null,
  opts?: { ban?: boolean },
): Promise<void> {
  const deps = defaultDeps();
  if (!deps) return;
  const { api, repo, groupId } = deps;

  const tgId = await repo.telegramIdForUser(userId);
  if (tgId === null) return;

  if (opts?.ban) {
    await api.banChatMember(groupId, tgId);
    await repo.upsertMember(tgId, { status: "banned", lastActionBy: actor });
    await repo.logAction(actor, "telegram.ban", tgId, reason);
    return;
  }

  // Expulsar = banir e desbanir; num membro já banido isso o desbaniria.
  const member = await repo.getMember(tgId);
  if (member?.status === "banned") return;
  await api.kickChatMember(groupId, tgId);
  await repo.upsertMember(tgId, { status: "left", lastActionBy: actor });
  await repo.logAction(actor, "telegram.kick", tgId, reason);
}

/**
 * Varredura diária: expulsa membros (member/muted) sem vínculo ou cuja conta no site não está
 * ativa. Administradores do grupo são preservados; se a lista deles não puder ser obtida, lança
 * sem remover ninguém. Falha num membro não interrompe os demais.
 */
export async function sweepGroupMembers(deps?: GroupDeps): Promise<{ removed: number }> {
  const d = deps ?? defaultDeps();
  if (!d) return { removed: 0 };
  const { api, repo, groupId } = d;

  // Sem a lista de admins não dá para preservá-los: a falha propaga e a varredura é abortada.
  const admins = new Set(await api.getChatAdministratorIds(groupId));
  const candidates = await repo.listSweepCandidates();

  let removed = 0;
  for (const { tgId, accountStatus } of candidates) {
    if (accountStatus === "active" || admins.has(tgId)) continue;
    try {
      await api.kickChatMember(groupId, tgId);
      await repo.upsertMember(tgId, { status: "left", lastActionBy: null });
      await repo.logAction(null, "telegram.kick", tgId, SWEEP_REASON);
      removed++;
    } catch (err) {
      const detail = err instanceof TelegramApiError ? err.message : "erro interno";
      console.error(`[telegram-sweep] falha ao remover membro: ${detail}`);
    }
  }
  return { removed };
}

// Ações do Super Admin (decisão de denúncias) ----------------------------------------------------
// Ao contrário de removeUserFromGroup, estas LANÇAM com o bot desligado ou erro da Bot API: a
// decisão da denúncia só é registrada se a ação no Telegram tiver acontecido.

function requireCtx(): Ctx {
  const config = loadConfig();
  if (!config) throw new Error("Bot do Telegram desligado.");
  return {
    api: createBotApi(config.token),
    repo: createTelegramRepo(),
    config,
    siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
  };
}

export async function deleteGroupMessage(chatId: number, messageId: number): Promise<void> {
  const { api } = requireCtx();
  await api.deleteMessage(chatId, messageId);
}

/** Mesmo caminho do /mute do bot: restrição + status muted + auditoria telegram.mute. */
export async function muteTelegramUser(
  tgId: number,
  hours: number,
  actor: string,
  reason: string,
): Promise<void> {
  await applyMute(requireCtx(), tgId, hours, actor, reason);
}

/** Mesmo caminho do /ban do bot: status banned + ban + auditoria telegram.ban. */
export async function banTelegramUser(tgId: number, actor: string, reason: string): Promise<void> {
  await applyBan(requireCtx(), tgId, actor, reason);
}
