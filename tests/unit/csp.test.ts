import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/csp";

describe("CSP com nonce", () => {
  it("scripts só com nonce e strict-dynamic, sem unsafe-inline em produção", () => {
    const csp = buildCsp("abc123", { dev: false, supabaseUrl: "https://x.supabase.co/" });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("media-src 'self' blob: https://x.supabase.co");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("em dev libera eval (recarga rápida do Next)", () => {
    expect(buildCsp("n", { dev: true, supabaseUrl: "http://127.0.0.1:54321" })).toContain(
      "'unsafe-eval'",
    );
  });
  it("nonce novo a cada chamada", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});
