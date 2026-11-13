import { describe, expect, it, vi } from "vitest";
import { AsaasPaymentProvider, asaasCycle } from "@/server/providers/payments/asaas";

describe("planos no Asaas", () => {
  it("período do plano vira o ciclo da assinatura", () => {
    expect([1, 3, 6, 12].map(asaasCycle)).toEqual([
      "MONTHLY",
      "QUARTERLY",
      "SEMIANNUALLY",
      "YEARLY",
    ]);
  });

  it("fim da promoção: atualiza só as próximas cobranças, com o novo split", async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? "GET", url, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const p = new AsaasPaymentProvider({
      apiKey: "k".repeat(30),
      env: "sandbox",
      webhookToken: "t".repeat(40),
      fetchImpl,
    });
    await p.updateSubscriptionValue("sub_1", 10000, { walletId: "w-1", fixedValueCents: 8801 });
    expect(calls[0]).toEqual({
      method: "PUT",
      url: "https://api-sandbox.asaas.com/v3/subscriptions/sub_1",
      body: {
        value: 100,
        updatePendingPayments: false,
        split: [{ walletId: "w-1", fixedValue: 88.01 }],
      },
    });
  });
});
