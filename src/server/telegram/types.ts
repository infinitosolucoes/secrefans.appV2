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
  new_chat_member: { status: string; user: User };
  old_chat_member: { status: string };
}

export interface Update {
  update_id: number;
  message?: Message;
  chat_join_request?: ChatJoinRequest;
  chat_member?: ChatMemberUpdated;
}
