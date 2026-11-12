import "server-only";

/** Erro da Bot API. A mensagem nunca inclui o token (ele só aparece na URL da chamada). */
export class TelegramApiError extends Error {
  method: string;
  status: number;
  description: string;

  constructor(method: string, status: number, description: string) {
    super(`Telegram ${method} falhou (${status}): ${description}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.status = status;
    this.description = description;
  }
}

export interface BotApi {
  sendMessage(chatId: number, text: string, opts?: { replyTo?: number }): Promise<{ message_id: number }>;
  deleteMessage(chatId: number, messageId: number): Promise<void>;
  approveChatJoinRequest(chatId: number, userId: number): Promise<void>;
  declineChatJoinRequest(chatId: number, userId: number): Promise<void>;
  createChatInviteLink(chatId: number): Promise<string>;
  restrictChatMember(chatId: number, userId: number, untilUnix: number): Promise<void>;
  banChatMember(chatId: number, userId: number): Promise<void>;
  unbanChatMember(chatId: number, userId: number): Promise<void>;
  kickChatMember(chatId: number, userId: number): Promise<void>;
  getChatAdministratorIds(chatId: number): Promise<number[]>;
}

/** Maior espera aceita num 429 antes de desistir (a função serverless não pode ficar parada). */
const MAX_RETRY_WAIT_S = 2;

const NO_PERMISSIONS = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false,
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createBotApi(
  token: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): BotApi {
  async function call<T>(method: string, params: Record<string, unknown>, retried = false): Promise<T> {
    let json: {
      ok: boolean;
      result?: T;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    };
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      json = await res.json();
    } catch {
      // Erro de rede/JSON: não propaga o erro original, pois pode conter a URL com o token.
      throw new TelegramApiError(method, 0, "falha de rede ou resposta inválida");
    }
    if (json.ok) return json.result as T;

    const status = json.error_code ?? 0;
    const retryAfter = json.parameters?.retry_after;
    if (status === 429 && !retried && retryAfter !== undefined && retryAfter <= MAX_RETRY_WAIT_S) {
      await sleep(retryAfter * 1000);
      return call<T>(method, params, true);
    }
    throw new TelegramApiError(method, status, json.description ?? "erro desconhecido");
  }

  const api: BotApi = {
    sendMessage: (chatId, text, opts) =>
      call("sendMessage", {
        chat_id: chatId,
        text,
        ...(opts?.replyTo ? { reply_parameters: { message_id: opts.replyTo } } : {}),
      }),
    deleteMessage: async (chatId, messageId) => {
      await call("deleteMessage", { chat_id: chatId, message_id: messageId });
    },
    approveChatJoinRequest: async (chatId, userId) => {
      await call("approveChatJoinRequest", { chat_id: chatId, user_id: userId });
    },
    declineChatJoinRequest: async (chatId, userId) => {
      await call("declineChatJoinRequest", { chat_id: chatId, user_id: userId });
    },
    createChatInviteLink: async (chatId) => {
      const r = await call<{ invite_link: string }>("createChatInviteLink", {
        chat_id: chatId,
        creates_join_request: true,
      });
      return r.invite_link;
    },
    restrictChatMember: async (chatId, userId, untilUnix) => {
      await call("restrictChatMember", {
        chat_id: chatId,
        user_id: userId,
        permissions: NO_PERMISSIONS,
        until_date: untilUnix,
      });
    },
    banChatMember: async (chatId, userId) => {
      await call("banChatMember", { chat_id: chatId, user_id: userId });
    },
    unbanChatMember: async (chatId, userId) => {
      await call("unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
    },
    kickChatMember: async (chatId, userId) => {
      await api.banChatMember(chatId, userId);
      await api.unbanChatMember(chatId, userId);
    },
    getChatAdministratorIds: async (chatId) => {
      const r = await call<{ user: { id: number } }[]>("getChatAdministrators", { chat_id: chatId });
      return r.map((m) => m.user.id);
    },
  };
  return api;
}
