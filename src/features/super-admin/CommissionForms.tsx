"use client";

import { useActionState } from "react";
import { Alert, Button, Checkbox, Field, Label, Textarea } from "@/components/ui";
import { decideCommissionAction, proposeCommissionAction, setPaymentFeeAction } from "./commission";

export function PaymentFeeForm({
  method,
  fixedCents,
  bps,
}: {
  method: "pix" | "card";
  fixedCents: number;
  bps: number;
}) {
  const [state, action, pending] = useActionState(setPaymentFeeAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <input type="hidden" name="provider" value="asaas" />
      <input type="hidden" name="method" value={method} />
      <div className="grid grid-cols-2 gap-3">
        <Field
          name="fixed"
          label="Fixo por cobrança (R$)"
          inputMode="decimal"
          defaultValue={(fixedCents / 100).toFixed(2).replace(".", ",")}
          required
        />
        <Field
          name="percent"
          label="Percentual (%)"
          inputMode="decimal"
          defaultValue={(bps / 100).toString().replace(".", ",")}
        />
      </div>
      <div>
        <Label htmlFor={`fee-reason-${method}`}>Justificativa (vai para a auditoria)</Label>
        <Textarea
          id={`fee-reason-${method}`}
          name="reason"
          required
          minLength={5}
          className="min-h-12"
        />
      </div>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Salvar taxa
      </Button>
    </form>
  );
}

export function ProposeCommissionForm({ minDate }: { minDate: string }) {
  const [state, action, pending] = useActionState(proposeCommissionAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="percent"
          label="Novo percentual (%)"
          inputMode="decimal"
          placeholder="Ex.: 12"
          required
        />
        <Field
          name="effectiveFrom"
          label="Início da vigência"
          type="datetime-local"
          min={minDate}
          required
          hint="horário de Brasília"
        />
      </div>
      <Checkbox name="appliesToTips" defaultChecked>
        Comissão incide também sobre mimos
      </Checkbox>
      <div>
        <Label htmlFor="reason">Justificativa (vai para a auditoria)</Label>
        <Textarea
          id="reason"
          name="reason"
          required
          minLength={5}
          maxLength={500}
          className="min-h-16"
        />
      </div>
      <p className="type-caption text-ink-muted">
        Alteração financeira sensível: exige MFA e a aprovação de outro administrador antes de
        entrar em vigor. Vale só para vendas novas, a partir da data informada.
      </p>
      <Button type="submit" loading={pending} className="self-start">
        Enviar para aprovação
      </Button>
    </form>
  );
}

export function DecideCommissionForm({
  ruleId,
  isProposer,
}: {
  ruleId: string;
  isProposer: boolean;
}) {
  const [state, action, pending] = useActionState(decideCommissionAction, null);
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  if (isProposer)
    return (
      <p className="type-caption text-ink-muted">
        Você propôs esta mudança. A aprovação precisa ser feita por outro administrador.
      </p>
    );
  return (
    <form action={action} className="flex flex-col gap-2">
      {state && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="ruleId" value={ruleId} />
      <Label htmlFor={`motivo-${ruleId}`}>Motivo da decisão</Label>
      <Textarea id={`motivo-${ruleId}`} name="reason" required className="min-h-12" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" name="decision" value="approve" loading={pending}>
          Aprovar
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="danger"
          name="decision"
          value="reject"
          disabled={pending}
        >
          Rejeitar
        </Button>
      </div>
    </form>
  );
}
