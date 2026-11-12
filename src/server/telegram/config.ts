import "server-only";
import { z } from "zod";

export interface TelegramConfig {
  token: string;
  webhookSecret: string;
  botUsername: string;
  groupId: number;
}

/**
 * Variáveis do bot, validadas à parte do serverSchema: um valor malformado aqui só desliga o bot,
 * sem derrubar o resto do site (cliente de serviço, pagamentos, e-mail).
 */
const telegramSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(30).optional(),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,256}$/)
    .optional(),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/)
    .optional(),
  TELEGRAM_GROUP_ID: z
    .string()
    .regex(/^-?\d+$/)
    .optional(),
});

/**
 * Configuração do bot; null se faltar qualquer uma das quatro variáveis (bot desligado) ou se
 * alguma estiver malformada. No segundo caso loga só os NOMES das variáveis inválidas, nunca os
 * valores (o token e o segredo não podem ir para o log).
 */
export function telegramConfig(): TelegramConfig | null {
  const parsed = telegramSchema.safeParse({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || undefined,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || undefined,
    TELEGRAM_GROUP_ID: process.env.TELEGRAM_GROUP_ID || undefined,
  });
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].sort();
    console.error(`[telegram] variáveis de ambiente inválidas (bot desligado): ${names.join(", ")}`);
    return null;
  }
  const env = parsed.data;
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
