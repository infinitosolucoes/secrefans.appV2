"use client";

import { useActionState } from "react";
import { Alert, Button, Checkbox, Label, Select, Textarea } from "@/components/ui";
import { decideReportAction } from "./reports";

export function ReportDecisionForm({
  reportId,
  canRemove,
  telegram,
}: {
  reportId: string;
  canRemove: boolean;
  /** Denúncia de mensagem do grupo do Telegram: troca "Retirar o conteúdo" pela ação no bot. */
  telegram: boolean;
}) {
  const [state, action, pending] = useActionState(decideReportAction, null);
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  const id = `decisao-${reportId}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && !state.ok && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="reportId" value={reportId} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div>
          <Label htmlFor={`${id}-status`}>Decisão</Label>
          <Select id={`${id}-status`} name="status" defaultValue="resolved">
            <option value="resolved">Procedente</option>
            <option value="dismissed">Arquivar</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-motivo`}>Motivo (vai para a auditoria)</Label>
          <Textarea
            id={`${id}-motivo`}
            name="reason"
            required
            minLength={5}
            maxLength={500}
            className="min-h-12"
          />
        </div>
      </div>
      {telegram ? (
        <div className="sm:max-w-xs">
          <Label htmlFor={`${id}-telegram`} hint="só vale para decisão procedente">
            Ação no Telegram
          </Label>
          <Select id={`${id}-telegram`} name="telegramAction" defaultValue="none">
            <option value="none">Nenhuma</option>
            <option value="delete">Apagar a mensagem</option>
            <option value="mute24">Silenciar o autor por 24 h</option>
            <option value="ban">Banir o autor do grupo</option>
          </Select>
        </div>
      ) : (
        canRemove && (
          <Checkbox name="removeTarget">
            Retirar o conteúdo denunciado (só vale para decisão procedente)
          </Checkbox>
        )
      )}
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Registrar decisão
      </Button>
    </form>
  );
}
