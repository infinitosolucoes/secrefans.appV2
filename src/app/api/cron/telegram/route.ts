import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { createBotApi } from "@/server/telegram/client";
import { safeErrorMessage } from "@/server/telegram/errors";
import { telegramConfig } from "@/server/telegram/config";
import { sweepGroupMembers } from "@/server/telegram/group";
import { createTelegramRepo } from "@/server/telegram/repo";

export const maxDuration = 60;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Log sem vazar o token: só mensagens da Bot API ou do repo (operação + código do Postgres). */
function logFailure(stage: string, err: unknown): void {
  console.error(`[telegram-cron] falha em ${stage}: ${safeErrorMessage(err)}`);
}

/**
 * Manutenção diária do bot (Vercel Cron, Authorization: Bearer CRON_SECRET): varre o grupo
 * removendo quem não tem conta ativa vinculada, limpa updates vistos há mais de 7 dias e códigos
 * de vínculo expirados, e apaga as mensagens agendadas que ficaram para trás (grupo sem atividade
 * depois de um comando).
 */

export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(sha(auth), sha(`Bearer ${secret}`)))
    return NextResponse.json({ ok: false }, { status: 401 });

  const config = telegramConfig();
  if (!config) return NextResponse.json({ ok: true, skipped: true });

  const api = createBotApi(config.token);
  const repo = createTelegramRepo();
  const summary = { removed: 0, deleted: 0, errors: 0 };

  try {
    summary.removed = (await sweepGroupMembers({ api, repo, groupId: config.groupId })).removed;
  } catch (err) {
    logFailure("sweep", err);
    summary.errors++;
  }
  try {
    await repo.purgeStale(new Date());
  } catch (err) {
    logFailure("purge", err);
    summary.errors++;
  }
  try {
    for (const { chatId, messageId } of await repo.takeDueDeletes(new Date())) {
      // Mensagem já apagada (ou sem permissão) não impede as demais.
      await api.deleteMessage(chatId, messageId).then(
        () => summary.deleted++,
        () => summary.errors++,
      );
    }
  } catch (err) {
    logFailure("drain", err);
    summary.errors++;
  }
  return NextResponse.json({ ok: true, ...summary });
}
