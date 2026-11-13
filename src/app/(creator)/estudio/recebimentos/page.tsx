import type { Metadata } from "next";
import { Banknote, Landmark, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, Button, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { maskPixKey, PIX_KEY_LABEL, type PixKeyTypeName } from "@/lib/pix";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { activeProviderName } from "@/server/providers/payments";
import { formatBRL } from "@/features/content/constants";
import {
  getPayoutAccount,
  getPayoutSummary,
  getPixKey,
  getWithdrawals,
} from "@/features/commerce/queries";
import { WITHDRAWAL_STATUS } from "@/features/commerce/constants";
import { cancelWithdrawalAction } from "@/features/commerce/withdrawal-actions";
import { PixKeyForm, WithdrawalRequestForm } from "@/features/commerce/WithdrawalForms";
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
  const supabase = await createServerSupabase();
  const [account, summary, pixKey, withdrawals, { data: verification }] = await Promise.all([
    getPayoutAccount(user.id, "asaas"),
    getPayoutSummary(),
    getPixKey(user.id),
    getWithdrawals(user.id),
    supabase
      .from("creator_verifications")
      .select("status")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  const balance = summary.balance;
  const open = withdrawals.find((w) => w.status === "requested" || w.status === "processing");

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
            <Banknote className="size-5 text-accent" aria-hidden />
            Sacar por Pix
          </h2>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Disponível para saque", value: summary.available, strong: true },
              { label: "Em liberação", value: summary.held },
              { label: "Em saque", value: summary.reserved },
            ].map((c) => (
              <div key={c.label} className="rounded-md border border-border p-3">
                <dt className="type-caption text-ink-muted">{c.label}</dt>
                <dd
                  className={
                    c.strong
                      ? "text-xl font-extrabold text-accent-text"
                      : "text-lg font-bold text-ink"
                  }
                >
                  {formatBRL(c.value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="type-caption text-ink-muted">
            Cada venda fica disponível {summary.holdDaysPix} dias depois do pagamento no Pix e{" "}
            {summary.holdDaysCard} dias no cartão (prazo de recebimento e contestação). Saque mínimo
            de {formatBRL(summary.min)}, sem custo para você.
          </p>

          {!verification ? (
            <Alert tone="info">
              Para sacar, conclua a verificação de identidade em Studio → Verificação.
            </Alert>
          ) : !pixKey ? (
            <PixKeyForm hasKey={false} />
          ) : (
            <>
              <p className="type-body text-ink">
                Chave Pix: <strong>{PIX_KEY_LABEL[pixKey.key_type as PixKeyTypeName]}</strong>{" "}
                {maskPixKey(pixKey.key_type, pixKey.key_value)}
              </p>
              {open ? (
                <Alert tone="info">
                  {open.status === "requested"
                    ? `Saque de ${formatBRL(open.amount_cents)} solicitado. O financeiro confere e envia o Pix em até 2 dias úteis.`
                    : `Saque de ${formatBRL(open.amount_cents)} aprovado: o Pix está sendo enviado.`}
                </Alert>
              ) : (
                <WithdrawalRequestForm available={summary.available} min={summary.min} />
              )}
              {!open && (
                <details className="rounded-md border border-border p-4">
                  <summary className="cursor-pointer type-label font-semibold text-ink">
                    Trocar chave Pix
                  </summary>
                  <div className="mt-4">
                    <PixKeyForm hasKey />
                  </div>
                </details>
              )}
            </>
          )}

          {withdrawals.length > 0 && (
            <Table caption="Seus saques">
              <THead columns={["Pedido em", "Valor", "Situação", ""]} />
              <tbody>
                {withdrawals.map((w) => {
                  const st = WITHDRAWAL_STATUS[w.status];
                  const note = w.status === "rejected" ? w.decision_reason : w.failure_reason;
                  return (
                    <Tr key={w.id}>
                      <Td>{formatDateTime(w.requested_at)}</Td>
                      <Td>{formatBRL(w.amount_cents)}</Td>
                      <Td>
                        <Badge tone={st?.tone ?? "neutral"}>{st?.label ?? w.status}</Badge>
                        {note && <span className="ml-2 type-caption text-ink-muted">{note}</span>}
                      </Td>
                      <Td>
                        {w.status === "requested" && (
                          <form action={cancelWithdrawalAction}>
                            <input type="hidden" name="id" value={w.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Cancelar
                            </Button>
                          </form>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
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
