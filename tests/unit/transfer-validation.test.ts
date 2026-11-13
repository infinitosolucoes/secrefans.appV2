import { describe, expect, it } from "vitest";
import { matchWithdrawal, samePixKey, type PendingWithdrawal } from "@/lib/transfer-validation";

const NOW = Date.parse("2026-11-13T02:00:00Z");
const w = (over: Partial<PendingWithdrawal> = {}): PendingWithdrawal => ({
  id: "w-1",
  amount_cents: 5253,
  pix_key_type: "email",
  pix_key_value: "cliente-a00001@pix.bcb.gov.br",
  provider_transfer_id: null,
  decided_at: "2026-11-13T01:58:00Z",
  ...over,
});
const req = (over: Record<string, unknown> = {}) => ({
  type: "TRANSFER",
  transfer: {
    id: "tr_1",
    value: 52.53,
    operationType: "PIX",
    bankAccount: { pixAddressKey: "Cliente-A00001@pix.bcb.gov.br" },
    ...over,
  },
});

describe("validação de saque (Asaas)", () => {
  it("aprova a transferência de um saque aprovado (valor e chave batem)", () => {
    const r = matchWithdrawal(req(), [w()], NOW);
    expect(r.answer).toEqual({ status: "APPROVED" });
    expect(r.withdrawal?.id).toBe("w-1");
  });

  it("aprova pelo id quando a transferência já foi vinculada", () => {
    const r = matchWithdrawal(
      req({ bankAccount: null }),
      [w({ provider_transfer_id: "tr_1" })],
      NOW,
    );
    expect(r.answer.status).toBe("APPROVED");
  });

  it("recusa valor diferente, chave diferente, saque antigo e outros tipos", () => {
    expect(matchWithdrawal(req({ value: 99 }), [w()], NOW).answer.status).toBe("REFUSED");
    expect(
      matchWithdrawal(req({ bankAccount: { pixAddressKey: "outro@x.com" } }), [w()], NOW).answer
        .status,
    ).toBe("REFUSED");
    expect(
      matchWithdrawal(req(), [w({ decided_at: "2026-11-13T01:00:00Z" })], NOW).answer.status,
    ).toBe("REFUSED");
    expect(matchWithdrawal({ type: "BILL" }, [w()], NOW).answer).toMatchObject({
      status: "REFUSED",
    });
    expect(matchWithdrawal(req(), [], NOW).answer.status).toBe("REFUSED");
  });

  it("recusa se o id vinculado tiver outro valor", () => {
    const r = matchWithdrawal(req({ value: 10 }), [w({ provider_transfer_id: "tr_1" })], NOW);
    expect(r.answer).toMatchObject({ status: "REFUSED" });
  });

  it("compara chaves ignorando formatação", () => {
    expect(samePixKey("cpf", "52998224725", "529.982.247-25")).toBe(true);
    expect(samePixKey("phone", "+5511912345678", "11912345678")).toBe(true);
    expect(samePixKey("email", "a@b.com", "A@B.com")).toBe(true);
    expect(samePixKey("cpf", "52998224725", null)).toBe(false);
  });
});
