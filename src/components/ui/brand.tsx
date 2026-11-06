/**
 * Componentes de marca descritos no design system Secretfans (design/README.md,
 * seções "Site (home) e componentes" e "Componentes das peças").
 */
import Link from "next/link";
import { ArrowRight, BadgeCheck, Crown, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Busca em pílula da topbar: `surface-alt`, `radius-pill`. Envia para /explorar?q=. */
export function SearchPill({
  className,
  defaultValue,
}: {
  className?: string;
  defaultValue?: string;
}) {
  return (
    <form action="/explorar" role="search" className={cn("relative w-full max-w-md", className)}>
      <label htmlFor="busca-global" className="sr-only">
        Buscar criadores, categorias ou conteúdos
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted"
      />
      <input
        id="busca-global"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar criadores, categorias ou conteúdos…"
        className="h-10 w-full rounded-pill border border-transparent bg-surface-alt pr-4 pl-11 type-label text-ink placeholder:text-ink-muted hover:border-border focus:border-accent"
      />
    </form>
  );
}

/** Título em duas partes: primeira frase em `ink`, a "virada" em `accent-text` (ou degradê). */
export function TurnHeading({
  as: Tag = "h2",
  lead,
  turn,
  gradient = false,
  styleName = "heading",
  className,
}: {
  as?: "h1" | "h2" | "h3";
  lead: string;
  turn: string;
  gradient?: boolean;
  styleName?: "hero" | "hero-italic" | "heading" | "feature-title";
  className?: string;
}) {
  const styles = {
    hero: "type-hero-fluid",
    "hero-italic": "type-hero-italic-fluid",
    heading: "type-heading",
    "feature-title": "type-feature-title",
  } as const;
  return (
    <Tag className={cn(styles[styleName], "text-ink", className)}>
      {lead} <span className={gradient ? "gradient-text" : "text-accent-text"}>{turn}</span>
    </Tag>
  );
}

/** Rótulo de seção em `tagline` (caixa alta, tracking 0.4em). */
export function Tagline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("type-tagline text-accent-text", className)}>{children}</p>;
}

/** Frase manuscrita de apoio. No máximo uma por tela. */
export function ScriptAccent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("type-script-fluid -rotate-2 text-accent-text", className)}>{children}</p>
  );
}

/** CTA pílula das peças: degradê rosa, `glow-lg`, ícone + divisória + rótulo + seta. */
export function CtaPill({
  href,
  icon: Icon,
  label,
  emphasis,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  emphasis?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-4 rounded-pill py-3 pr-6 pl-5 gradient-cta text-on-accent shadow-glow-lg transition hover:brightness-110",
        className,
      )}
    >
      <Icon aria-hidden className="size-6 shrink-0" />
      <span aria-hidden className="h-8 w-px bg-on-accent/50" />
      <span className="flex flex-col leading-none">
        <span className="type-cta">{label}</span>
        {emphasis && <span className="type-cta italic">{emphasis}</span>}
      </span>
      <ArrowRight aria-hidden className="size-6 shrink-0 transition group-hover:translate-x-1" />
    </Link>
  );
}

/** Benefício em anel: ícone em círculo contorno `accent`, título "PARA **CRIADORES**" e 2 linhas `body`. */
export function BenefitRing({
  icon: Icon,
  lead,
  turn,
  children,
}: {
  icon: LucideIcon;
  lead: string;
  turn: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-accent text-accent-text shadow-glow-sm">
        <Icon aria-hidden className="size-6" />
      </span>
      <div>
        <h3 className="type-feature-title uppercase">
          <span className="text-ink">{lead}</span> <span className="text-accent-text">{turn}</span>
        </h3>
        <p className="mt-1 type-body text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

/** Faixa de selos: ícone + `tagline`, divisórias verticais em `border`. */
export function SealStrip({ items }: { items: Array<{ icon: LucideIcon; label: string }> }) {
  return (
    <ul className="grid grid-cols-2 gap-y-4 rounded-lg border border-border bg-surface-alt/60 py-4 md:grid-cols-4 md:divide-x md:divide-border">
      {items.map(({ icon: Icon, label }) => (
        <li key={label} className="flex items-center justify-center gap-2 px-4">
          <Icon aria-hidden className="size-5 shrink-0 text-accent-text" />
          <span className="type-caption font-semibold tracking-[0.2em] text-ink uppercase">
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tile de categoria 115×58: ícone + rótulo; ativo com borda `accent`. */
export function CategoryTile({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[58px] w-[115px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border bg-surface-alt type-caption transition",
        active
          ? "border-accent text-accent-text shadow-glow-sm"
          : "border-border text-ink-muted hover:border-ink-muted hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-5" />
      {label}
    </Link>
  );
}

/** Cabeçalho de seção com link "Ver todas →" em `accent-text`. */
export function SectionHeader({
  title,
  href,
  linkLabel = "Ver todas",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="type-heading text-ink">{title}</h2>
      {href && (
        <Link href={href} className="shrink-0 type-label text-accent-text hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/**
 * Card de criador em destaque: `radius-sm`, nome + selo verificado `accent` + @handle
 * sobre degradê escuro. Sem foto (mídia chega na S2), usa monograma sobre `brand-deep`.
 */
export function CreatorCard({
  handle,
  name,
  verified,
}: {
  handle: string;
  name: string;
  verified: boolean;
}) {
  return (
    <Link
      href={`/${handle}`}
      className="group relative flex aspect-[3/4] w-40 shrink-0 flex-col justify-end overflow-hidden rounded-sm border border-border bg-brand-deep sm:w-48"
    >
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center text-6xl font-extrabold text-vinho-borda transition group-hover:text-rosa-profundo"
      >
        {(name || handle).charAt(0).toUpperCase()}
      </span>
      <span className="relative bg-gradient-to-t from-noite via-noite/80 to-transparent p-3 pt-10">
        <span className="flex items-center gap-1 type-label font-bold text-ink">
          <span className="truncate">{name || handle}</span>
          {verified && (
            <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="verificado" />
          )}
        </span>
        <span className="block truncate type-caption text-ink-muted">@{handle}</span>
      </span>
    </Link>
  );
}

/** Banner "Conteúdo Premium": faixa `surface-alt`, borda `accent`, coroa, título, texto e CTA. */
export function PremiumBanner({
  title,
  text,
  href,
  cta,
}: {
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-accent bg-surface-alt p-6 shadow-glow-sm md:flex-row md:items-center">
      <Crown aria-hidden className="size-10 shrink-0 text-accent-text" />
      <div className="flex-1">
        <h2 className="type-feature-title text-ink">{title}</h2>
        <p className="mt-1 type-body text-ink-muted">{text}</p>
      </div>
      <Link href={href} className="shrink-0 type-label font-bold text-accent-text hover:underline">
        {cta} →
      </Link>
    </section>
  );
}

/**
 * Arte geométrica do Cover do DS (blocos vinho-borda/rosa + discos neon).
 * Substitui foto enquanto não há fotografia licenciada.
 */
export function BrandArt({ className }: { className?: string }) {
  const dots = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 8; c++)
      dots.push(<circle key={`${r}-${c}`} cx={36 + c * 24} cy={84 + r * 24} r={8} />);
  return (
    <svg
      viewBox="0 0 480 288"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden
      className={cn("h-auto w-full", className)}
    >
      <rect x="80" y="0" width="240" height="288" className="fill-vinho-borda" />
      <rect x="320" y="0" width="160" height="176" className="fill-rosa-neon" />
      <rect x="320" y="176" width="160" height="112" className="fill-rosa-profundo" />
      <rect x="0" y="200" width="80" height="88" className="fill-rosa-claro" />
      <g transform="translate(80 0)" className="fill-rosa-neon">
        {dots}
      </g>
    </svg>
  );
}
