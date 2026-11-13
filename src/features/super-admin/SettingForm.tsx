"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { EDITABLE_SETTINGS, type EditableSettingKey } from "./settings";
import { updateSettingAction } from "./settings-actions";

const brl = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Edição de uma configuração (valor + motivo obrigatório). */
export function SettingForm({
  settingKey,
  value,
}: {
  settingKey: EditableSettingKey;
  value: number;
}) {
  const [state, action, pending] = useActionState(updateSettingAction, null);
  const def = EDITABLE_SETTINGS[settingKey];
  const isMoney = def.unit === "brl";
  const hint = isMoney ? `R$ ${brl(def.min)} a R$ ${brl(def.max)}` : `${def.min} a ${def.max}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <input type="hidden" name="key" value={settingKey} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field
          name="value"
          label={isMoney ? "Novo valor (R$)" : "Novo valor"}
          inputMode={isMoney ? "decimal" : "numeric"}
          defaultValue={isMoney ? brl(value) : String(value)}
          required
        />
        <Field name="reason" label="Motivo da mudança" minLength={5} maxLength={300} required />
      </div>
      <p className="type-caption text-ink-muted">Faixa permitida: {hint}.</p>
      <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
        Salvar
      </Button>
    </form>
  );
}
