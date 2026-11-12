import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "123456:SECRET-BOT-TOKEN";
const SECRET = "segredo-do-webhook";

const handleUpdate = vi.fn();
const markUpdateSeen = vi.fn();
const telegramConfig = vi.fn();

vi.mock("@/server/telegram/config", () => ({ telegramConfig: () => telegramConfig() }));
vi.mock("@/server/telegram/client", () => ({
  createBotApi: vi.fn(() => ({})),
  TelegramApiError: class TelegramApiError extends Error {},
}));
vi.mock("@/server/telegram/repo", () => ({
  createTelegramRepo: vi.fn(() => ({ markUpdateSeen })),
}));
vi.mock("@/server/telegram/handler", () => ({ handleUpdate: (...a: unknown[]) => handleUpdate(...a) }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://site.test" }) }));

import { POST } from "@/app/api/webhooks/telegram/route";

const cfg = { token: TOKEN, webhookSecret: SECRET, botUsername: "bot", groupId: -100 };

function req(body: string, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  return new Request("http://localhost/api/webhooks/telegram", { method: "POST", headers, body });
}
const update = JSON.stringify({ update_id: 10, message: { message_id: 1 } });

describe("POST /api/webhooks/telegram", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfig.mockReturnValue(cfg);
    markUpdateSeen.mockResolvedValue(true);
    handleUpdate.mockResolvedValue(undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("config nula -> 404", async () => {
    telegramConfig.mockReturnValue(null);
    expect((await POST(req(update))).status).toBe(404);
  });

  it("config que lança (env malformado) -> 404", async () => {
    telegramConfig.mockImplementation(() => {
      throw new Error("zod");
    });
    expect((await POST(req(update))).status).toBe(404);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("segredo ausente ou errado -> 401 sem chamar o handler", async () => {
    expect((await POST(req(update, null))).status).toBe(401);
    expect((await POST(req(update, "errado"))).status).toBe(401);
    expect(handleUpdate).not.toHaveBeenCalled();
    expect(markUpdateSeen).not.toHaveBeenCalled();
  });

  it("update novo -> handler chamado 1 vez e 200", async () => {
    const res = await POST(req(update));
    expect(res.status).toBe(200);
    expect(markUpdateSeen).toHaveBeenCalledWith(10);
    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleUpdate.mock.calls[0]![0].siteUrl).toBe("https://site.test");
  });

  it("update repetido -> 200 sem chamar o handler", async () => {
    markUpdateSeen.mockResolvedValue(false);
    expect((await POST(req(update))).status).toBe(200);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("handler lança -> 200 e log sem o token", async () => {
    handleUpdate.mockRejectedValue(new Error(`falhou em https://api.telegram.org/bot${TOKEN}/x`));
    const res = await POST(req(update));
    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
  });

  it("markUpdateSeen lança -> 200, sem handler", async () => {
    markUpdateSeen.mockRejectedValue(new Error("db"));
    expect((await POST(req(update))).status).toBe(200);
    expect(handleUpdate).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("corpo que não é JSON -> 200 sem handler", async () => {
    expect((await POST(req("não é json"))).status).toBe(200);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("update_id inválido -> 200 sem handler", async () => {
    expect((await POST(req(JSON.stringify({ update_id: "x" })))).status).toBe(200);
    expect(markUpdateSeen).not.toHaveBeenCalled();
    expect(handleUpdate).not.toHaveBeenCalled();
  });
});
