import Link from "next/link";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface-alt p-4 md:p-6", className)}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("type-feature-title text-ink", className)} {...rest} />;
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
const tones: Record<BadgeTone, string> = {
  neutral: "border-border text-ink-muted",
  accent: "border-accent text-accent-text",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-3 py-0.5 type-caption font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "error" | "success" | "warning";
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border border-l-4 bg-surface-alt p-4 type-body",
        tone === "error" && "border-danger",
        tone === "success" && "border-success",
        tone === "warning" && "border-warning",
        tone === "info" && "border-border",
      )}
    >
      {title && <p className="type-body-strong text-ink">{title}</p>}
      {children && <div className="text-ink-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-alt", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="type-feature-title text-ink">{title}</p>
      {description && <p className="max-w-md type-body text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Abas de navegação. Ativa em pílula surface-alt com accent-text, como no DS. */
export function LinkTabs({
  items,
  active,
}: {
  items: Array<{ href: string; label: string }>;
  active: string;
}) {
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-pill px-4 py-2 type-label",
              isActive ? "bg-surface-alt text-accent-text" : "text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="type-tagline text-accent-text">{eyebrow}</p>}
        <h1 className="type-heading text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl type-body text-ink-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
