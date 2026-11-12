"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { onlyDigits } from "@/lib/cpf";
import { registerPayoutAccountAction } from "./payout-actions";

export function PayoutAccountForm() {
  const [state, action, pending] = useActionState(registerPayoutAccountAction, null);
  const [doc, setDoc] = useState("");
  const isCnpj = onlyDigits(doc).length > 11;

  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <Alert tone="error">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="legalName"
          label={isCnpj ? "Razão social" : "Nome completo"}
          autoComplete="name"
          required
        />
        <Field
          name="document"
          label="CPF ou CNPJ"
          inputMode="numeric"
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          required
        />
        {isCnpj ? (
          <SelectField name="companyType" label="Tipo de empresa" defaultValue="MEI" required>
            <option value="MEI">MEI</option>
            <option value="LIMITED">Limitada (LTDA)</option>
            <option value="INDIVIDUAL">Individual (EI)</option>
            <option value="ASSOCIATION">Associação</option>
          </SelectField>
        ) : (
          <Field name="birthDate" label="Data de nascimento" type="date" required />
        )}
        <Field
          name="mobilePhone"
          label="Celular com DDD"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          required
        />
        <Field
          name="income"
          label={isCnpj ? "Faturamento mensal (R$)" : "Renda mensal (R$)"}
          inputMode="decimal"
          placeholder="3.000,00"
          required
        />
        <Field
          name="postalCode"
          label="CEP"
          inputMode="numeric"
          autoComplete="postal-code"
          required
        />
        <Field name="address" label="Endereço" autoComplete="address-line1" required />
        <div className="grid grid-cols-2 gap-4">
          <Field name="addressNumber" label="Número" required />
          <Field name="complement" label="Complemento" />
        </div>
        <Field name="province" label="Bairro" required />
      </div>
      <p className="type-caption text-ink-muted">
        Os dados vão direto para o Asaas, instituição de pagamento regulada pelo Banco Central, para
        abrir sua conta de recebimento. A Secretfans guarda só os 4 últimos dígitos do documento.
      </p>
      <Button type="submit" loading={pending} className="self-start">
        Ativar recebimentos
      </Button>
    </form>
  );
}
