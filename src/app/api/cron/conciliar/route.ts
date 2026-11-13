import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { createServiceSupabase } from "@/server/auth/supabase";
import {
  activeProviderName,
  applyPaymentEvent,
  getAsaasProvider,
} from "@/server/providers/payments";
import { normalizeAsaasStatus, splitTotalCents } from "@/server/providers/payments/asaas";
import { dispatchPendingEmails } from "@/server/email";
import { reconcileWithdrawals } from "@/server/payouts";

export const maxDuration = 60;

const sha = (s: string) => createHash("sha256").update(s).digest();

/**
 * Conciliação diária (Vercel Cron, Authorization: Bearer CRON_SECRET): consulta no Asaas os
 * pedidos pendentes há mais de 1h e os pagos nas últimas 48h, e aplica pelo mesmo
 * confirm_payment idempotente os eventos que o webhook não entregou.
 */
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(sha(auth), sha(`Bearer ${secret}`)))
    return NextResponse.json({ ok: false }, { status: 401 });
  if (activeProviderName() !== "asaas") return NextResponse.json({ ok: true, skipped: true });

  const db = createServiceSupabase();
  const asaas = getAsaasProvider();
  const now = Date.now();
  const [{ data: pending }, { data: paid }] = await Promise.all([
    db
      .from("orders")
      .select("id, status, provider_ref, provider_subscription_id")
      .eq("provider", "asaas")
      .eq("status", "pending")
      .not("provider_ref", "is", null)
      .lt("created_at", new Date(now - 3600_000).toISOString())
      .limit(100),
    db
      .from("orders")
      .select("id, status, provider_ref, provider_subscription_id")
      .eq("provider", "asaas")
      .eq("status", "paid")
      .gt("paid_at", new Date(now - 48 * 3600_000).toISOString())
      .limit(200),
  ]);

  const summary = { checked: 0, applied: 0, unchanged: 0, errors: 0 };
  for (const order of [...(pending ?? []), ...(paid ?? [])]) {
    summary.checked++;
    try {
      const payment = await asaas.getPayment(order.provider_ref!);
      const status = normalizeAsaasStatus(payment);
      const changed =
        status &&
        !(order.status === "paid" && status === "paid") &&
        !(order.status === "pending" && status === null);
      if (!changed || !status) {
        summary.unchanged++;
        continue;
      }
      const result = await applyPaymentEvent({
        provider: "asaas",
        eventId: `recon:${payment.id}:${status}`,
        type: `RECONCILIATION_${payment.status}`,
        payload: { source: "conciliacao", payment: { id: payment.id, status: payment.status } },
        chargeId: payment.id,
        status,
        splitCents: status === "paid" ? splitTotalCents(payment) : undefined,
        netCents:
          status === "paid" && payment.netValue != null
            ? Math.round(payment.netValue * 100)
            : undefined,
      });
      if (result === "duplicate" || result === "ignored") summary.unchanged++;
      else summary.applied++;
    } catch {
      summary.errors++;
    }
  }
  const withdrawals = await reconcileWithdrawals().catch(() => ({ checked: 0, settled: 0 }));
  // Avisa (site e e-mail) quem tem assinatura que não renova sozinha e acaba em até 3 dias.
  const { data: expiring } = await db.rpc("notify_expiring_subscriptions", { p_days: 3 });
  // Fila de e-mails de notificação que ficou para trás (ex.: envio em massa grande).
  const emails = await dispatchPendingEmails(200).catch(() => ({ sent: 0, failed: 0 }));
  return NextResponse.json({ ok: true, ...summary, withdrawals, expiring, emails });
}
