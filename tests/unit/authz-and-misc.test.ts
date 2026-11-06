import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPermission, isStaffRole, type AppRole } from "@/server/authorization/roles";
import { createMemoryRateLimiter } from "@/server/security/rateLimit";
import {
  ageOn,
  validateDocument,
  verificationSubmitSchema,
} from "@/features/creators/verification";
import { buildTokensCss, resolveColor, type TokensFile } from "../../scripts/tokens-lib";

const root = resolve(import.meta.dirname, "../..");

describe("RBAC espelhado no frontend", () => {
  it("bate com role_permissions da migration (fonte da verdade)", () => {
    const sql = readFileSync(
      resolve(root, "supabase/migrations/20261106000002_identity.sql"),
      "utf8",
    );
    const pairs = [...sql.matchAll(/\('(\w+)', '([\w.]+)'\)/g)]
      .map((m) => [m[1] ?? "", m[2] ?? ""] as const)
      .filter(([role]) =>
        ["fan", "creator", "moderator", "support", "finance", "admin_ops", "super_admin"].includes(
          role,
        ),
      );
    expect(pairs.length).toBeGreaterThan(10);
    for (const [role, perm] of pairs)
      expect(hasPermission([role as AppRole], perm), `${role} → ${perm}`).toBe(true);
    const total = (
      ["support", "moderator", "finance", "admin_ops", "super_admin"] as AppRole[]
    ).reduce(
      (n, r) =>
        n +
        [
          "users.read",
          "users.manage",
          "roles.manage",
          "verifications.read",
          "verifications.decide",
          "verification_documents.read",
          "audit.read",
          "settings.read",
          "settings.manage",
        ].filter((p) => hasPermission([r], p)).length,
      0,
    );
    expect(total).toBe(pairs.length);
  });
  it("fan e creator não são equipe", () => {
    expect(isStaffRole(["fan", "creator"])).toBe(false);
    expect(isStaffRole(["fan", "moderator"])).toBe(true);
  });
});

describe("rate limiter em memória", () => {
  it("bloqueia após o limite e libera na nova janela", () => {
    let now = 0;
    const rl = createMemoryRateLimiter(2, 1000, () => now);
    expect(rl.hit("k").allowed).toBe(true);
    expect(rl.hit("k").allowed).toBe(true);
    expect(rl.hit("k").allowed).toBe(false);
    expect(rl.hit("outra").allowed).toBe(true);
    now = 1001;
    expect(rl.hit("k").allowed).toBe(true);
  });
});

describe("verificação de criador", () => {
  const uid = "00000000-0000-4000-a000-000000000002";
  it("calcula idade considerando aniversário", () => {
    const today = new Date(2026, 10, 6);
    expect(ageOn("2008-11-06", today)).toBe(18);
    expect(ageOn("2008-11-07", today)).toBe(17);
  });
  it("valida tipo e tamanho de documento", () => {
    expect(validateDocument({ size: 100, type: "image/jpeg" })).toBeNull();
    expect(validateDocument({ size: 100, type: "image/gif" })).not.toBeNull();
    expect(validateDocument({ size: 11 * 1024 * 1024, type: "application/pdf" })).not.toBeNull();
  });
  it("só aceita caminhos na pasta do próprio usuário", () => {
    const base = {
      legalName: "Fulano de Tal",
      birthDate: "1990-01-01",
      documentFrontPath: `${uid}/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e.jpg`,
      documentBackPath: null,
      selfiePath: `${uid}/1e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e.png`,
      rightsConsent: true,
      depictedConsent: true,
    };
    expect(verificationSubmitSchema(uid).safeParse(base).success).toBe(true);
    expect(
      verificationSubmitSchema(uid).safeParse({
        ...base,
        selfiePath: "00000000-0000-4000-a000-000000000009/1e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e.png",
      }).success,
    ).toBe(false);
    expect(
      verificationSubmitSchema(uid).safeParse({ ...base, depictedConsent: false }).success,
    ).toBe(false);
  });
});

describe("tokens do design system", () => {
  const file = JSON.parse(readFileSync(resolve(root, "design/tokens.json"), "utf8")) as TokensFile;
  it("resolve aliases por tema", () => {
    expect(resolveColor(file.color, "neon", "surface")).toBe("#0b0205");
    expect(resolveColor(file.color, "light", "accent")).toBe("#c9343f");
  });
  it("detecta alias circular", () => {
    const bad = {
      themes: [{ id: "a", name: "A" }],
      tokens: [
        { name: "x", value: "{y}" },
        { name: "y", value: "{x}" },
      ],
    };
    expect(() => resolveColor(bad, "a", "x")).toThrow(/circular/);
  });
  it("gera CSS com tema neon como padrão e utilitários tipográficos", () => {
    const css = buildTokensCss(file);
    expect(css).toContain(":root {");
    expect(css).toContain("--rosa-neon: #ff0a78;");
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("@utility type-hero");
    expect(css).not.toMatch(/var\(--radius-sm\);/);
  });
});
