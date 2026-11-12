import { afterEach, describe, expect, it, vi } from "vitest";
import { createBotApi, TelegramApiError } from "@/server/telegram/client";
import { telegramConfig } from "@/server/telegram/config";

const TOKEN = "123456789:AAFakeTokenFakeTokenFakeTokenFake12";

type Call = { url: string; body: Record<string, unknown> };

function fakeFetch(responses: unknown[]) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    const next = responses.shift();
    return new Response(JSON.stringify(next), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("createBotApi", () => {
  it("sendMessage faz POST JSON e devolve message_id", async () => {
    const f = fakeFetch([{ ok: true, result: { message_id: 77 } }]);
    const api = createBotApi(TOKEN, f.impl);
    const r = await api.sendMessage(-100, "oi", { replyTo: 5 });
    expect(r.message_id).toBe(77);
    expect(f.calls[0]!.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(f.calls[0]!.body).toEqual({
      chat_id: -100,
      text: "oi",
      reply_parameters: { message_id: 5 },
    });
  });

  it("sendMessage sem replyTo não envia reply_parameters", async () => {
    const f = fakeFetch([{ ok: true, result: { message_id: 1 } }]);
    await createBotApi(TOKEN, f.impl).sendMessage(1, "x");
    expect(f.calls[0]!.body).toEqual({ chat_id: 1, text: "x" });
  });

  it("erro da API lança TelegramApiError sem vazar o token", async () => {
    const f = fakeFetch([{ ok: false, error_code: 400, description: "Bad Request: x" }]);
    const api = createBotApi(TOKEN, f.impl);
    const err = await api.deleteMessage(1, 2).catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err.status).toBe(400);
    expect(err.method).toBe("deleteMessage");
    expect(err.description).toBe("Bad Request: x");
    expect(String(err)).not.toContain(TOKEN);
    expect(err.message).not.toContain(TOKEN);
  });

  it("429 com retry_after 1 tenta de novo uma vez", async () => {
    const f = fakeFetch([
      { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } },
      { ok: true, result: { message_id: 9 } },
    ]);
    const sleep = vi.fn(async () => {});
    const api = createBotApi(TOKEN, f.impl, sleep);
    const r = await api.sendMessage(1, "x");
    expect(r.message_id).toBe(9);
    expect(f.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("429 com retry_after 5 lança sem tentar de novo", async () => {
    const f = fakeFetch([
      { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 5 } },
    ]);
    const sleep = vi.fn(async () => {});
    const api = createBotApi(TOKEN, f.impl, sleep);
    const err = await api.sendMessage(1, "x").catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err.status).toBe(429);
    expect(f.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("kickChatMember bane e depois desbane", async () => {
    const f = fakeFetch([
      { ok: true, result: true },
      { ok: true, result: true },
    ]);
    await createBotApi(TOKEN, f.impl).kickChatMember(-1, 42);
    expect(f.calls.map((c) => c.url.split("/").pop())).toEqual(["banChatMember", "unbanChatMember"]);
    expect(f.calls[1]!.body).toMatchObject({ chat_id: -1, user_id: 42, only_if_banned: true });
  });

  it("createChatInviteLink pede join request e devolve o link", async () => {
    const f = fakeFetch([{ ok: true, result: { invite_link: "https://t.me/+abc" } }]);
    const link = await createBotApi(TOKEN, f.impl).createChatInviteLink(-1);
    expect(link).toBe("https://t.me/+abc");
    expect(f.calls[0]!.body).toMatchObject({ chat_id: -1, creates_join_request: true });
  });

  it("restrictChatMember zera todas as permissões", async () => {
    const f = fakeFetch([{ ok: true, result: true }]);
    await createBotApi(TOKEN, f.impl).restrictChatMember(-1, 42, 1700000000);
    const body = f.calls[0]!.body as { permissions: Record<string, boolean>; until_date: number };
    expect(body.until_date).toBe(1700000000);
    expect(Object.values(body.permissions).every((v) => v === false)).toBe(true);
    expect(Object.keys(body.permissions)).toContain("can_send_messages");
  });

  it("getChatAdministratorIds devolve os ids", async () => {
    const f = fakeFetch([{ ok: true, result: [{ user: { id: 1 } }, { user: { id: 2 } }] }]);
    expect(await createBotApi(TOKEN, f.impl).getChatAdministratorIds(-1)).toEqual([1, 2]);
  });
});

describe("telegramConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubAll() {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x".repeat(30));
    vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s".repeat(40));
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "secretfans_bot");
    vi.stubEnv("TELEGRAM_GROUP_ID", "-100123");
  }

  it("devolve null sem TELEGRAM_BOT_TOKEN", () => {
    stubAll();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(telegramConfig()).toBeNull();
  });

  it("valor malformado: devolve null e loga só o nome da variável", () => {
    stubAll();
    vi.stubEnv("TELEGRAM_GROUP_ID", "nao-numero");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "curto!");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(telegramConfig()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]?.[0]);
    expect(logged).toContain("TELEGRAM_GROUP_ID");
    expect(logged).toContain("TELEGRAM_WEBHOOK_SECRET");
    expect(logged).not.toContain("nao-numero");
    expect(logged).not.toContain("curto!");
    expect(logged).not.toContain(TOKEN);
    spy.mockRestore();
  });

  it("variável do Telegram malformada não quebra serverEnv()", async () => {
    stubAll();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "curto");
    const { serverEnv } = await import("@/lib/env.server");
    expect(() => serverEnv()).not.toThrow();
  });

  it("converte TELEGRAM_GROUP_ID em número", () => {
    stubAll();
    expect(telegramConfig()).toEqual({
      token: TOKEN,
      webhookSecret: "s".repeat(40),
      botUsername: "secretfans_bot",
      groupId: -100123,
    });
  });
});
