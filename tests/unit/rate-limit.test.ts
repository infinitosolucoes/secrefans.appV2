import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
const { upstashFromEnv, upstashHit } = await import("@/server/security/rateLimit");

function fakeUpstash() {
  const counts = new Map<string, number>();
  const calls: unknown[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const cmds = JSON.parse(String(init.body)) as string[][];
    calls.push({ url: _url, auth: (init.headers as Record<string, string>).Authorization, cmds });
    const key = cmds[0]![1]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return new Response(JSON.stringify([{ result: counts.get(key) }, { result: 1 }]));
  }) as unknown as typeof fetch;
  return { cfg: { url: "https://x.upstash.io", token: "tok", fetchImpl }, calls };
}

describe("rate limit com Upstash", () => {
  it("lê as variáveis do Upstash ou da integração da Vercel", () => {
    expect(upstashFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      upstashFromEnv({
        UPSTASH_REDIS_REST_URL: "https://a.io/",
        UPSTASH_REDIS_REST_TOKEN: "t",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ url: "https://a.io", token: "t" });
    expect(
      upstashFromEnv({
        KV_REST_API_URL: "https://b.io",
        KV_REST_API_TOKEN: "k",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      url: "https://b.io",
      token: "k",
    });
  });

  it("conta na janela atual, bloqueia acima do limite e libera na janela seguinte", async () => {
    const { cfg, calls } = fakeUpstash();
    const t0 = 1_800_000_000_000; // início exato de uma janela de 60 s
    expect(await upstashHit(cfg, "signin:1.2.3.4", 2, 60_000, t0)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect((await upstashHit(cfg, "signin:1.2.3.4", 2, 60_000, t0 + 1000)).allowed).toBe(true);
    expect(await upstashHit(cfg, "signin:1.2.3.4", 2, 60_000, t0 + 15_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
    expect((await upstashHit(cfg, "signin:1.2.3.4", 2, 60_000, t0 + 60_000)).allowed).toBe(true);
    expect(calls[0]).toMatchObject({
      url: "https://x.upstash.io/pipeline",
      auth: "Bearer tok",
      cmds: [
        ["INCR", `rl:signin:1.2.3.4:${t0 / 60_000}`],
        ["PEXPIRE", `rl:signin:1.2.3.4:${t0 / 60_000}`, "60000"],
      ],
    });
  });

  it("erro do Upstash vira exceção (quem chama cai na memória)", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("x", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      upstashHit({ url: "https://x.io", token: "t", fetchImpl }, "k", 1, 1000),
    ).rejects.toThrow();
  });
});
