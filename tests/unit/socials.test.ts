import { describe, expect, it } from "vitest";
import { normalizeSocialHandle, parseSocials, SOCIAL_NETWORKS } from "@/features/identity/socials";

describe("redes sociais", () => {
  it("aceita @usuario, usuario e link do perfil", () => {
    expect(normalizeSocialHandle("@maria.silva")).toBe("maria.silva");
    expect(normalizeSocialHandle("  maria_01 ")).toBe("maria_01");
    expect(normalizeSocialHandle("https://www.instagram.com/maria.silva/")).toBe("maria.silva");
    expect(normalizeSocialHandle("https://www.tiktok.com/@maria?lang=pt")).toBe("maria");
  });

  it("descarta redes desconhecidas e valores inválidos", () => {
    expect(parseSocials({ instagram: "ok_1", x: "<script>", onlyfans: "nope", tiktok: 5 })).toEqual(
      { instagram: "ok_1" },
    );
    expect(parseSocials(null)).toEqual({});
  });

  it("monta links só para domínios conhecidos", () => {
    const urls = SOCIAL_NETWORKS.map((n) => new URL(n.url("abc")).hostname);
    expect(urls).toEqual(["instagram.com", "www.tiktok.com", "x.com", "www.youtube.com", "t.me"]);
  });
});
