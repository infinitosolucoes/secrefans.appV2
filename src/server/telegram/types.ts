// Subconjunto dos tipos da Bot API do Telegram usado pelo bot de moderação.

export interface User {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name: string;
}

export interface Chat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface MessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface Message {
  message_id: number;
  from?: User;
  chat: Chat;
  text?: string;
  caption?: string;
  entities?: MessageEntity[];
  caption_entities?: MessageEntity[];
  reply_to_message?: Message;
  forward_origin?: { type: string };
  photo?: unknown[];
  video?: unknown;
  document?: unknown;
}

export interface ChatJoinRequest {
  chat: Chat;
  from: User;
  user_chat_id: number;
}

export interface ChatMemberUpdated {
  chat: Chat;
  from: User;
  // is_member só vem com status "restricted": diz se o restrito ainda está no grupo.
  new_chat_member: { status: string; user: User; is_member?: boolean };
  old_chat_member: { status: string; is_member?: boolean };
}

export interface Update {
  update_id: number;
  message?: Message;
  edited_message?: Message;
  chat_join_request?: ChatJoinRequest;
  chat_member?: ChatMemberUpdated;
}
