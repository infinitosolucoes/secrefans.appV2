import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, buttonClasses, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { acceptCommissionAction } from "@/features/commerce/actions";
import { formatPercent } from "@/features/commerce/constants";
import { getCurrentCommissionRule } from "@/features/commerce/queries";
import { StudioTabs } from "@/features/commerce/StudioTabs";

export const metadata: Metadata = { title: "Comissão · Studio" };

export default async function Page() {
  const user = await requireRole(["creator"], "/estudio/comissao");
  const supabase = await createServerSupabase();
  const [rule, { data: history }, { data: acceptances }] = await Promise.all([
    getCurrentCommissionRule(),
    supabase
      .from("commission_rules")
      .select("id, version, rate_bps, applies_to_tips, effective_from")
      .eq("status", "approved")
      .order("effective_from", { ascending: false }),
    supabase
      .from("creator_commission_acceptances")
      .select("rule_id, accepted_at")
      .eq("creator_id", user.id),
  ]);
  const acceptedAt = new Map((acceptances ?? []).map((a) => [a.rule_id, a.accepted_at]));
  const now = new Date();
  const example = 10000;
  const commission = rule ? Math.round((example * rule.rateBps) / 10000) : 0;

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Studio"
        title="Sua regra de comissão"
        description="Na Secretfans você não paga mensalidade. Cobramos só uma comissão sobre cada venda."
      />
      <StudioTabs active="/estudio/comissao" />

      {rule ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-wrap items-center gap-6 rounded-lg border border-accent bg-surface-alt p-6 shadow-glow-sm">
            <div className="grid size-28 shrink-0 place-items-center rounded-full border-2 border-accent text-center">
              <span>
                <span className="block text-3xl font-black text-accent-text">
                  {formatPercent(rule.rateBps)}
                </span>
                <span className="type-caption tracking-[0.2em] text-ink-muted">POR VENDA</span>
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-tagline text-ink-muted">Regra vigente · versão {rule.version}</p>
              <h2 className="mt-1 type-feature-title text-ink">Comissão padrão Secretfans</h2>
              <p className="mt-1 type-body text-ink-muted">
                Vigente desde {formatDate(rule.effectiveFrom)}. Mudanças de taxa valem só para
                vendas novas, a partir da data informada. Vendas já feitas mantêm a regra original.
              </p>
              {acceptedAt.has(rule.id) ? (
                <p className="mt-3 inline-flex items-center gap-2 type-label text-success">
                  <CheckCircle2 className="size-4" aria-hidden />
                  Você deu ciência em {formatDateTime(acceptedAt.get(rule.id))}
                </p>
              ) : (
                <form action={acceptCommissionAction} className="mt-4">
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button type="submit" className={buttonClasses("primary", "md")}>
                    Li e concordo com esta regra
                  </button>
                  <p className="mt-2 type-caption text-ink-muted">
                    Necessário para começar a vender assinaturas, PPV, pacotes e receber gorjetas.
                  </p>
                </form>
              )}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-surface-alt p-5 md:p-6">
              <h2 className="mb-4 type-feature-title text-ink">Onde a comissão incide</h2>
              <ul className="flex flex-col divide-y divide-border type-label">
                {[
                  ["Assinaturas de fãs", "Incide"],
                  ["Vendas PPV", "Incide"],
                  ["Pacotes de fotos e vídeos", "Incide"],
                  ["Gorjetas", rule.appliesToTips ? "Incide" : "Não incide"],
                ].map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-4 py-2.5">
                    <span className="text-ink">{k}</span>
                    <span className="text-ink-muted">{v}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-lg border border-border bg-surface-alt p-5 md:p-6">
              <h2 className="mb-4 type-feature-title text-ink">
                Exemplo de uma venda de {formatBRL(example)}
              </h2>
              <dl className="flex flex-col gap-2.5 type-label">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink">Você recebe</dt>
                  <dd className="text-xl font-extrabold text-accent-text">
                    {formatBRL(example - commission)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">
                    Comissão Secretfans ({formatPercent(rule.rateBps)})
                  </dt>
                  <dd className="text-ink">{formatBRL(commission)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Taxas do provedor de pagamento</dt>
                  <dd className="text-ink-muted">definidas com o provedor (S5)</dd>
                </div>
              </dl>
              <p className="mt-3 type-caption text-ink-muted">
                A comissão é calculada sobre o valor bruto pago pelo fã.
              </p>
            </section>
          </div>

          <section>
            <h2 className="mb-4 type-heading text-ink">Histórico de versões</h2>
            <Table caption="Versões da regra de comissão" minWidth={560}>
              <THead columns={["Versão", "Taxa", "Vigência", "Situação"]} />
              <tbody>
                {(history ?? []).map((h) => {
                  const future = new Date(h.effective_from) > now;
                  return (
                    <Tr key={h.id}>
                      <Td>v{h.version}</Td>
                      <Td>{formatPercent(h.rate_bps)}</Td>
                      <Td nowrap>
                        {future ? "a partir de " : "desde "}
                        {formatDate(h.effective_from)}
                      </Td>
                      <Td>
                        <Badge tone={h.id === rule.id ? "success" : future ? "warning" : "neutral"}>
                          {h.id === rule.id ? "Vigente" : future ? "Agendada" : "Encerrada"}
                        </Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </section>
        </div>
      ) : (
        <Alert tone="warning">Nenhuma regra de comissão vigente no momento.</Alert>
      )}
    </AppShell>
  );
}
