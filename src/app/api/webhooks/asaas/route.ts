import { NextResponse } from "next/server";
import { applyPaymentEvent, getAsaasProvider } from "@/server/providers/payments";
import { AsaasError, IgnoredEvent } from "@/server/providers/payments/asaas";

/**
 * Webhook do Asaas: token no header asaas-access-token → nova consulta do pagamento na API →
 * evento normalizado → confirm_payment idempotente (e lançamento no ledger) no banco.
 * Entrega "pelo menos uma vez": 200 só depois de persistir; 5xx faz o Asaas reenviar.
 */
export async function POST(request: Request) {
  let provider;
  try {
    provider = getAsaasProvider();
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const raw = await request.text();
  let event;
  try {
    event = await provider.verifyWebhook(request.headers, raw);
  } catch (e) {
    if (e instanceof IgnoredEvent) return NextResponse.json({ ok: true, ignored: true });
    if (e instanceof AsaasError && (e.status === 401 || e.status === 400))
      return NextResponse.json({ ok: false }, { status: e.status });
    // Falha ao consultar a API do Asaas: pede reenvio.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  try {
    const result = await applyPaymentEvent(event);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    // Cobrança avulsa sem pedido na Secretfans (ex.: outra cobrança da mesma conta Asaas):
    // responde 200 para não travar a fila. Em assinatura pode ser corrida com o vínculo da
    // 1ª cobrança, então pede reenvio.
    if (String(e).includes("P0002") && !event.subscriptionId)
      return NextResponse.json({ ok: true, ignored: "sem pedido" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
