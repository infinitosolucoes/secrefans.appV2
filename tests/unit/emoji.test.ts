import { describe, expect, it } from "vitest";
import { EMOJIS, insertAt } from "@/lib/emoji";

describe("seletor de emoji", () => {
  it("insere na posição do cursor e devolve o novo cursor", () => {
    expect(insertAt("Oi tudo bem", "🔥", 2, 2)).toEqual({ value: "Oi🔥 tudo bem", cursor: 4 });
  });
  it("substitui o texto selecionado", () => {
    expect(insertAt("Oi tudo bem", "😍", 3, 7)).toEqual({ value: "Oi 😍 bem", cursor: 5 });
  });
  it("cursor fora do texto vai para o fim", () => {
    expect(insertAt("abc", "✨", 99, 99).value).toBe("abc✨");
  });
  it("lista sem repetidos", () => {
    expect(new Set(EMOJIS).size).toBe(EMOJIS.length);
  });
});
