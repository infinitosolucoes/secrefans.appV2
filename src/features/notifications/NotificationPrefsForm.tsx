"use client";

import { useActionState } from "react";
import { Alert, Button, Checkbox } from "@/components/ui";
import { saveNotificationPrefsAction } from "./actions";
import type { NotificationPrefs } from "./queries";

export function NotificationPrefsForm({
  prefs,
  isCreator,
}: {
  prefs: NotificationPrefs;
  isCreator: boolean;
}) {
  const [state, action, pending] = useActionState(saveNotificationPrefsAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <p className="type-label font-semibold text-ink">Receber por e-mail</p>
      {isCreator && (
        <Checkbox name="emailSales" defaultChecked={prefs.emailSales}>
          Vendas, mimos e novos assinantes
        </Checkbox>
      )}
      {!isCreator && <input type="hidden" name="emailSales" value={prefs.emailSales ? "on" : ""} />}
      <Checkbox name="emailMessages" defaultChecked={prefs.emailMessages}>
        Novas mensagens (um aviso por conversa até você ler)
      </Checkbox>
      <Checkbox name="emailAccount" defaultChecked={prefs.emailAccount}>
        Problemas com pagamento da assinatura
      </Checkbox>
      <p className="mt-2 type-label font-semibold text-ink">No site</p>
      <Checkbox name="inappNewPosts" defaultChecked={prefs.inappNewPosts}>
        Novos posts de criadores que eu assino
      </Checkbox>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Salvar preferências
      </Button>
    </form>
  );
}
