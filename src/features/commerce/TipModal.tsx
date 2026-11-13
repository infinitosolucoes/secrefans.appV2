"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Gift, Minus, Plus, X, Zap } from "lucide-react";
import { Avatar } from "@/components/domain/Avatar";
import { Alert, Button, buttonClasses, Checkbox, Input, Label, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/features/content/constants";
import { getTipContextAction, startCheckoutAction } from "./actions";
import { TIP_MAX_REAIS, TIP_MIN_REAIS, TIP_STEP_REAIS } from "./constants";

export interface TipCreator {
  id: string;
  name: string;
  handle: string;
  avatarPath: string | null;
}

const clamp = (v: number) => Math.min(TIP_MAX_REAIS, Math.max(TIP_MIN_REAIS, Math.round(v)));

/**
 * Botão "Mimo" que abre o modal (estilo vitrine): valor grande com − e +, barra de mínimo a
 * máximo, mensagem opcional e pagamento ali mesmo (Pix ou cartão). A mensagem só chega ao chat
 * do criador depois do pagamento confirmado.
 */
export function TipButton({
  creator,
  label = "Mimo",
  className,
  icon = true,
}: {
  creator: TipCreator;
  label?: string;
  className?: string;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {icon && <Gift className="size-4" aria-hidden />}
        {label}
      </button>
      {open && <TipModal creator={creator} onClose={() => setOpen(false)} />}
    </>
  );
}

function TipModal({ creator, onClose }: { creator: TipCreator; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(startCheckoutAction, null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [amount, setAmount] = useState(20);
  const [typed, setTyped] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [ctx, setCtx] = useState<{ needsCpf: boolean; testMode: boolean } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    getTipContextAction()
      .then(setCtx)
      .catch(() => setCtx({ needsCpf: false, testMode: false }));
  }, []);

  const set = (v: number) => {
    setAmount(clamp(v));
    setTyped(null);
  };
  const pct = ((amount - TIP_MIN_REAIS) / (TIP_MAX_REAIS - TIP_MIN_REAIS)) * 100;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="mimo-titulo"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-alt p-0 text-ink backdrop:bg-black/70"
    >
      <form
        action={action}
        className="flex max-h-[90dvh] flex-col gap-5 overflow-y-auto p-5 md:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="mimo-titulo" className="type-feature-title text-ink">
            Enviar mimo
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => dialog.current?.close()}
            className="rounded-pill p-1 text-ink-muted hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          <Avatar path={creator.avatarPath} name={creator.name} size="md" />
          <div>
            <p className="type-label font-semibold text-ink">{creator.name}</p>
            <p className="type-caption text-ink-muted">
              Vai ficar muito feliz em receber seu mimo!
            </p>
          </div>
        </div>

        <input type="hidden" name="tipo" value="mimo" />
        <input type="hidden" name="id" value={creator.id} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="amount" value="outro" />
        <input type="hidden" name="customAmount" value={`${amount},00`} />

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label={`Diminuir R$ ${TIP_STEP_REAIS}`}
              onClick={() => set(amount - TIP_STEP_REAIS)}
              disabled={amount <= TIP_MIN_REAIS}
              className="flex size-9 items-center justify-center rounded-pill bg-accent text-white disabled:opacity-40"
            >
              <Minus className="size-5" aria-hidden />
            </button>
            <label className="flex items-baseline gap-1 text-4xl font-extrabold text-ink">
              <span>R$</span>
              <input
                aria-label="Valor do mimo em reais"
                inputMode="numeric"
                value={typed ?? String(amount)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setTyped(digits);
                  if (digits) setAmount(clamp(Number(digits)));
                }}
                onBlur={() => setTyped(null)}
                className="w-28 bg-transparent text-center outline-none focus:underline"
              />
            </label>
            <button
              type="button"
              aria-label={`Aumentar R$ ${TIP_STEP_REAIS}`}
              onClick={() => set(amount + TIP_STEP_REAIS)}
              disabled={amount >= TIP_MAX_REAIS}
              className="flex size-9 items-center justify-center rounded-pill bg-accent text-white disabled:opacity-40"
            >
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
          <input
            type="range"
            aria-label="Escolher valor do mimo"
            min={TIP_MIN_REAIS}
            max={TIP_MAX_REAIS}
            step={1}
            value={amount}
            onChange={(e) => set(Number(e.target.value))}
            className="w-full accent-[var(--rosa-neon)]"
            style={{ backgroundSize: `${pct}% 100%` }}
          />
          <p className="type-caption text-ink-muted">
            Mínimo: {formatBRL(TIP_MIN_REAIS * 100)} · Máximo: {formatBRL(TIP_MAX_REAIS * 100)}
          </p>
        </div>

        <div>
          <Label htmlFor="mimo-mensagem">Mensagem (opcional)</Label>
          <Textarea
            id="mimo-mensagem"
            name="message"
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escreva algo para acompanhar o seu mimo…"
            className="min-h-20"
          />
          <p className="mt-1 text-right type-caption text-ink-muted">{message.length} / 500</p>
        </div>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 type-label font-semibold text-ink">Pagamento</legend>
          {(
            [
              ["pix", "Pix", Zap],
              ["card", "Cartão", CreditCard],
            ] as const
          ).map(([value, title, Icon]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border bg-surface px-3 py-2.5 type-label",
                method === value ? "border-accent text-ink" : "border-border text-ink-muted",
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
              <Icon className="size-4 text-accent" aria-hidden />
              {title}
            </label>
          ))}
        </fieldset>

        {ctx?.needsCpf && (
          <div>
            <Label htmlFor="mimo-cpf" hint="exigido pelo provedor de pagamentos">
              CPF
            </Label>
            <Input id="mimo-cpf" name="cpf" inputMode="numeric" autoComplete="off" required />
          </div>
        )}

        <Checkbox name="accept" required>
          Li e aceito a política de compras e reembolso.
        </Checkbox>

        {state && !state.ok && <Alert tone="error">{state.message}</Alert>}
        {ctx?.testMode && (
          <p className="type-caption text-ink-muted">
            Ambiente de testes: nenhum valor real é cobrado.
          </p>
        )}

        <Button type="submit" loading={pending} disabled={!ctx} fullWidth>
          Enviar {formatBRL(amount * 100)}
        </Button>
      </form>
    </dialog>
  );
}

export const tipButtonClass = (primary = false) =>
  cn(buttonClasses(primary ? "primary" : "secondary", "md"), "inline-flex items-center gap-2");
