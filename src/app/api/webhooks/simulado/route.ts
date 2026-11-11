import { NextResponse } from "next/server";
import {
  applyPaymentEvent,
  getPaymentProvider,
  simulatedPaymentsAllowed,
} from "@/server/providers/payments";

/**
 * Webhook do provedor simulado. Mesmo fluxo do webhook real (S5): corpo bruto → verificação da
 * assinatura → evento normalizado → confirm_payment idempotente no banco.
 */
export async function POST(request: Request) {
  if (!simulatedPaymentsAllowed()) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  let event;
  try {
    event = await getPaymentProvider().verifyWebhook(request.headers, raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await applyPaymentEvent(event);
    return NextResponse.json({ ok: true, result });
  } catch {
    // 5xx faz o provedor reenviar; o banco descarta duplicados.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
