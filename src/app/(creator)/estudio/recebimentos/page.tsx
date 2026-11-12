import type { Metadata } from "next";
import { Landmark, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { activeProviderName } from "@/server/providers/payments";
import { formatBRL } from "@/features/content/constants";
import { getCreatorBalanceCents, getPayoutAccount } from "@/features/commerce/queries";
import { LinkWalletForm, PayoutAccountForm } from "@/features/commerce/PayoutAccountForm";
import { StudioTabs } from "@/features/commerce/StudioTabs";

export const metadata: Metadata = { title: "Recebimentos · Studio" };

const STATUS = {
  approved: { label: "Ativa", tone: "success" },
  pending: { label: "Em análise", tone: "warning" },
  rejected: { label: "Recusada", tone: "danger" },
} as const;

export default async function Page() {
  const user = await requireRole(["creator"], "/estudio/recebimentos");
  const provider = activeProviderName();
  const [account, balance] = await Promise.all([
    getPayoutAccount(user.id, "asaas"),
    getCreatorBalanceCents(),
  ]);

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Studio"
        title="Recebimentos"
        description="Para onde vai o dinheiro das suas vendas."
      />
      <StudioTabs active="/estudio/recebimentos" />
      <div className="flex max-w-3xl flex-col gap-5">
        <section className="flex flex-wrap items-center gap-4 rounded-lg border border-accent bg-surface-alt p-5 shadow-glow-sm">
          <Wallet className="size-8 text-accent" aria-hidden />
          <div className="flex-1">
            <p className="type-caption text-ink-muted">Saldo a receber pela Secretfans</p>
            <p className="text-2xl font-extrabold text-accent-text">{formatBRL(balance)}</p>
          </div>
          <p className="max-w-xs type-caption text-ink-muted">
            Vendas sem split, já descontados a comissão e a taxa. As vendas com split caem direto na
            sua conta Asaas e não entram aqui. Estornos e chargebacks são abatidos.
          </p>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6">
          <h2 className="flex items-center gap-2 type-body-strong text-ink">
            <Landmark className="size-5 text-accent" aria-hidden />
            Conta de recebimento (Asaas)
          </h2>
          {account ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={STATUS[account.status as keyof typeof STATUS]?.tone ?? "neutral"}>
                  {STATUS[account.status as keyof typeof STATUS]?.label ?? account.status}
                </Badge>
                <span className="type-caption text-ink-muted">
                  Documento final {account.document_last4} · desde{" "}
                  {formatDateTime(account.created_at)}
                </span>
              </div>
              <p className="type-body text-ink-muted">
                {account.status === "approved"
                  ? "Cada venda é dividida na hora: a sua parte cai direto na sua conta Asaas."
                  : "Enquanto a conta está em análise, suas vendas continuam e o valor fica registrado no seu saldo."}
              </p>
            </>
          ) : provider !== "asaas" ? (
            <Alert tone="info">
              Os recebimentos reais serão ativados quando o provedor de pagamentos estiver ligado
              neste ambiente.
            </Alert>
          ) : (
            <>
              <p className="type-body text-ink-muted">
                Cadastre sua conta para receber cada venda direto, por split. Sem ela, as vendas
                continuam e o valor fica no seu saldo até o cadastro.
              </p>
              <details className="group rounded-md border border-border p-4" open>
                <summary className="cursor-pointer type-label font-semibold text-ink">
                  Já tenho conta no Asaas
                </summary>
                <div className="mt-4">
                  <LinkWalletForm />
                </div>
              </details>
              <details className="group rounded-md border border-border p-4">
                <summary className="cursor-pointer type-label font-semibold text-ink">
                  Abrir uma conta Asaas pela Secretfans
                </summary>
                <div className="mt-4">
                  <PayoutAccountForm />
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
