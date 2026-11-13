import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, buttonClasses, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { formatBRL, UUID_RE } from "@/features/content/constants";
import { CheckoutForm } from "@/features/commerce/CheckoutForm";
import { CHECKOUT_KINDS, type CheckoutSlug } from "@/features/commerce/constants";
import {
  getCheckoutItem,
  getSubscriptionOptions,
  hasPaymentCustomer,
  type SubscriptionOption,
} from "@/features/commerce/queries";
import type { PlanChoice } from "@/features/commerce/CheckoutForm";
import { PERIOD_LABEL, percentOff } from "@/features/commerce/constants";
import { serverEnv } from "@/lib/env.server";
import { activeProviderName } from "@/server/providers/payments";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; id?: string; plano?: string }>;
}) {
  const { tipo = "", id = "", plano } = await searchParams;
  const user = await requireUser(
    `/checkout?tipo=${encodeURIComponent(tipo)}&id=${encodeURIComponent(id)}`,
  );
  if (!(tipo in CHECKOUT_KINDS) || !UUID_RE.test(id)) notFound();
  const slug = tipo as CheckoutSlug;
  const item = await getCheckoutItem(slug, id, user.id);
  if (!item) notFound();
  const provider = activeProviderName();
  const needsCpf = provider === "asaas" && !(await hasPaymentCustomer(user.id, provider));
  const plans =
    item.kind === "subscription" ? planChoices(await getSubscriptionOptions(id)) : undefined;

  return (
    <AppShell user={user}>
      <Link href={`/${item.creatorHandle}`} className="type-label text-accent-text hover:underline">
        ← Voltar ao perfil de {item.creatorName}
      </Link>
      <PageHeader
        title="Finalizar compra"
        description="Pagamento processado com segurança pelo provedor parceiro."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {item.blocked ? (
            <Alert tone="info" title="Compra indisponível">
              {item.blocked}{" "}
              <Link href="/biblioteca" className="text-accent-text underline">
                Ver minha biblioteca
              </Link>
            </Alert>
          ) : (
            <section className="rounded-lg border border-border bg-surface-alt p-5 md:p-6">
              <CheckoutForm
                slug={slug}
                id={id}
                priceCents={item.priceCents}
                needsCpf={needsCpf}
                plans={plans}
                defaultPlan={plano}
              />
            </section>
          )}
          {provider === "simulado" ? (
            <p className="mt-4 flex gap-2 rounded-md border border-warning bg-surface-alt p-4 type-caption text-ink-muted">
              <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              Ambiente de testes: os pagamentos desta etapa são simulados. Nenhum valor real é
              cobrado.
            </p>
          ) : (
            serverEnv().ASAAS_ENV === "sandbox" && (
              <p className="mt-4 flex gap-2 rounded-md border border-warning bg-surface-alt p-4 type-caption text-ink-muted">
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                Ambiente de homologação: cobranças no sandbox do Asaas. Nenhum valor real é cobrado.
              </p>
            )
          )}
        </div>
        <aside className="w-full rounded-lg border border-accent bg-surface-alt p-5 shadow-glow-sm md:p-6 lg:w-96">
          <p className="type-tagline text-ink-muted">Resumo do pedido</p>
          <h2 className="mt-3 type-body-strong text-ink">{item.title}</h2>
          <p className="type-caption text-ink-muted">
            {item.detail} · por {item.creatorName}
          </p>
          <hr className="my-4 border-border" />
          <dl className="flex flex-col gap-2 type-label">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Valor</dt>
              <dd className="text-ink">
                {item.priceCents ? formatBRL(item.priceCents) : "escolha ao lado"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Taxas</dt>
              <dd className="text-ink">Incluídas</dd>
            </div>
          </dl>
          <hr className="my-4 border-border" />
          <p className="flex gap-2 type-caption text-ink-muted">
            <Lock className="size-4 shrink-0" aria-hidden />
            Preço congelado neste pedido.
            {item.kind === "subscription" &&
              " A assinatura renova no fim de cada período pelo preço normal; cancele quando quiser."}
          </p>
          {item.blocked && (
            <Link
              href={`/${item.creatorHandle}`}
              className={`${buttonClasses("outline", "sm", true)} mt-4`}
            >
              Voltar ao perfil
            </Link>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

/** Opções do seletor: cada plano e, se houver, a versão com promoção (só no 1º período). */
function planChoices(options: SubscriptionOption[]): PlanChoice[] {
  const per = (m: number) => (m === 1 ? "mês" : `${m} meses`);
  return options.flatMap((o) => {
    const regular: PlanChoice = {
      value: `${o.months}:0`,
      label: PERIOD_LABEL[o.months] ?? `${o.months} meses`,
      priceCents: o.regularCents,
      note:
        o.months === 1
          ? "Renova todo mês"
          : `Equivale a ${formatBRL(Math.round(o.regularCents / o.months))}/mês · renova a cada ${per(o.months)}`,
      badge: o.planDiscountBps > 0 ? percentOff(o.planDiscountBps) : undefined,
    };
    if (!o.promo) return [regular];
    const promo: PlanChoice = {
      value: `${o.months}:1`,
      label: `${PERIOD_LABEL[o.months] ?? `${o.months} meses`} em promoção`,
      priceCents: o.promo.priceCents,
      note: `1º ${per(o.months)} por ${formatBRL(o.promo.priceCents)}; depois ${formatBRL(o.regularCents)}${
        o.promo.left != null ? ` · ${o.promo.left} vaga(s)` : ""
      }`,
      badge: percentOff(o.promo.discountBps),
    };
    return [promo, regular];
  });
}
