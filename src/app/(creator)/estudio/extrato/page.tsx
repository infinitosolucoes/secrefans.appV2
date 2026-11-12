import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, buttonClasses, EmptyState, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { formatBRL } from "@/features/content/constants";
import { ORDER_STATUS } from "@/features/commerce/constants";
import { StudioTabs } from "@/features/commerce/StudioTabs";
import { currentMonth, getStatement, monthRange, summarize } from "@/features/commerce/statement";

export const metadata: Metadata = { title: "Extrato · Studio" };

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireRole(["creator"], "/estudio/extrato");
  const { mes } = await searchParams;
  const month = mes && monthRange(mes) ? mes : currentMonth();
  const rows = await getStatement(user.id, month);
  const s = summarize(rows);
  const isCurrent = month === currentMonth();

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Studio"
        title="Extrato"
        description="Cada venda com bruto, comissão, taxa e quanto chegou para você."
      />
      <StudioTabs active="/estudio/extrato" />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/estudio/extrato?mes=${shiftMonth(month, -1)}`}
          className={buttonClasses("ghost", "sm")}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <p className="min-w-40 text-center type-body-strong text-ink">{monthLabel(month)}</p>
        {!isCurrent && (
          <Link
            href={`/estudio/extrato?mes=${shiftMonth(month, 1)}`}
            className={buttonClasses("ghost", "sm")}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
        <a
          href={`/estudio/extrato/csv?mes=${month}`}
          className={`${buttonClasses("secondary", "sm")} ml-auto`}
          download
        >
          <Download className="size-4" aria-hidden />
          Exportar CSV
        </a>
      </div>

      <dl className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Vendas no mês (bruto)", value: s.gross, hint: `${s.count} venda(s)` },
          {
            label: "Comissão + taxas",
            value: s.commission + s.fee,
            hint: `Comissão ${formatBRL(s.commission)} · taxa ${formatBRL(s.fee)}`,
          },
          { label: "Recebido direto (split)", value: s.split, hint: "Já na sua conta Asaas" },
          { label: "A receber da Secretfans", value: s.pending, hint: "Vendas sem split" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-surface-alt p-4">
            <dt className="type-caption text-ink-muted">{c.label}</dt>
            <dd className="mt-1 text-xl font-extrabold text-ink">{formatBRL(c.value)}</dd>
            <dd className="type-caption text-ink-muted">{c.hint}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma venda neste mês" description="As vendas pagas aparecem aqui." />
      ) : (
        <Table caption={`Extrato de ${monthLabel(month)}`} minWidth={900}>
          <THead
            columns={["Data", "Venda", "Bruto", "Comissão", "Taxa", "Líquido", "Split", "Status"]}
          />
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{formatDateTime(r.date)}</Td>
                <Td>
                  <span className="type-label text-ink">{r.kindLabel}</span>
                  <span className="block max-w-64 truncate type-caption text-ink-muted">
                    {r.description} · {r.method} · v{r.ruleVersion}
                  </span>
                </Td>
                <Td>{formatBRL(r.grossCents)}</Td>
                <Td>− {formatBRL(r.commissionCents)}</Td>
                <Td>− {formatBRL(r.feeCents)}</Td>
                <Td>
                  <strong className="text-ink">{formatBRL(r.netCents)}</strong>
                </Td>
                <Td>{r.splitCents ? formatBRL(r.splitCents) : "—"}</Td>
                <Td>
                  <Badge tone={ORDER_STATUS[r.status].tone}>{r.statusLabel}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </AppShell>
  );
}
