import Link from "next/link";
import { Crown, Lock } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import {
  formatBRL,
  formatMediaCount,
  PACKAGE_COVER_BUCKET,
  publicImageUrl,
} from "@/features/content/constants";
import { checkoutHref } from "@/features/commerce/constants";
import type { PublicPackage } from "./queries";

/** Card de pacote na vitrine (canvas Perfil): capa ou prévia protegida, título, itens e preço. */
export function PackageCard({
  pkg,
  owned = false,
  isOwner = false,
}: {
  pkg: PublicPackage;
  owned?: boolean;
  isOwner?: boolean;
}) {
  const cover = publicImageUrl(PACKAGE_COVER_BUCKET, pkg.coverPath);
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-3.5">
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-border bg-[radial-gradient(80%_80%_at_50%_35%,var(--brand-deep),var(--surface)_85%)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- capa pública escolhida pelo criador
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex flex-col items-center gap-2 type-caption text-ink-muted">
            <Lock className="size-6 text-accent" aria-hidden strokeWidth={1.6} />
            Prévia protegida
          </span>
        )}
        {pkg.audience === "subscribers" && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-pill bg-surface/90 px-2.5 py-0.5 type-caption font-semibold text-accent-text">
            <Crown className="size-3.5" aria-hidden />
            Assinantes
          </span>
        )}
      </div>
      <div>
        <h3 className="type-body-strong text-ink">{pkg.title}</h3>
        <p className="type-caption text-ink-muted">
          {formatMediaCount(pkg.photoCount, pkg.videoCount)}
        </p>
        {pkg.description && (
          <p className="mt-1 line-clamp-2 type-caption text-ink-muted">{pkg.description}</p>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="text-lg font-extrabold text-accent-text">{formatBRL(pkg.priceCents)}</span>
        {owned || isOwner ? (
          <Link
            href={isOwner ? `/estudio/pacotes/${pkg.id}` : `/biblioteca/pacote/${pkg.versionId}`}
            className={buttonClasses("secondary", "sm")}
          >
            {isOwner ? "Editar" : "Abrir"}
          </Link>
        ) : (
          <Link href={checkoutHref("pacote", pkg.id)} className={buttonClasses("primary", "sm")}>
            Comprar pacote
          </Link>
        )}
      </div>
    </article>
  );
}
