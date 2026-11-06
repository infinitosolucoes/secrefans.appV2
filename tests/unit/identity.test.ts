import { describe, expect, it } from "vitest";
import {
  handleSchema,
  passwordSchema,
  resetSchema,
  safeNextPath,
  signUpSchema,
} from "@/features/identity/schemas";
import { parsePublicEnv } from "@/lib/env";

describe("safeNextPath (proteção contra open redirect)", () => {
  it.each([
    ["/estudio", "/estudio"],
    ["/super-admin?x=1", "/super-admin?x=1"],
    ["//evil.com", "/inicio"],
    ["/\\evil.com", "/inicio"],
    ["https://evil.com", "/inicio"],
    ["javascript:alert(1)", "/inicio"],
    [null, "/inicio"],
    ["", "/inicio"],
  ])("%s → %s", (input, expected) => expect(safeNextPath(input)).toBe(expected));
});

describe("handleSchema", () => {
  it("normaliza para minúsculas", () =>
    expect(handleSchema.parse("Maria.Silva")).toBe("maria.silva"));
  it.each(["ab", "com espaço", "acentuação", "a".repeat(31), "admin", "estudio"])(
    "rejeita %s",
    (h) => expect(handleSchema.safeParse(h).success).toBe(false),
  );
});

describe("passwordSchema", () => {
  it("aceita senha forte", () =>
    expect(passwordSchema.safeParse("Segura12345").success).toBe(true));
  it.each(["curta1A", "semnumeroAAAA", "SEMMINUSCULA1", "semmaiuscula1"])("rejeita %s", (p) =>
    expect(passwordSchema.safeParse(p).success).toBe(false),
  );
  it("reset exige confirmação igual", () =>
    expect(resetSchema.safeParse({ password: "Segura12345", confirm: "Outra12345A" }).success).toBe(
      false,
    ));
});

describe("signUpSchema", () => {
  const base = {
    email: "a@b.com",
    password: "Segura12345",
    handle: "maria",
    displayName: "Maria",
    intent: "fan",
    age18: "on",
    terms: "on",
  };
  it("aceita cadastro completo", () => expect(signUpSchema.safeParse(base).success).toBe(true));
  it("exige declaração de 18+", () =>
    expect(signUpSchema.safeParse({ ...base, age18: undefined }).success).toBe(false));
  it("exige aceite dos termos", () =>
    expect(signUpSchema.safeParse({ ...base, terms: undefined }).success).toBe(false));
  it("não aceita papel arbitrário como intenção", () =>
    expect(signUpSchema.safeParse({ ...base, intent: "super_admin" }).success).toBe(false));
});

describe("parsePublicEnv", () => {
  it("falha sem URL do Supabase", () =>
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(30) })).toThrow());
  it("aplica default do site", () =>
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(30),
      }).NEXT_PUBLIC_SITE_URL,
    ).toBe("http://localhost:3000"));
});
