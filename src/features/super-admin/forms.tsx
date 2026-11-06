"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Label, SelectField, Textarea } from "@/components/ui";
import { ROLE_LABELS, type AppRole } from "@/server/authorization/roles";
import {
  changeRoleAction,
  decideVerificationAction,
  openVerificationDocumentAction,
  setAccountStatusAction,
  type AdminResult,
} from "./actions";

function Result({ state }: { state: AdminResult | null }) {
  if (!state) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

function ReasonField({ id }: { id: string }) {
  return (
    <div>
      <Label htmlFor={id}>Motivo (obrigatório, fica na auditoria)</Label>
      <Textarea id={id} name="reason" required minLength={3} maxLength={500} className="min-h-20" />
    </div>
  );
}

const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export function RoleForm({ userId, currentRoles }: { userId: string; currentRoles: AppRole[] }) {
  const [state, action, pending] = useActionState(changeRoleAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state} />
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="role" label="Papel">
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]} {currentRoles.includes(r) ? "(atual)" : ""}
            </option>
          ))}
        </SelectField>
        <SelectField name="op" label="Operação">
          <option value="grant">Conceder</option>
          <option value="revoke">Revogar</option>
        </SelectField>
      </div>
      <ReasonField id="role-reason" />
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        Aplicar
      </Button>
    </form>
  );
}

export function AccountStatusForm({ userId, status }: { userId: string; status: string }) {
  const [state, action, pending] = useActionState(setAccountStatusAction, null);
  const next = status === "blocked" ? "active" : "blocked";
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={next} />
      <ReasonField id="status-reason" />
      <Button
        type="submit"
        variant={next === "blocked" ? "danger" : "secondary"}
        loading={pending}
        className="self-start"
      >
        {next === "blocked" ? "Bloquear conta" : "Reativar conta"}
      </Button>
    </form>
  );
}

export function DecisionForm({
  verificationId,
  status,
}: {
  verificationId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(decideVerificationAction, null);
  const options =
    status === "pending"
      ? [
          ["approved", "Aprovar"],
          ["rejected", "Rejeitar"],
        ]
      : status === "approved"
        ? [["suspended", "Suspender"]]
        : status === "suspended"
          ? [
              ["approved", "Reativar (aprovar)"],
              ["rejected", "Rejeitar"],
            ]
          : [];
  if (options.length === 0)
    return <p className="type-body text-ink-muted">Sem ações disponíveis para este status.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state} />
      <input type="hidden" name="verificationId" value={verificationId} />
      <ReasonField id="decision-reason" />
      <div className="flex flex-wrap gap-2">
        {options.map(([value, label]) => (
          <Button
            key={value}
            type="submit"
            name="status"
            value={value}
            loading={pending}
            variant={value === "approved" ? "primary" : "danger"}
          >
            {label}
          </Button>
        ))}
      </div>
    </form>
  );
}

export function DocumentButton({
  verificationId,
  path,
  label,
}: {
  verificationId: string;
  path: string;
  label: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function open() {
    setPending(true);
    setError(null);
    const res = await openVerificationDocumentAction(verificationId, path);
    setPending(false);
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else setError(res.error ?? "Erro ao abrir.");
  }
  return (
    <div>
      <Button variant="outline" size="sm" onClick={open} loading={pending}>
        {label}
      </Button>
      {error && <p className="mt-1 type-caption text-accent-text">{error}</p>}
    </div>
  );
}
