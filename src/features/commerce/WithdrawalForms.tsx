"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Checkbox, Field, SelectField } from "@/components/ui";
import { PIX_KEY_LABEL, PIX_KEY_TYPES, type PixKeyTypeName } from "@/lib/pix";
import { formatBRL } from "@/features/content/constants";
import {
  approveWithdrawalAction,
  rejectWithdrawalAction,
  requestWithdrawalAction,
  setPixKeyAction,
} from "./withdrawal-actions";

const PLACEHOLDER: Record<PixKeyTypeName, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  email: "voce@exemplo.com",
  phone: "(11) 91234-5678",
  evp: "00000000-0000-0000-0000-000000000000",
};

/** Cadastro/troca da chave Pix que recebe os saques. */
export function PixKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(setPixKeyAction, null);
  const [type, setType] = useState<PixKeyTypeName>("cpf");
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <SelectField
          name="keyType"
          label="Tipo de chave"
          value={type}
          onChange={(e) => setType(e.target.value as PixKeyTypeName)}
        >
          {PIX_KEY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PIX_KEY_LABEL[t]}
            </option>
          ))}
        </SelectField>
        <Field
          name="keyValue"
          label="Chave Pix"
          placeholder={PLACEHOLDER[type]}
          autoComplete="off"
          required
        />
      </div>
      <Checkbox name="confirm" required>
        Confirmo que esta chave Pix está no meu nome (mesmo titular da verificação de identidade).
      </Checkbox>
      <Button type="submit" loading={pending} variant="secondary" className="self-start">
        {hasKey ? "Trocar chave Pix" : "Salvar chave Pix"}
      </Button>
    </form>
  );
}

/** Pedido de saque (valor livre entre o mínimo e o disponível). */
export function WithdrawalRequestForm({ available, min }: { available: number; min: number }) {
  const [state, action, pending] = useActionState(requestWithdrawalAction, null);
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        {state && (
          <div className="mb-3">
            <Alert tone="error">{state.message}</Alert>
          </div>
        )}
        <Field
          name="amount"
          label={`Valor do saque (mínimo ${formatBRL(min)})`}
          inputMode="decimal"
          defaultValue={fmt(available)}
          required
        />
      </div>
      <Button type="submit" loading={pending} disabled={available < min}>
        Solicitar saque
      </Button>
    </form>
  );
}

/** Financeiro: aprovar (envia o Pix) ou recusar com motivo. Cada botão tem a própria ação. */
export function WithdrawalDecisionForm({ id, amount }: { id: string; amount: number }) {
  const [approved, approve, approving] = useActionState(approveWithdrawalAction, null);
  const [rejected, reject, rejecting] = useActionState(rejectWithdrawalAction, null);
  const state = approved ?? rejected;
  const pending = approving || rejecting;
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form className="flex flex-col gap-3">
      {state && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="id" value={id} />
      <Field name="reason" label="Motivo (obrigatório para recusar)" maxLength={300} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" formAction={approve} loading={approving} disabled={pending}>
          Aprovar e enviar {formatBRL(amount)}
        </Button>
        <Button
          type="submit"
          formAction={reject}
          variant="secondary"
          loading={rejecting}
          disabled={pending}
        >
          Recusar
        </Button>
      </div>
    </form>
  );
}
