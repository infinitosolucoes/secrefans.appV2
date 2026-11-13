import Link from "next/link";
import { Banknote, Wallet } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { maskPixKey, PIX_KEY_LABEL, type PixKeyTypeName } from "@/lib/pix";
import { serverEnv } from "@/lib/env.server";
import { createServerSupabase } from "@/server/auth/supabase";
import { activeProviderName } from "@/server/providers/payments";
import { formatBRL } from "@/features/content/constants";
import { WITHDRAWAL_STATUS } from "./constants";
import { getPayoutSummary, getPixKey, getWithdrawals } from "./queries";
import { cancelWithdrawalAction } from "./withdrawal-actions";
import { PixKeyForm, WithdrawalRequestForm } from "./WithdrawalForms";

const holdText = (days: number) => (days > 0 ? `${days} dias depois do pagamento` : "na hora");

/** Carteira do criador: saldo a receber pela Secretfans, chave Pix e saques. */
export async function CreatorWallet({ userId, mfa }: { userId: string; mfa: boolean }) {
  const supabase = await createServerSupabase();
  const [summary, pixKey, withdrawals, { data: verification }] = await Promise.all([
    getPayoutSummary(),
    getPixKey(userId),
    getWithdrawals(userId),
    supabase
      .from("creator_verifications")
      .select("status")
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  const balance = summary.balance;
  const sandbox = activeProviderName() === "asaas" && serverEnv().ASAAS_ENV !== "production";
  const open = withdrawals.find((w) => w.status === "requested" || w.status === "processing");

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-accent bg-surface-alt p-5 shadow-glow-sm">
        <Wallet className="size-8 text-accent" aria-hidden />
        <div className="flex-1">
          <p className="type-caption text-ink-muted">Saldo a receber pela Secretfans</p>
          <p className="text-2xl font-extrabold text-accent-text">{formatBRL(balance)}</p>
        </div>
        <p className="max-w-xs type-caption text-ink-muted">
          Vendas sem split, já descontados a comissão e a taxa. As vendas com split caem direto na
          sua conta Asaas (Studio → Recebimentos) e não entram aqui. Estornos e chargebacks são
          abatidos.
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
          Cada venda fica disponível {holdText(summary.holdDaysPix)} no Pix e{" "}
          {holdText(summary.holdDaysCard)} no cartão (prazo de recebimento e contestação). Saque
          mínimo de {formatBRL(summary.min)}, sem custo para você.
        </p>

        {!mfa && (
          <Alert tone="info">
            Proteja seus saques: ative a{" "}
            <Link href="/conta/seguranca" className="font-semibold underline">
              verificação em duas etapas
            </Link>
            .
          </Alert>
        )}
        {!verification ? (
          <Alert tone="info">
            Para sacar, conclua a verificação de identidade.{" "}
            <Link href="/estudio/verificacao" className="font-semibold underline">
              Fazer a verificação
            </Link>
          </Alert>
        ) : !pixKey ? (
          <PixKeyForm hasKey={false} sandbox={sandbox} />
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
                  : `Saque de ${formatBRL(open.amount_cents)} aprovado: o Pix está sendo enviado.`}{" "}
                A chave Pix só pode ser trocada depois que este saque terminar.
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
                  <PixKeyForm hasKey sandbox={sandbox} />
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
    </>
  );
}
