import "server-only";
import { serverEnv } from "@/lib/env.server";

export interface TelegramConfig {
  token: string;
  webhookSecret: string;
  botUsername: string;
  groupId: number;
}

/** Configuração do bot; null se faltar qualquer variável (bot desligado). */
export function telegramConfig(): TelegramConfig | null {
  const env = serverEnv();
  if (
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_WEBHOOK_SECRET ||
    !env.TELEGRAM_BOT_USERNAME ||
    !env.TELEGRAM_GROUP_ID
  ) {
    return null;
  }
  return {
    token: env.TELEGRAM_BOT_TOKEN,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    botUsername: env.TELEGRAM_BOT_USERNAME,
    groupId: Number(env.TELEGRAM_GROUP_ID),
  };
}
