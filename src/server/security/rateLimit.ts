import "server-only";
import { headers } from "next/headers";

/**
 * Limite de tentativas (janela fixa). Em produção usa o Upstash Redis (contador compartilhado por
 * todas as instâncias da Vercel); sem as variáveis do Upstash, cai no limitador em memória (dev e
 * instância única). Se o Upstash falhar, usa a memória para não derrubar o login.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string): RateLimitResult;
}

export function createMemoryRateLimiter(
  limit: number,
  windowMs: number,
  now = () => Date.now(),
): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const t = now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
        if (buckets.size > 10_000)
          for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
        return { allowed: true, retryAfterSeconds: 0 };
      }
      bucket.count += 1;
      return {
        allowed: bucket.count <= limit,
        retryAfterSeconds: Math.ceil((bucket.resetAt - t) / 1000),
      };
    },
  };
}

export interface UpstashConfig {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
}

/** Variáveis do Upstash (nomes da integração da Vercel ou do painel do Upstash). */
export function upstashFromEnv(env = process.env): UpstashConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** Janela fixa no Redis: INCR na chave da janela atual + expiração do tamanho da janela. */
export async function upstashHit(
  cfg: UpstashConfig,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowIndex = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${windowIndex}`;
  const res = await (cfg.fetchImpl ?? fetch)(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PEXPIRE", redisKey, String(windowMs)],
    ]),
    signal: AbortSignal.timeout(1500),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result?: number; error?: string }>;
  const count = Number(data[0]?.result);
  if (!Number.isFinite(count)) throw new Error("upstash: resposta inválida");
  const resetAt = (windowIndex + 1) * windowMs;
  return {
    allowed: count <= limit,
    retryAfterSeconds: count <= limit ? 0 : Math.ceil((resetAt - now) / 1000),
  };
}

const POLICIES = {
  signup: { limit: 10, windowMs: 60_000 },
  signin: { limit: 10, windowMs: 60_000 },
  forgot: { limit: 10, windowMs: 60_000 },
  checkout: { limit: 20, windowMs: 60_000 },
  message: { limit: 40, windowMs: 60_000 },
  withdrawal: { limit: 5, windowMs: 60_000 },
} as const;
export type RateLimitAction = keyof typeof POLICIES;

const memory = new Map<RateLimitAction, RateLimiter>();
const memoryFor = (action: RateLimitAction) => {
  let rl = memory.get(action);
  if (!rl) {
    rl = createMemoryRateLimiter(POLICIES[action].limit, POLICIES[action].windowMs);
    memory.set(action, rl);
  }
  return rl;
};

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Conta uma tentativa da ação para o sujeito (IP ou usuário). */
export async function hitRateLimit(
  action: RateLimitAction,
  subject: string,
): Promise<RateLimitResult> {
  const { limit, windowMs } = POLICIES[action];
  const key = `${action}:${subject}`;
  const cfg = upstashFromEnv();
  if (cfg) {
    try {
      return await upstashHit(cfg, key, limit, windowMs);
    } catch {
      // Upstash fora do ar: segue com a memória desta instância.
    }
  }
  return memoryFor(action).hit(key);
}

const tooMany = (s: number) => `Muitas tentativas. Tente novamente em ${s}s.`;

/** Login, cadastro e senha: limite por IP. Retorna a mensagem de erro se excedeu. */
export async function checkAuthRateLimit(action: "signup" | "signin" | "forgot") {
  const r = await hitRateLimit(action, await clientIp());
  return r.allowed ? null : tooMany(r.retryAfterSeconds);
}

/** Ações de usuário logado (checkout, mensagens, saques): limite por usuário. */
export async function checkUserRateLimit(action: RateLimitAction, userId: string) {
  const r = await hitRateLimit(action, userId);
  return r.allowed ? null : tooMany(r.retryAfterSeconds);
}
