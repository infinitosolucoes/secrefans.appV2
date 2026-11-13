import { describe, expect, it, vi } from "vitest";
import {
  AsaasPaymentProvider,
  IgnoredEvent,
  asaasPixKey,
  normalizeTransferStatus,
} from "@/server/providers/payments/asaas";
import { maskPixKey, normalizePixKey } from "@/lib/pix";

const TOKEN = "t".repeat(40);

function provider(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = url.replace(/^https:\/\/api-sandbox\.asaas\.com\/v3/, "");
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${method} ${path}`;
    if (!(key in routes)) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
  return {
    p: new AsaasPaymentProvider({
      apiKey: "k".repeat(30),
      env: "sandbox",
      webhookToken: TOKEN,
      fetchImpl,
    }),
    calls,
  };
}

describe("chave Pix de saque", () => {
  it("normaliza e valida cada tipo", () => {
    expect(normalizePixKey("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizePixKey("cpf", "529.982.247-24")).toBeNull();
    expect(normalizePixKey("cnpj", "11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizePixKey("email", " Fulana@Exemplo.com ")).toBe("fulana@exemplo.com");
    expect(normalizePixKey("email", "fulana@")).toBeNull();
    expect(normalizePixKey("phone", "(11) 91234-5678")).toBe("+5511912345678");
    expect(normalizePixKey("phone", "+55 11 91234-5678")).toBe("+5511912345678");
    expect(normalizePixKey("phone", "1234")).toBeNull();
    expect(normalizePixKey("evp", "7E9F2E34-7BD0-49BD-B90E-49BBCB250AE3")).toBe(
      "7e9f2e34-7bd0-49bd-b90e-49bbcb250ae3",
    );
  });

  it("mascara a chave na tela", () => {
    expect(maskPixKey("cpf", "52998224725")).toBe("***.982.247-**");
    expect(maskPixKey("email", "fulana@exemplo.com")).toBe("fu***@exemplo.com");
    expect(maskPixKey("phone", "+5511912345678")).toBe("+5511*****78");
  });
});

describe("transferência Pix no Asaas", () => {
  it("status final", () => {
    expect(normalizeTransferStatus({ status: "DONE" })).toBe("paid");
    expect(normalizeTransferStatus({ status: "FAILED" })).toBe("failed");
    expect(normalizeTransferStatus({ status: "CANCELLED" })).toBe("failed");
    expect(normalizeTransferStatus({ status: "PENDING" })).toBeNull();
    expect(normalizeTransferStatus({ status: "BANK_PROCESSING" })).toBeNull();
  });

  it("telefone vai sem +55 e o tipo em maiúsculas", () => {
    expect(asaasPixKey("phone", "+5511912345678")).toEqual({
      pixAddressKey: "11912345678",
      pixAddressKeyType: "PHONE",
    });
  });

  it("cria o Pix com valor em reais e referência do saque", async () => {
    const { p, calls } = provider({
      "POST /transfers": { id: "tr_1", status: "PENDING", value: 50 },
    });
    const t = await p.createPixTransfer({
      amountCents: 5000,
      keyType: "email",
      key: "criador@exemplo.com",
      externalReference: "withdrawal:abc",
      description: "Saque Secretfans",
    });
    expect(t.id).toBe("tr_1");
    expect(calls[0]!.body).toEqual({
      value: 50,
      operationType: "PIX",
      pixAddressKey: "criador@exemplo.com",
      pixAddressKeyType: "EMAIL",
      description: "Saque Secretfans",
      externalReference: "withdrawal:abc",
    });
  });

  it("webhook de transferência confere o token e reconsulta a API", async () => {
    const { p, calls } = provider({
      "GET /transfers/tr_1": { id: "tr_1", status: "DONE", value: 50, transferFee: 0.5 },
    });
    const headers = new Headers({ "asaas-access-token": TOKEN });
    const raw = JSON.stringify({
      event: "TRANSFER_DONE",
      transfer: { id: "tr_1", status: "FAILED" },
    });
    const r = await p.verifyTransferWebhook(headers, raw);
    expect(r).toMatchObject({ status: "paid", feeCents: 50 });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /transfers/tr_1"]);

    await expect(p.verifyTransferWebhook(new Headers(), raw)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      p.verifyTransferWebhook(headers, JSON.stringify({ event: "PAYMENT_RECEIVED" })),
    ).rejects.toBeInstanceOf(IgnoredEvent);
  });
});
