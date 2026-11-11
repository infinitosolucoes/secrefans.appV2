import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import {
  formatPercent,
  ORDER_KIND_LABEL,
  ORDER_STATUS,
  type OrderKind,
  type OrderStatus,
} from "@/features/commerce/constants";
import { StudioTabs } from "@/features/commerce/StudioTabs";
import { SubscriptionPriceForm } from "@/features/commerce/SubscriptionPriceForm";

export const metadata: Metadata = { title: "Vendas · Studio" };

export default async function Page() {
  const user = await requireRole(["creator"], "/estudio/vendas");
  const supabase = await createServerSupabase();
  const [{ data: profile }, { data: orders }, { data: subs }, { data: accepted }] =
    await Promise.all([
      supabase.from("profiles").select("subscription_price_cents").eq("id", user.id).single(),
      supabase
        .from("orders")
        .select(
          "id, kind, description, gross_cents, commission_bps, commission_cents, external_fees_cents, creator_net_cents, commission_rule_version, status, paid_at, created_at",
        )
        .eq("creator_id", user.id)
        .in("status", ["paid", "refunded", "chargeback"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("subscriptions").select("status, current_period_end").eq("creator_id", user.id),
      supabase
        .from("creator_commission_acceptances")
        .select("rule_id")
        .eq("creator_id", user.id)
        .limit(1),
    ]);

  const paid = (orders ?? []).filter((o) => o.status === "paid");
  const sum = (k: "gross_cents" | "commission_cents" | "creator_net_cents") =>
    paid.reduce((t, o) => t + o[k], 0);
  const activeSubs = (subs ?? []).filter(
    (s) => s.status !== "expired" && new Date(s.current_period_end) > new Date(),
  ).length;

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Studio"
        title="Vendas"
        description="Assinatura, vendas e valores de cada pedido."
      />
      <StudioTabs active="/estudio/vendas" />

      {(accepted ?? []).length === 0 && (
        <div className="mb-6">
          <Alert tone="warning" title="Vendas ainda bloqueadas">
            Dê ciência da regra de comissão vigente para começar a vender.{" "}
            <Link href="/estudio/comissao" className="text-accent-text underline">
              Ver regra de comissão
            </Link>
          </Alert>
        </div>
      )}

      <dl className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Receita bruta",
            value: formatBRL(sum("gross_cents")),
            hint: "Vendas confirmadas",
          },
          {
            label: "Comissão Secretfans",
            value: `− ${formatBRL(sum("commission_cents"))}`,
            hint: "Conforme a regra de cada venda",
          },
          {
            label: "Seu líquido",
            value: formatBRL(sum("creator_net_cents")),
            hint: "Antes de taxas do provedor (S5)",
          },
          {
            label: "Assinantes ativos",
            value: String(activeSubs),
            hint: "Inclui cancelados até o fim do período",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface-alt p-5">
            <dt className="type-caption text-ink-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-ink">{s.value}</dd>
            <dd className="type-caption text-ink-muted">{s.hint}</dd>
          </div>
        ))}
      </dl>

      <section
        className="mb-8 max-w-xl rounded-lg border border-border bg-surface-alt p-5 md:p-6"
        aria-labelledby="assinatura"
      >
        <h2 id="assinatura" className="mb-1 type-feature-title text-ink">
          Assinatura mensal
        </h2>
        <p className="mb-4 type-caption text-ink-muted">
          {profile?.subscription_price_cents
            ? `Ativa por ${formatBRL(profile.subscription_price_cents)}/mês.`
            : "Desativada: defina um preço para os fãs poderem assinar."}
        </p>
        <SubscriptionPriceForm priceCents={profile?.subscription_price_cents ?? null} />
      </section>

      <h2 className="mb-4 type-heading text-ink">Vendas recentes</h2>
      {(orders ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma venda ainda"
          description="As vendas confirmadas aparecem aqui com a comissão aplicada."
        />
      ) : (
        <Table caption="Vendas recentes" minWidth={900}>
          <THead
            columns={[
              "Data",
              "Venda",
              "Bruto",
              "Comissão",
              "Taxas externas",
              "Líquido",
              "Regra",
              "Status",
            ]}
          />
          <tbody>
            {(orders ?? []).map((o) => (
              <Tr key={o.id}>
                <Td nowrap>{formatDateTime(o.paid_at ?? o.created_at)}</Td>
                <Td>
                  <span className="block text-ink">{o.description}</span>
                  <span className="type-caption text-ink-muted">
                    {ORDER_KIND_LABEL[o.kind as OrderKind]}
                  </span>
                </Td>
                <Td nowrap>{formatBRL(o.gross_cents)}</Td>
                <Td nowrap>
                  − {formatBRL(o.commission_cents)}
                  <span className="block type-caption text-ink-muted">
                    {formatPercent(o.commission_bps)}
                  </span>
                </Td>
                <Td nowrap>− {formatBRL(o.external_fees_cents)}</Td>
                <Td nowrap>{formatBRL(o.creator_net_cents)}</Td>
                <Td nowrap>v{o.commission_rule_version}</Td>
                <Td>
                  <Badge tone={ORDER_STATUS[o.status as OrderStatus].tone}>
                    {ORDER_STATUS[o.status as OrderStatus].label}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </AppShell>
  );
}
