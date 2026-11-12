import type { Metadata } from "next";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { hasPermission } from "@/server/authorization/roles";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { activeProviderName } from "@/server/providers/payments";
import { formatBRL } from "@/features/content/constants";
import { PaymentFeeForm } from "@/features/super-admin/CommissionForms";

export const metadata: Metadata = { title: "Financeiro · Admin" };

export default async function Page() {
  const user = await requireStaffMfa("finance.read");
  const canManage = hasPermission(user.roles, "commission.manage");
  const supabase = await createServerSupabase();
  const staleBefore = new Date(Date.now() - 3600_000).toISOString();
  const [{ data: accounts }, { data: lines }, { data: events }, { data: fees }, { data: stale }] =
    await Promise.all([
      supabase.from("ledger_accounts").select("code, kind"),
      supabase.from("ledger_lines").select("account_code, debit_cents, credit_cents").limit(50000),
      supabase
        .from("payment_events")
        .select("id, provider, event_id, type, received_at, order_id")
        .order("received_at", { ascending: false })
        .limit(20),
      supabase
        .from("payment_fee_settings")
        .select("provider, method, fixed_cents, bps, effective_from, created_at")
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, description, gross_cents, provider, created_at")
        .eq("status", "pending")
        .not("provider_ref", "is", null)
        .lt("created_at", staleBefore)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const kindOf = new Map((accounts ?? []).map((a) => [a.code, a.kind]));
  const totals = { provider_clearing: 0, platform_revenue: 0, creator_payable: 0, fee_variance: 0 };
  let debits = 0;
  let credits = 0;
  for (const l of lines ?? []) {
    const kind = kindOf.get(l.account_code) as keyof typeof totals | undefined;
    debits += l.debit_cents;
    credits += l.credit_cents;
    if (!kind) continue;
    // Ativo (clearing) cresce no débito; receita/obrigações crescem no crédito.
    totals[kind] +=
      kind === "provider_clearing" ? l.debit_cents - l.credit_cents : l.credit_cents - l.debit_cents;
  }
  const currentFee = (method: "pix" | "card") =>
    (fees ?? []).find(
      (f) => f.provider === "asaas" && f.method === method && new Date(f.effective_from) <= new Date(),
    );

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Ledger e conciliação"
        description={`Partidas dobradas de todas as vendas. Provedor ativo: ${activeProviderName()}.`}
      />

      <dl className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Recebido do provedor (líquido)", value: totals.provider_clearing },
          { label: "Receita Secretfans (comissões)", value: totals.platform_revenue },
          { label: "A repassar / repassado a criadores", value: totals.creator_payable },
          { label: "Variação de taxa (plataforma)", value: totals.fee_variance },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-surface-alt p-4">
            <dt className="type-caption text-ink-muted">{c.label}</dt>
            <dd className="mt-1 text-xl font-extrabold text-ink">{formatBRL(c.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-8 type-caption text-ink-muted">
        Conferência: débitos {formatBRL(debits)} · créditos {formatBRL(credits)}{" "}
        <Badge tone={debits === credits ? "success" : "danger"}>
          {debits === credits ? "balanceado" : "DIVERGENTE"}
        </Badge>
      </p>

      <section className="mb-10">
        <h2 className="mb-3 type-body-strong text-ink">Pendentes há mais de 1 hora</h2>
        {stale?.length ? (
          <Table caption="Pedidos pendentes há mais de 1 hora">
            <THead columns={["Pedido", "Valor", "Provedor", "Criado em"]} />
            <tbody>
              {stale.map((o) => (
                <Tr key={o.id}>
                  <Td>{o.description}</Td>
                  <Td>{formatBRL(o.gross_cents)}</Td>
                  <Td>{o.provider}</Td>
                  <Td>{formatDateTime(o.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nada pendente" description="A conciliação diária não encontrou pendências." />
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 type-body-strong text-ink">Últimos eventos de pagamento</h2>
        {events?.length ? (
          <Table caption="Últimos eventos de pagamento">
            <THead columns={["Recebido em", "Provedor", "Evento", "Status aplicado"]} />
            <tbody>
              {events.map((e) => (
                <Tr key={e.id}>
                  <Td>{formatDateTime(e.received_at)}</Td>
                  <Td>{e.provider}</Td>
                  <Td>
                    <code className="type-caption">{e.event_id}</code>
                  </Td>
                  <Td>{e.type}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Sem eventos ainda" description="Os webhooks do provedor aparecem aqui." />
        )}
      </section>

      <section>
        <h2 className="mb-1 type-body-strong text-ink">Taxa estimada do meio de pagamento</h2>
        <p className="mb-4 type-caption text-ink-muted">
          Paga pelo criador e descontada do líquido de cada venda. A diferença para a taxa real do
          Asaas fica na conta &quot;variação de taxa&quot; da plataforma.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          {(["pix", "card"] as const).map((m) => {
            const f = currentFee(m);
            return (
              <div key={m} className="rounded-lg border border-border bg-surface-alt p-5">
                <p className="mb-3 type-label font-semibold text-ink">
                  {m === "pix" ? "Pix" : "Cartão de crédito"}:{" "}
                  {f ? `${formatBRL(f.fixed_cents)} + ${(f.bps / 100).toLocaleString("pt-BR")}%` : "sem taxa"}
                </p>
                {canManage && (
                  <PaymentFeeForm method={m} fixedCents={f?.fixed_cents ?? 0} bps={f?.bps ?? 0} />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
