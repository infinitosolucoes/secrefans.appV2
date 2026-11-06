import "server-only";
import { headers } from "next/headers";

/**
 * Limitador simples em memória (janela fixa). Suficiente para dev e instância única.
 * TODO(SEC-PROD): trocar por store distribuído (ex.: Upstash Redis) antes do go-live na Vercel,
 * onde cada instância serverless tem memória própria. O Supabase Auth também aplica limites próprios.
 */
export interface RateLimiter {
  hit(key: string): { allowed: boolean; retryAfterSeconds: number };
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

const authLimiter = createMemoryRateLimiter(10, 60_000);

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Retorna mensagem de erro se o limite de tentativas foi excedido. */
export async function checkAuthRateLimit(action: string): Promise<string | null> {
  const { allowed, retryAfterSeconds } = authLimiter.hit(`${action}:${await clientIp()}`);
  return allowed ? null : `Muitas tentativas. Tente novamente em ${retryAfterSeconds}s.`;
}
