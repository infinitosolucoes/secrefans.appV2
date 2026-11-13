"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { formatBRL } from "@/features/content/constants";
import { PERIOD_LABEL } from "./constants";
import { savePlansAction, startPromotionAction } from "./plan-actions";

export interface PlanRow {
  months: number;
  active: boolean;
  discountBps: number;
}

/** Planos de 3, 6 e 12 meses: liga/desliga e desconto sobre o mensal × meses. */
export function PlansForm({ monthlyCents, plans }: { monthlyCents: number; plans: PlanRow[] }) {
  const [state, action, pending] = useActionState(savePlansAction, null);
  const [values, setValues] = useState(() =>
    [3, 6, 12].map((m) => {
      const p = plans.find((x) => x.months === m);
      return {
        months: m,
        active: p?.active ?? false,
        discount: String((p?.discountBps ?? 0) / 100),
      };
    }),
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {values.map((v, i) => {
        const pctNum = Number(v.discount.replace(",", ".")) || 0;
        const price = Math.round(monthlyCents * v.months * (1 - pctNum / 100));
        return (
          <div
            key={v.months}
            className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
          >
            <label className="flex min-w-28 items-center gap-2 type-label font-semibold text-ink">
              <input
                type="checkbox"
                name={`active_${v.months}`}
                checked={v.active}
                onChange={(e) =>
                  setValues(
                    values.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)),
                  )
                }
                className="accent-[var(--rosa-neon)]"
              />
              {PERIOD_LABEL[v.months]}
            </label>
            <div className="w-28">
              <Field
                name={`discount_${v.months}`}
                label="Desconto (%)"
                inputMode="decimal"
                value={v.discount}
                onChange={(e) =>
                  setValues(
                    values.map((x, j) => (j === i ? { ...x, discount: e.target.value } : x)),
                  )
                }
              />
            </div>
            <p className="type-caption text-ink-muted">
              {formatBRL(price)} a cada {v.months} meses ({formatBRL(Math.round(price / v.months))}
              /mês)
            </p>
          </div>
        );
      })}
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Salvar planos
      </Button>
    </form>
  );
}

/** Nova promoção: desconto no 1º período, duração e vagas (opcional). */
export function PromotionForm({ periods }: { periods: number[] }) {
  const [state, action, pending] = useActionState(startPromotionAction, null);
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && <Alert tone="error">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-4">
        <SelectField name="months" label="Plano" defaultValue="1">
          {periods.map((m) => (
            <option key={m} value={m}>
              {PERIOD_LABEL[m]}
            </option>
          ))}
        </SelectField>
        <Field name="discount" label="Desconto (%)" inputMode="decimal" placeholder="50" required />
        <Field name="days" label="Dura (dias)" inputMode="numeric" defaultValue="7" required />
        <Field name="vagas" label="Vagas (opcional)" inputMode="numeric" placeholder="ilimitado" />
      </div>
      <Field
        name="message"
        label="Recado para os fãs (aparece no seu perfil)"
        maxLength={200}
        placeholder="Promoção relâmpago: só esta semana!"
      />
      <p className="type-caption text-ink-muted">
        O desconto vale só no 1º período de quem assinar; depois a assinatura renova pelo preço
        normal. O preço normal aparece riscado ao lado. Vagas são reais: ao esgotar, a promoção
        acaba sozinha.
      </p>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Lançar promoção
      </Button>
    </form>
  );
}
