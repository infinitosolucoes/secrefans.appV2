import "server-only";
import { TelegramApiError } from "./client";

/**
 * Texto seguro para log: a mensagem de TelegramApiError (nunca traz o token) ou dos erros do repo
 * ("telegram repo <operação>: <código>", sem dados da linha); qualquer outro erro vira texto fixo,
 * pois pode conter a URL da Bot API com o token ou dados do banco.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof TelegramApiError) return err.message;
  if (err instanceof Error && err.message.startsWith("telegram repo ")) return err.message;
  return "erro interno";
}
