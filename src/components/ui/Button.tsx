import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/*
 * Regra do DS: branco sobre rosa-neon dá 3.77:1 e só vale em bold ≥19px (estilo `cta`).
 * Por isso o primário pequeno (sm/md) usa fundo rosa-profundo (4.85:1) e o degradê
 * neon→profundo com glow-lg fica só no tamanho lg, que usa o estilo `cta` (22px/800).
 */
const variants: Record<ButtonVariant, string> = {
  primary: "text-on-accent hover:brightness-110 active:brightness-95",
  secondary: "bg-surface-alt text-ink border border-border hover:border-accent active:bg-surface",
  outline:
    "bg-transparent text-accent-text border border-accent hover:bg-surface-alt active:bg-surface",
  ghost: "bg-transparent text-ink hover:bg-surface-alt active:bg-surface",
  danger: "bg-transparent text-danger border border-danger hover:bg-surface-alt active:bg-surface",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 type-label font-bold",
  md: "h-11 px-6 type-label font-bold",
  lg: "h-14 px-8 type-cta",
};

const primaryBySize: Record<ButtonSize, string> = {
  sm: "bg-rosa-profundo shadow-glow-sm",
  md: "bg-rosa-profundo shadow-glow-sm",
  lg: "gradient-cta shadow-glow-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const buttonClasses = (
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  fullWidth = false,
) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-pill whitespace-nowrap transition",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
    variants[variant],
    variant === "primary" && primaryBySize[size],
    sizes[size],
    fullWidth && "w-full",
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonClasses(variant, size, fullWidth), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});
