import { describe, expect, it, vi } from "vitest";
import {
  AsaasError,
  AsaasPaymentProvider,
  IgnoredEvent,
  normalizeAsaasStatus,
  todayInSaoPaulo,
} from "@/server/providers/payments/asaas";
import { isValidCnpj, isValidCpf, last4 } from "@/lib/cpf";

const TOKEN = "t".repeat(40);

function fakeFetch(routes: Record<string, unknown>) {
  const calls: Array<{
    method: string;
    url: string;
    body?: unknown;
    headers: Record<string, string>;
  }> = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = url.replace(/^https:\/\/api-sandbox\.asaas\.com\/v3/, "");
    calls.push({
      method,
      url: path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: init.headers as Record<string, string>,
    });
    const key = `${method} ${path}`;
    if (!(key in routes)) return new Response(JSON.stringify({ errors: [] }), { status: 404 });
    const value = routes[key];
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const provider = (routes: Record<string, unknown>) => {
  const f = fakeFetch(routes);
  return {
    p: new AsaasPaymentProvider({
      apiKey: "k".repeat(30),
      env: "sandbox",
      webhookToken: TOKEN,
      fetchImpl: f.impl,
    }),
    calls: f.calls,
  };
};

describe("CPF/CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(last4("529.982.247-25")).toBe("4725");
  });
});

describe("normalizeAsaasStatus", () => {
  it("mapeia os status da API", () => {
    expect(normalizeAsaasStatus({ status: "RECEIVED" })).toBe("paid");
    expect(normalizeAsaasStatus({ status: "CONFIRMED" })).toBe("paid");
    expect(normalizeAsaasStatus({ status: "REFUNDED" })).toBe("refunded");
    expect(normalizeAsaasStatus({ status: "CHARGEBACK_REQUESTED" })).toBe("chargeback");
    expect(normalizeAsaasStatus({ status: "OVERDUE" })).toBe("failed");
    expect(normalizeAsaasStatus({ status: "PENDING", deleted: true })).toBe("failed");
    expect(normalizeAsaasStatus({ status: "PENDING" })).toBeNull();
  });

  it("vencimento no fuso de São Paulo", () => {
    expect(todayInSaoPaulo(new Date("2026-11-12T02:30:00Z"))).toBe("2026-11-11");
  });
});

describe("AsaasPaymentProvider", () => {
  it("cria cobrança Pix com split fixo e busca o QR", async () => {
    const { p, calls } = provider({
      "POST /payments": {
        id: "pay_1",
        status: "PENDING",
        value: 19.9,
        billingType: "PIX",
        invoiceUrl: "https://x/i/1",
      },
      "GET /payments/pay_1/pixQrCode": {
        encodedImage: "QUJD",
        payload: "000201...",
        expirationDate: "2026-11-12 23:59:59",
      },
    });
    const r = await p.createCharge({
      orderId: "o-1",
      customerId: "cus_1",
      amount: 1990,
      method: "pix",
      description: "PPV",
      split: { walletId: "w-1", fixedValueCents: 1692 },
    });
    expect(calls[0]!.headers.access_token).toBe("k".repeat(30));
    expect(calls[0]!.body).toMatchObject({
      customer: "cus_1",
      billingType: "PIX",
      value: 19.9,
      externalReference: "o-1",
      split: [{ walletId: "w-1", fixedValue: 16.92 }],
    });
    expect(r).toMatchObject({
      providerChargeId: "pay_1",
      amount: 1990,
      pix: { copyPaste: "000201...", qrCodeBase64: "QUJD" },
    });
  });

  it("cliente novo entra no grupo secrefans.app", async () => {
    const { p, calls } = provider({ "POST /customers": { id: "cus_1" } });
    const id = await p.ensureCustomer({ name: "Fã", cpf: "52998224725", userId: "u-1" });
    expect(id).toBe("cus_1");
    expect(calls[0]!.body).toMatchObject({ groupName: "secrefans.app", externalReference: "u-1" });
  });

  it("cartão devolve a página segura do Asaas, sem QR", async () => {
    const { p, calls } = provider({
      "POST /payments": {
        id: "pay_2",
        status: "PENDING",
        value: 29.9,
        billingType: "CREDIT_CARD",
        invoiceUrl: "https://x/i/2",
      },
    });
    const r = await p.createCharge({
      orderId: "o-2",
      customerId: "c",
      amount: 2990,
      method: "card",
      description: "x",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ billingType: "CREDIT_CARD" });
    expect(r.checkoutUrl).toBe("https://x/i/2");
    expect(r.pix).toBeUndefined();
  });

  it("assinatura devolve a primeira cobrança", async () => {
    const { p } = provider({
      "POST /subscriptions": { id: "sub_1" },
      "GET /subscriptions/sub_1/payments": {
        data: [
          {
            id: "pay_s1",
            status: "PENDING",
            value: 29.9,
            billingType: "CREDIT_CARD",
            invoiceUrl: "u",
          },
        ],
      },
    });
    const r = await p.createSubscription({
      orderId: "o",
      customerId: "c",
      amount: 2990,
      method: "card",
      description: "Assinatura",
    });
    expect(r.subscriptionId).toBe("sub_1");
    expect(r.charge.providerChargeId).toBe("pay_s1");
  });

  it("não repete POST em erro 5xx (evita cobrança duplicada)", async () => {
    const { p, calls } = provider({ "POST /payments": new Response("{}", { status: 503 }) });
    await expect(
      p.createCharge({
        orderId: "o",
        customerId: "c",
        amount: 1000,
        method: "card",
        description: "x",
      }),
    ).rejects.toBeInstanceOf(AsaasError);
    expect(calls).toHaveLength(1);
  });

  it("webhook com token errado é recusado", async () => {
    const { p, calls } = provider({});
    await expect(
      p.verifyWebhook(new Headers({ "asaas-access-token": "errado" }), "{}"),
    ).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
  });

  it("webhook confia no status e no líquido da API, não no corpo", async () => {
    const { p } = provider({
      "GET /payments/pay_9": {
        id: "pay_9",
        status: "RECEIVED",
        value: 19.9,
        netValue: 18.8,
        subscription: "sub_7",
      },
    });
    const body = JSON.stringify({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_9", status: "FORJADO", value: 1 },
    });
    const e = await p.verifyWebhook(new Headers({ "asaas-access-token": TOKEN }), body);
    expect(e).toMatchObject({
      provider: "asaas",
      eventId: "evt_1",
      chargeId: "pay_9",
      status: "paid",
      netCents: 1880,
      subscriptionId: "sub_7",
    });
  });

  it("webhook informa o valor repassado ao criador via split", async () => {
    const { p } = provider({
      "GET /payments/pay_s": {
        id: "pay_s",
        status: "RECEIVED",
        value: 500,
        netValue: 498.01,
        split: [
          { walletId: "w", fixedValue: 448.01, totalValue: 448.01, status: "DONE" },
          { walletId: "x", fixedValue: 10, totalValue: 10, status: "CANCELLED" },
        ],
      },
    });
    const body = JSON.stringify({
      id: "evt_s",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_s" },
    });
    const e = await p.verifyWebhook(new Headers({ "asaas-access-token": TOKEN }), body);
    expect(e).toMatchObject({ netCents: 49801, splitCents: 44801 });
  });

  it("eventos que não mudam o pedido são ignorados", async () => {
    const { p } = provider({
      "GET /payments/pay_3": { id: "pay_3", status: "PENDING", value: 10 },
    });
    const body = JSON.stringify({
      id: "evt_2",
      event: "PAYMENT_CREATED",
      payment: { id: "pay_3" },
    });
    await expect(
      p.verifyWebhook(new Headers({ "asaas-access-token": TOKEN }), body),
    ).rejects.toBeInstanceOf(IgnoredEvent);
    await expect(
      p.verifyWebhook(
        new Headers({ "asaas-access-token": TOKEN }),
        JSON.stringify({ id: "e", event: "TRANSFER_DONE" }),
      ),
    ).rejects.toBeInstanceOf(IgnoredEvent);
  });
});
