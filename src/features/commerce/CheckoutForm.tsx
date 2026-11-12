"use client";

import { useActionState, useMemo, useState } from "react";
import { CreditCard, Lock, Zap } from "lucide-react";
import { Alert, Button, Checkbox, Input, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/features/content/constants";
import { startCheckoutAction } from "./actions";
import { TIP_OPTIONS, type CheckoutSlug } from "./constants";

export function CheckoutForm({
  slug,
  id,
  priceCents,
  needsCpf = false,
}: {
  slug: CheckoutSlug;
  id: string;
  priceCents: number | null;
  needsCpf?: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [tip, setTip] = useState<string>(String(TIP_OPTIONS[1]));
  const isTip = slug === "gorjeta";
  const total = isTip ? (tip === "outro" ? null : Number(tip)) : priceCents;

  const methodCard = (value: "pix" | "card", title: string, hint: string, Icon: typeof Zap) => (
    <label
      className={cn(
        "flex min-h-16 cursor-pointer items-center gap-3 rounded-md border bg-surface px-4 py-3 transition",
        method === value ? "border-accent shadow-glow-sm" : "border-border hover:border-ink-muted",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
      )}
    >
      <input
        type="radio"
        name="method"
        value={value}
        checked={method === value}
        onChange={() => setMethod(value)}
        className="sr-only"
      />
      <Icon className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="flex-1">
        <span className="block type-label font-semibold text-ink">{title}</span>
        <span className="block type-caption text-ink-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {state && !state.ok && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="tipo" value={slug} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {isTip && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 type-label font-semibold text-ink">Valor da gorjeta</legend>
          <div className="flex flex-wrap gap-2">
            {[...TIP_OPTIONS.map(String), "outro"].map((v) => (
              <label
                key={v}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center rounded-pill border px-4 type-label",
                  tip === v ? "border-accent text-accent-text" : "border-border text-ink-muted",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                )}
              >
                <input
                  type="radio"
                  name="amount"
                  value={v}
                  checked={tip === v}
                  onChange={() => setTip(v)}
                  className="sr-only"
                />
                {v === "outro" ? "Outro valor" : formatBRL(Number(v))}
              </label>
            ))}
          </div>
          {tip === "outro" && (
            <div className="max-w-xs">
              <Label htmlFor="customAmount" hint="R$ 5 a R$ 1.000">
                Valor (R$)
              </Label>
              <Input
                id="customAmount"
                name="customAmount"
                inputMode="decimal"
                placeholder="15,00"
              />
            </div>
          )}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 type-label font-semibold text-ink">Forma de pagamento</legend>
        {methodCard("pix", "Pix", "Acesso liberado assim que o pagamento for confirmado", Zap)}
        {methodCard("card", "Cartão de crédito", "Sujeito à análise antifraude", CreditCard)}
        {method === "card" && (
          <p className="flex gap-2 type-caption text-ink-muted">
            <Lock className="size-4 shrink-0" aria-hidden />
            Os dados do cartão são digitados no formulário seguro do provedor de pagamentos e não
            ficam armazenados na Secretfans.
          </p>
        )}
      </fieldset>

      {needsCpf && (
        <div className="max-w-xs">
          <Label htmlFor="cpf" hint="exigido pelo provedor de pagamentos">
            CPF
          </Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            maxLength={14}
            required
          />
          <p className="mt-1 type-caption text-ink-muted">
            Enviado só ao provedor; a Secretfans guarda apenas os 4 últimos dígitos.
          </p>
        </div>
      )}

      <Checkbox name="accept" required>
        Li e aceito a política de compras e reembolso. Em caso de estorno ou chargeback, o acesso ao
        conteúdo é revisto.
      </Checkbox>

      <Button type="submit" size="lg" loading={pending} fullWidth>
        {total ? `Pagar ${formatBRL(total)}` : "Continuar para o pagamento"}
      </Button>
    </form>
  );
}
