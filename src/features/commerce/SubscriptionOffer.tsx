import Link from "next/link";
import { Crown } from "lucide-react";
import { Avatar } from "@/components/domain/Avatar";
import { buttonClasses } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatBRL } from "@/features/content/constants";
import { checkoutHref, PERIOD_LABEL, percentOff } from "./constants";
import type { SubscriptionOption } from "./queries";

/**
 * Caixa de assinatura no perfil: promoção em destaque (recado do criador em balão, preço
 * riscado real e vagas restantes) e a lista de planos por período.
 */
export function SubscriptionOffer({
  creatorId,
  name,
  avatarPath,
  options,
  subscription,
}: {
  creatorId: string;
  name: string;
  avatarPath: string | null;
  options: SubscriptionOption[];
  subscription: { status: string; currentPeriodEnd: string } | null;
}) {
  if (options.length === 0) return null;
  const monthly = options.find((o) => o.months === 1) ?? options[0]!;
  const promoOpt = options.find((o) => o.promo);
  const promo = promoOpt?.promo ?? null;
  const href = (months: number, usePromo: boolean) =>
    `${checkoutHref("assinatura", creatorId)}&plano=${months}:${usePromo ? 1 : 0}`;
  const per = (m: number) => (m === 1 ? "mês" : `${m} meses`);

  return (
    <section
      aria-label="Assinatura"
      className="mt-6 flex flex-col gap-4 rounded-lg border border-accent bg-surface-alt p-5 shadow-glow-sm md:p-6"
    >
      <div className="flex items-center gap-3">
        <Crown className="size-7 shrink-0 text-accent-text" aria-hidden />
        <div className="flex-1">
          <p className="type-tagline text-ink-muted">Assinatura</p>
          <p className="text-2xl font-extrabold text-accent-text">
            {formatBRL(monthly.regularCents)}
            <span className="type-label font-semibold text-ink-muted">/mês</span>
          </p>
        </div>
        {subscription && (
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex h-9 items-center rounded-pill border border-success px-4 type-label font-semibold text-success">
              {subscription.status === "active" ? "Você assina" : "Assinatura cancelada"}
            </span>
            <span className="type-caption text-ink-muted">
              {subscription.status === "active" ? "Renova em" : "Acesso até"}{" "}
              {formatDate(subscription.currentPeriodEnd)}
            </span>
          </div>
        )}
      </div>

      {!subscription && promoOpt && promo && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          {promo.message && (
            <div className="flex items-end gap-2">
              <Avatar path={avatarPath} name={name} size="sm" />
              <p className="max-w-md rounded-lg rounded-bl-none bg-accent/15 px-3 py-2 type-body text-ink">
                {promo.message}
              </p>
            </div>
          )}
          <Link href={href(promoOpt.months, true)} className={buttonClasses("primary", "lg", true)}>
            Assinar por {formatBRL(promo.priceCents)}{" "}
            <span className="type-caption font-semibold">({percentOff(promo.discountBps)})</span>
          </Link>
          <p className="flex flex-wrap justify-between gap-2 type-caption text-ink-muted">
            <span>
              Preço normal <s>{formatBRL(promoOpt.regularCents)}</s> · desconto no 1º{" "}
              {per(promoOpt.months)}
              {promoOpt.months > 1 && ` (${PERIOD_LABEL[promoOpt.months]?.toLowerCase()})`}
            </span>
            <span>
              {promo.left != null && `${promo.left} vaga(s) · `}até {formatDate(promo.endsAt)}
            </span>
          </p>
        </div>
      )}

      {!subscription && (
        <ul className="flex flex-col gap-2" aria-label="Planos de assinatura">
          {options.map((o) => (
            <li key={o.months}>
              <Link
                href={href(o.months, false)}
                className="flex items-center justify-between gap-3 rounded-pill bg-accent px-5 py-3 type-label font-semibold text-white transition hover:opacity-90"
              >
                <span>
                  {PERIOD_LABEL[o.months]}
                  {o.planDiscountBps > 0 && ` (${percentOff(o.planDiscountBps)})`}
                </span>
                <span>{formatBRL(o.regularCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="type-caption text-ink-muted">
        Publicações exclusivas para assinantes. Renova no fim de cada período pelo preço normal;
        cancele quando quiser e o acesso vale até o fim do período pago. PPV e pacotes são vendidos
        à parte.
      </p>
    </section>
  );
}
