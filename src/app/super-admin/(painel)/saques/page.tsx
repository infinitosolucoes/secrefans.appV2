import type { Metadata } from "next";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { PIX_KEY_LABEL, type PixKeyTypeName } from "@/lib/pix";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { WITHDRAWAL_STATUS } from "@/features/commerce/constants";
import { WithdrawalDecisionForm } from "@/features/commerce/WithdrawalForms";

export const metadata: Metadata = { title: "Saques · Admin" };

export default async function Page() {
  await requireStaffMfa("payout.manage");
  const supabase = await createServerSupabase();
  const { data: rows } = await supabase
    .from("withdrawals")
    .select(
      "id, creator_id, amount_cents, fee_cents, status, pix_key_type, pix_key_value, provider_transfer_id, requested_at, decided_at, paid_at, decision_reason, failure_reason",
    )
    .order("requested_at", { ascending: false })
    .limit(100);
  const list = rows ?? [];
  const creatorIds = [...new Set(list.map((w) => w.creator_id))];
  const [{ data: profiles }, { data: verifications }, { data: keys }] = await Promise.all([
    supabase.from("profiles").select("id, handle, display_name").in("id", creatorIds),
    supabase
      .from("creator_verifications")
      .select("user_id, legal_name")
      .eq("status", "approved")
      .in("user_id", creatorIds),
    supabase.from("creator_pix_keys").select("creator_id, updated_at").in("creator_id", creatorIds),
  ]);
  const profileOf = new Map((profiles ?? []).map((p) => [p.id, p]));
  const legalOf = new Map((verifications ?? []).map((v) => [v.user_id, v.legal_name]));
  const keyChangedOf = new Map((keys ?? []).map((k) => [k.creator_id, k.updated_at]));
  const summaries = new Map(
    await Promise.all(
      [...new Set(list.filter((w) => w.status === "requested").map((w) => w.creator_id))].map(
        async (id) => {
          const { data } = await supabase
            .rpc("creator_payout_summary", { p_creator: id })
            .maybeSingle();
          return [id, data] as const;
        },
      ),
    ),
  );
  const pending = list.filter((w) => w.status === "requested");
  const others = list.filter((w) => w.status !== "requested");
  const stuck = list.filter(
    (w) =>
      w.status === "processing" &&
      !w.provider_transfer_id &&
      Date.now() - new Date(w.decided_at ?? w.requested_at).getTime() > 10 * 60_000,
  );

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Saques de criadores"
        description="Confira o titular da chave Pix antes de aprovar. Ao aprovar, o Pix sai na hora pela conta Asaas da plataforma."
      />

      {stuck.length > 0 && (
        <div className="mb-6">
          <Alert tone="warning">
            {stuck.length} saque(s) aprovado(s) sem confirmação de envio do provedor. Confira no
            painel do Asaas antes de qualquer ação (para não pagar em dobro).
          </Alert>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 type-body-strong text-ink">Aguardando aprovação</h2>
        {pending.length ? (
          <div className="flex flex-col gap-4">
            {pending.map((w) => {
              const p = profileOf.get(w.creator_id);
              const s = summaries.get(w.creator_id);
              const keyChanged = keyChangedOf.get(w.creator_id);
              const recentKey =
                keyChanged && Date.now() - new Date(keyChanged).getTime() < 48 * 3600_000;
              return (
                <article
                  key={w.id}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="type-body-strong text-ink">
                      {formatBRL(w.amount_cents)} · {p?.display_name ?? "Criador"} (@
                      {p?.handle ?? "?"})
                    </p>
                    <span className="type-caption text-ink-muted">
                      pedido em {formatDateTime(w.requested_at)}
                    </span>
                  </div>
                  <dl className="grid gap-2 type-caption sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-muted">Titular verificado</dt>
                      <dd className="text-ink">{legalOf.get(w.creator_id) ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">
                        Chave Pix ({PIX_KEY_LABEL[w.pix_key_type as PixKeyTypeName]})
                      </dt>
                      <dd className="break-all text-ink">{w.pix_key_value}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Saldo do criador</dt>
                      <dd className="text-ink">
                        {s
                          ? `${formatBRL(Number(s.balance_cents))} · em liberação ${formatBRL(Number(s.held_cents))}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Chave cadastrada em</dt>
                      <dd className="text-ink">
                        {keyChanged ? formatDateTime(keyChanged) : "—"}{" "}
                        {recentKey && <Badge tone="warning">trocada há menos de 48h</Badge>}
                      </dd>
                    </div>
                  </dl>
                  <WithdrawalDecisionForm id={w.id} amount={w.amount_cents} />
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nenhum saque pendente" description="Os pedidos aparecem aqui." />
        )}
      </section>

      <section>
        <h2 className="mb-3 type-body-strong text-ink">Histórico</h2>
        {others.length ? (
          <Table caption="Histórico de saques">
            <THead
              columns={["Pedido em", "Criador", "Valor", "Tarifa", "Situação", "Observação"]}
            />
            <tbody>
              {others.map((w) => {
                const st = WITHDRAWAL_STATUS[w.status];
                return (
                  <Tr key={w.id}>
                    <Td>{formatDateTime(w.requested_at)}</Td>
                    <Td>@{profileOf.get(w.creator_id)?.handle ?? "?"}</Td>
                    <Td>{formatBRL(w.amount_cents)}</Td>
                    <Td>{formatBRL(w.fee_cents)}</Td>
                    <Td>
                      <Badge tone={st?.tone ?? "neutral"}>{st?.label ?? w.status}</Badge>
                    </Td>
                    <Td>{w.failure_reason ?? w.decision_reason ?? ""}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Sem histórico" description="Saques decididos aparecem aqui." />
        )}
      </section>
    </>
  );
}
