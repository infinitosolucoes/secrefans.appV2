import { describe, expect, it } from "vitest";
import { parseCommand } from "@/server/telegram/commands";
import { detectSpam, textHash } from "@/server/telegram/antispam";
import { escalate } from "@/server/telegram/punishments";
import type { Message, MessageEntity } from "@/server/telegram/types";

const BOT = "SfBot";

describe("parseCommand", () => {
  it("/start com e sem código", () => {
    expect(parseCommand("/start abc_123", BOT)).toEqual({ kind: "start", code: "abc_123" });
    expect(parseCommand("/start", BOT)).toEqual({ kind: "start", code: null });
  });

  it("ban com menção ao bot e motivo", () => {
    expect(parseCommand("/banir@SfBot spam pesado", BOT)).toEqual({ kind: "ban", reason: "spam pesado" });
  });

  it("ignora comando endereçado a outro bot", () => {
    expect(parseCommand("/banir@OutroBot", BOT)).toBeNull();
  });

  it("mute com duração válida e inválida", () => {
    expect(parseCommand("/silenciar 7d flood", BOT)).toEqual({ kind: "mute", hours: 168, reason: "flood" });
    expect(parseCommand("/silenciar 2h", BOT)).toBeNull();
  });

  it("advertir sem motivo", () => {
    expect(parseCommand("/advertir", BOT)).toEqual({ kind: "warn", reason: "" });
  });

  it("denunciar com apelidos de motivo", () => {
    const r = (t: string) => parseCommand(t, BOT);
    expect(r("/denunciar menor")).toEqual({ kind: "report", reason: "menor_de_idade", details: "" });
    expect(r("/denunciar nao consensual")).toMatchObject({ reason: "nao_consensual" });
    expect(r("/denunciar não consensual")).toMatchObject({ reason: "nao_consensual" });
    expect(r("/denunciar spam")).toMatchObject({ reason: "spam" });
    expect(r("/denunciar assédio")).toMatchObject({ reason: "assedio" });
    expect(r("/denunciar copia")).toMatchObject({ reason: "direitos_autorais" });
    expect(r("/denunciar direitos")).toMatchObject({ reason: "direitos_autorais" });
    expect(r("/denunciar")).toEqual({ kind: "report", reason: "outro", details: "" });
    expect(r("/denunciar golpe de pix")).toEqual({ kind: "report", reason: "outro", details: "golpe de pix" });
  });

  it("texto que não é comando", () => {
    expect(parseCommand("oi pessoal", BOT)).toBeNull();
    expect(parseCommand("/desbanir", BOT)).toEqual({ kind: "unban" });
    expect(parseCommand("/foo", BOT)).toBeNull();
  });
});

const settings = { allowedDomains: ["secretfans.app.br"], floodRepeatLimit: 3, floodWindowSeconds: 60 };

function msg(text: string, entities?: MessageEntity[], extra: Partial<Message> = {}): Message {
  return { message_id: 1, chat: { id: 1, type: "supergroup" } as Message["chat"], text, entities, ...extra };
}
function urlEntity(text: string, url: string): MessageEntity {
  return { type: "url", offset: text.indexOf(url), length: url.length };
}

describe("detectSpam", () => {
  it("permite domínio da lista e subdomínios", () => {
    const a = "https://secretfans.app.br/x";
    const b = "https://www.secretfans.app.br";
    expect(detectSpam(msg(a, [urlEntity(a, a)]), settings, 0)).toEqual({ spam: false });
    expect(detectSpam(msg(b, [urlEntity(b, b)]), settings, 0)).toEqual({ spam: false });
  });

  it("bloqueia link externo", () => {
    const t = "veja https://evil.com";
    expect(detectSpam(msg(t, [urlEntity(t, "https://evil.com")]), settings, 0)).toEqual({ spam: true, rule: "link" });
  });

  it("bloqueia text_link", () => {
    const t = "clique aqui";
    const e: MessageEntity = { type: "text_link", offset: 0, length: 11, url: "https://evil.com" };
    expect(detectSpam(msg(t, [e]), settings, 0)).toEqual({ spam: true, rule: "link" });
  });

  it("detecta convites e canais do Telegram", () => {
    expect(detectSpam(msg("t.me/+AbC"), settings, 0)).toEqual({ spam: true, rule: "invite" });
    const j = "https://t.me/joinchat/x";
    expect(detectSpam(msg(j, [urlEntity(j, j)]), settings, 0)).toEqual({ spam: true, rule: "invite" });
    expect(detectSpam(msg("t.me/algumcanal"), settings, 0)).toEqual({ spam: true, rule: "invite" });
  });

  it("encaminhamento de canal vs usuário", () => {
    expect(detectSpam(msg("oi", undefined, { forward_origin: { type: "channel" } }), settings, 0)).toEqual({
      spam: true,
      rule: "channel_forward",
    });
    expect(detectSpam(msg("oi", undefined, { forward_origin: { type: "user" } }), settings, 0)).toEqual({ spam: false });
  });

  it("flood quando a mensagem atual atinge o limite", () => {
    expect(detectSpam(msg("oi"), settings, 2)).toEqual({ spam: true, rule: "flood" });
    expect(detectSpam(msg("oi"), settings, 1)).toEqual({ spam: false });
  });

  it("link na legenda de foto", () => {
    const cap = "olha https://evil.com";
    const m: Message = {
      message_id: 2,
      chat: { id: 1, type: "supergroup" } as Message["chat"],
      photo: [{}],
      caption: cap,
      caption_entities: [urlEntity(cap, "https://evil.com")],
    };
    expect(detectSpam(m, settings, 0)).toEqual({ spam: true, rule: "link" });
  });

  it("sticker sem texto", () => {
    const m: Message = { message_id: 3, chat: { id: 1, type: "supergroup" } as Message["chat"] };
    expect(detectSpam(m, settings, 0)).toEqual({ spam: false });
    expect(textHash(m)).toBeNull();
  });
});

describe("textHash", () => {
  it("normaliza espaços e caixa", () => {
    expect(textHash(msg("  Olá   MUNDO "))).toBe(textHash(msg("olá mundo")));
    expect(textHash(msg("a"))).not.toBe(textHash(msg("b")));
  });
});

describe("escalate", () => {
  it("incrementa e silencia no limite", () => {
    expect(escalate(0, 3)).toEqual({ warnings: 1, mute: false });
    expect(escalate(2, 3)).toEqual({ warnings: 0, mute: true });
  });
});
