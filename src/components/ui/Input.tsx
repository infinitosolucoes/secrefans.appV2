import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Campo do DS: `surface-alt`, contorno `border`, raio `radius-sm`; erro em `danger`. */
const field =
  "w-full rounded-sm border border-border bg-surface-alt px-4 text-ink placeholder:text-ink-muted " +
  "transition hover:border-ink-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(field, "h-12", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-28 py-3", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(field, "h-12 appearance-none pr-10", className)} {...rest}>
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted"
        />
      </div>
    );
  },
);

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block type-label text-ink">
      {children}
      {hint && <span className="ml-2 type-caption text-ink-muted"> ({hint})</span>}
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 type-caption text-danger">
      {message}
    </p>
  );
}

export function Field({
  name,
  label,
  error,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const errId = `${name}-erro`;
  return (
    <div>
      <Label htmlFor={name} hint={hint}>
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...rest}
      />
      <FieldError id={errId} message={error} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  error,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { name: string; label: string; error?: string }) {
  const errId = `${name}-erro`;
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...rest}
      >
        {children}
      </Select>
      <FieldError id={errId} message={error} />
    </div>
  );
}

/** Caixa de seleção com rótulo clicável; marcada em `rosa-neon`. */
export function Checkbox({
  name,
  error,
  children,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  const errId = `${name}-erro`;
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2 type-caption text-ink-muted">
        <input
          type="checkbox"
          name={name}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--rosa-neon)]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          {...rest}
        />
        <span>{children}</span>
      </label>
      <FieldError id={errId} message={error} />
    </div>
  );
}

/** Opção em cartão (rádio). Selecionada: contorno `accent` + `glow-sm`. */
export function RadioCard({
  name,
  value,
  title,
  description,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "title"> & {
  name: string;
  value: string;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col rounded-md border border-border p-4 transition hover:border-ink-muted",
        "has-[:checked]:border-accent has-[:checked]:shadow-glow-sm",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
      )}
    >
      <input type="radio" name={name} value={value} className="sr-only" {...rest} />
      <span className="type-body-strong text-ink">{title}</span>
      {description && <span className="type-caption text-ink-muted">{description}</span>}
    </label>
  );
}
