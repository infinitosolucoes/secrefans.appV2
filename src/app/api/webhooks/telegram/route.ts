import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { createBotApi } from "@/server/telegram/client";
import { safeErrorMessage } from "@/server/telegram/errors";
import { telegramConfig } from "@/server/telegram/config";
import { handleUpdate } from "@/server/telegram/handler";
import { createTelegramRepo } from "@/server/telegram/repo";
import type { Update } from "@/server/telegram/types";

export const maxDuration = 30;

const sha = (s: string) => createHash("sha256").update(s).digest();

const ok = () => NextResponse.json({ ok: true });

/** Log sem vazar o token nem dados: só mensagens da Bot API ou do repo, senão texto fixo. */
function logFailure(stage: string, err: unknown): void {
  console.error(`[telegram-webhook] falha em ${stage}: ${safeErrorMessage(err)}`);
}

/**
 * Webhook do bot de moderação do Telegram. Autentica pelo header secret_token e depois
 * responde sempre 200 (o Telegram reenvia indefinidamente em qualquer outro status);
 * duplicatas são descartadas por update_id.
 */
export async function POST(request: Request) {
  const config = telegramConfig();
  if (!config) return new NextResponse(null, { status: 404 });

  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeEqual(sha(received), sha(config.webhookSecret)))
    return NextResponse.json({ ok: false }, { status: 401 });

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return ok();
  }
  if (!update || typeof update.update_id !== "number") return ok();

  try {
    const repo = createTelegramRepo();
    let fresh: boolean;
    try {
      fresh = await repo.markUpdateSeen(update.update_id);
    } catch (err) {
      logFailure("markUpdateSeen", err);
      return ok();
    }
    if (!fresh) return ok();

    await handleUpdate(
      {
        api: createBotApi(config.token),
        repo,
        config,
        siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
      },
      update,
    );
  } catch (err) {
    logFailure("handleUpdate", err);
  }
  return ok();
}
