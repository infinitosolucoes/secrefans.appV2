import type { Metadata } from "next";
import { Badge, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDate, formatDateTime } from "@/lib/format";
import { hasPermission } from "@/server/authorization/roles";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { formatPercent } from "@/features/commerce/constants";
import {
  DecideCommissionForm,
  ProposeCommissionForm,
} from "@/features/super-admin/CommissionForms";

export const metadata: Metadata = { title: "Comissões · Admin" };

export default async function Page() {
  const user = await requireStaffMfa("finance.read");
  const canManage = hasPermission(user.roles, "commission.manage");
  const supabase = await createServerSupabase();
  const [{ data: rules }, { data: paid }] = await Promise.all([
    supabase
      .from("commission_rules")
      .select(
        "id, version, rate_bps, applies_to_tips, effective_from, status, reason, proposed_by, decided_at, decision_reason, created_at",
      )
      .order("version", { ascending: false }),
    supabase
      .from("orders")
      .select("gross_cents, commission_cents, creator_net_cents, status")
      .in("status", ["paid", "refunded", "chargeback"])
      .limit(10000),
  ]);

  const now = new Date();
  const approved = (rules ?? []).filter((r) => r.status === "approved");
  const current = approved
    .filter((r) => new Date(r.effective_from) <= now)
    .sort((a, b) => +new Date(b.effective_from) - +new Date(a.effective_from))[0];
  const pending = (rules ?? []).filter((r) => r.status === "pending_approval");
  const ok = (paid ?? []).filter((o) => o.status === "paid");
  const reversed = (paid ?? []).filter((o) => o.status !== "paid");
  const sum = (list: typeof ok, k: "gross_cents" | "commission_cents" | "creator_net_cents") =>
    list.reduce((t, o) => t + o[k], 0);
  const minDate = new Date(Date.now() - 3 * 3600_000 + 5 * 60_000).toISOString().slice(0, 16);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Comissões"
        description="Regra de comissão por venda, versionada e sem retroatividade. Valores do ambiente atual."
      />

      <dl className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "GMV (vendas confirmadas)",
            value: formatBRL(sum(ok, "gross_cents")),
            hint: `${ok.length} pedidos`,
          },
          {
            label: "Comissões Secretfans",
            value: formatBRL(sum(ok, "commission_cents")),
            hint: current
              ? `Vigente: ${formatPercent(current.rate_bps)} · v${current.version}`
              : "Sem regra vigente",
          },
          {
            label: "Repasses a criadores",
            value: formatBRL(sum(ok, "creator_net_cents")),
            hint: "Antes de taxas do provedor (S5)",
          },
          {
            label: "Estornos e contestações",
            value: formatBRL(sum(reversed, "gross_cents")),
            hint: `${reversed.length} ocorrências`,
          },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface-alt p-5">
            <dt className="type-caption text-ink-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-ink">{s.value}</dd>
            <dd className="type-caption text-ink-muted">{s.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-accent bg-surface-alt p-5 shadow-glow-sm md:p-6">
          <p className="type-tagline text-ink-muted">Regra vigente · sem retroatividade</p>
          {current ? (
            <>
              <p className="mt-2 text-4xl font-black text-accent-text">
                {formatPercent(current.rate_bps)}
              </p>
              <p className="type-label text-ink">
                Taxa padrão · v{current.version} · vigente desde{" "}
                {formatDate(current.effective_from)}
              </p>
              <p className="mt-1 type-caption text-ink-muted">
                Assinaturas, PPV e pacotes · mimos{" "}
                {current.applies_to_tips ? "incluídas" : "isentas"}
              </p>
            </>
          ) : (
            <p className="mt-2 type-body text-ink-muted">Nenhuma regra vigente.</p>
          )}
        </section>

        {canManage && (
          <section className="rounded-lg border border-border bg-surface-alt p-5 md:p-6">
            <h2 className="mb-4 type-feature-title text-ink">Agendar nova versão</h2>
            <ProposeCommissionForm minDate={minDate} />
          </section>
        )}
      </div>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 type-heading text-ink">Aguardando segunda aprovação</h2>
          <ul className="flex flex-col gap-4">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border border-warning bg-surface-alt p-5"
              >
                <p className="type-label text-ink">
                  v{r.version} · <strong>{formatPercent(r.rate_bps)}</strong> · a partir de{" "}
                  {formatDateTime(r.effective_from)} · mimos{" "}
                  {r.applies_to_tips ? "incluídas" : "isentas"}
                </p>
                <p className="type-caption text-ink-muted">Justificativa: {r.reason}</p>
                {canManage && (
                  <DecideCommissionForm ruleId={r.id} isProposer={r.proposed_by === user.id} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-4 type-heading text-ink">Histórico de versões</h2>
        <Table caption="Versões da regra de comissão" minWidth={720}>
          <THead columns={["Versão", "Taxa", "Vigência", "Situação", "Motivo"]} />
          <tbody>
            {(rules ?? []).map((r) => {
              const future = new Date(r.effective_from) > now;
              const label =
                r.status === "pending_approval"
                  ? { t: "Aguardando 2ª aprovação", tone: "warning" as const }
                  : r.status === "rejected"
                    ? { t: "Rejeitada", tone: "danger" as const }
                    : r.id === current?.id
                      ? { t: "Vigente", tone: "success" as const }
                      : future
                        ? { t: "Agendada", tone: "warning" as const }
                        : { t: "Encerrada", tone: "neutral" as const };
              return (
                <Tr key={r.id}>
                  <Td>v{r.version}</Td>
                  <Td>{formatPercent(r.rate_bps)}</Td>
                  <Td nowrap>{formatDateTime(r.effective_from)}</Td>
                  <Td>
                    <Badge tone={label.tone}>{label.t}</Badge>
                  </Td>
                  <Td muted>
                    {r.decision_reason ? `${r.reason} · ${r.decision_reason}` : r.reason}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </>
  );
}
