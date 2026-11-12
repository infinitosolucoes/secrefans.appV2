import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, buttonClasses, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { getAsaasProvider, simulatedPaymentsAllowed } from "@/server/providers/payments";
import type { ProviderChargeResult } from "@/server/providers/payments/PaymentProvider";
import { CopyButton, PendingOrderWatcher } from "@/features/commerce/PendingOrderWatcher";
import { formatBRL, UUID_RE } from "@/features/content/constants";
import { simulatePaymentAction } from "@/features/commerce/actions";
import { ORDER_KIND_LABEL, ORDER_STATUS, type OrderStatus } from "@/features/commerce/constants";

export const metadata: Metadata = { title: "Pedido", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const user = await requireUser(`/pedido/${id}`);
  const supabase = await createServerSupabase();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, buyer_id, creator_id, kind, target_id, description, method, gross_cents, status, provider, provider_ref, created_at, paid_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!order || order.buyer_id !== user.id) notFound();

  const { data: creator } = await supabase
    .from("public_profiles")
    .select("handle, display_name")
    .eq("id", order.creator_id)
    .maybeSingle();
  const status = order.status as OrderStatus;
  const destination =
    order.kind === "ppv"
      ? `/p/${order.target_id}`
      : order.kind === "package"
        ? `/biblioteca/pacote/${order.target_id}`
        : `/${creator?.handle ?? ""}`;
  const simulated = order.provider === "simulado" && simulatedPaymentsAllowed();

  // Asaas: busca o QR do Pix / a página segura do cartão direto no provedor.
  let charge: ProviderChargeResult | null = null;
  if (status === "pending" && order.provider === "asaas" && order.provider_ref) {
    try {
      charge = await getAsaasProvider().getCharge(order.provider_ref);
    } catch {
      charge = null;
    }
  }

  return (
    <AppShell user={user} active="/biblioteca">
      <PageHeader
        eyebrow={ORDER_KIND_LABEL[order.kind]}
        title={status === "paid" ? "Pagamento confirmado" : "Pedido criado"}
        description={`${order.description} · ${creator?.display_name || creator?.handle || ""}`}
      />
      <div className="flex max-w-2xl flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-2xl font-extrabold text-accent-text">
              {formatBRL(order.gross_cents)}
            </span>
            <Badge tone={ORDER_STATUS[status].tone}>{ORDER_STATUS[status].label}</Badge>
          </div>
          <p className="type-caption text-ink-muted">
            Pedido criado em {formatDateTime(order.created_at)} ·{" "}
            {order.method === "pix" ? "Pix" : "Cartão de crédito"}
            {order.paid_at && ` · pago em ${formatDateTime(order.paid_at)}`}
          </p>

          {status === "pending" && order.provider === "asaas" && (
            <>
              {order.method === "pix" && charge?.pix ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="flex items-center gap-2 type-label text-ink">
                    <Clock className="size-4 text-warning" aria-hidden />
                    Escaneie o QR Code ou use o Pix copia-e-cola no app do seu banco.
                  </p>
                  {charge.pix.qrCodeBase64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/png;base64,${charge.pix.qrCodeBase64}`}
                      alt="QR Code do Pix"
                      width={208}
                      height={208}
                      className="rounded-md bg-white p-2"
                    />
                  )}
                  <code className="block w-full overflow-x-auto rounded-sm border border-border bg-surface p-3 type-caption text-ink-muted">
                    {charge.pix.copyPaste}
                  </code>
                  <CopyButton text={charge.pix.copyPaste} />
                </div>
              ) : charge?.checkoutUrl ? (
                <div className="flex flex-col items-start gap-2">
                  <p className="type-body text-ink-muted">
                    Os dados do cartão são digitados na página segura do Asaas e não ficam na
                    Secretfans.
                  </p>
                  <a
                    href={charge.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses("primary", "md")}
                  >
                    Pagar com cartão
                  </a>
                </div>
              ) : (
                <Alert tone="error">
                  Não foi possível carregar os dados de pagamento agora. Tente atualizar a página.
                </Alert>
              )}
              <PendingOrderWatcher />
            </>
          )}

          {status === "pending" && order.provider !== "asaas" && (
            <>
              {order.method === "pix" ? (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 type-label text-ink">
                    <Clock className="size-4 text-warning" aria-hidden />
                    Pague com o Pix copia-e-cola abaixo. O acesso é liberado quando o provedor
                    confirmar.
                  </p>
                  <code className="block overflow-x-auto rounded-sm border border-border bg-surface p-3 type-caption text-ink-muted">
                    {`00020126SIMULADO-SECRETFANS-${order.provider_ref ?? ""}`}
                  </code>
                </div>
              ) : (
                <p className="type-body text-ink-muted">
                  Você será levado ao formulário seguro do provedor para informar o cartão.
                </p>
              )}
              <Link href={`/pedido/${order.id}`} className={buttonClasses("secondary", "sm")}>
                Atualizar status
              </Link>
            </>
          )}

          {status === "paid" && (
            <Alert tone="success" title="Acesso liberado">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden />
                {order.kind === "tip"
                  ? "Obrigado pelo apoio!"
                  : "O conteúdo já está disponível na sua biblioteca."}
              </span>
            </Alert>
          )}
          {status === "paid" && (
            <div className="flex flex-wrap gap-2">
              <Link href={destination} className={buttonClasses("primary", "md")}>
                {order.kind === "ppv"
                  ? "Ver publicação"
                  : order.kind === "package"
                    ? "Abrir pacote"
                    : "Ir para o perfil"}
              </Link>
              <Link href="/biblioteca" className={buttonClasses("secondary", "md")}>
                Minha biblioteca
              </Link>
            </div>
          )}
        </section>

        {simulated && status === "pending" && (
          <section className="flex flex-col gap-3 rounded-lg border border-dashed border-warning p-5">
            <p className="flex items-center gap-2 type-label font-semibold text-ink">
              <FlaskConical className="size-4 text-warning" aria-hidden />
              Ambiente de testes
            </p>
            <p className="type-caption text-ink-muted">
              Simula o aviso do provedor de pagamentos. Passa pelo mesmo webhook assinado que o
              provedor real usará; nunca aparece em produção.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={simulatePaymentAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value="paid" />
                <button type="submit" className={buttonClasses("primary", "sm")}>
                  Simular pagamento aprovado
                </button>
              </form>
              <form action={simulatePaymentAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value="failed" />
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  Simular recusa
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
