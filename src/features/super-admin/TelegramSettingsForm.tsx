"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Label, Textarea } from "@/components/ui";
import { saveTelegramSettingsAction } from "./telegram-actions";

export interface TelegramSettingsValues {
  rulesText: string;
  welcomeText: string;
  allowedDomains: string[];
  warnLimit: number;
  autoMuteHours: number;
  floodRepeatLimit: number;
  floodWindowSeconds: number;
}

export function TelegramSettingsForm({ initial }: { initial: TelegramSettingsValues }) {
  const [state, action, pending] = useActionState(saveTelegramSettingsAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div>
        <Label htmlFor="tg-rules" hint="resposta do /regras">
          Regras do grupo
        </Label>
        <Textarea
          id="tg-rules"
          name="rulesText"
          defaultValue={initial.rulesText}
          required
          maxLength={2000}
          className="min-h-32"
        />
      </div>
      <div>
        <Label htmlFor="tg-welcome" hint="enviada a quem entra">
          Mensagem de boas-vindas
        </Label>
        <Textarea
          id="tg-welcome"
          name="welcomeText"
          defaultValue={initial.welcomeText}
          required
          maxLength={2000}
          className="min-h-24"
        />
      </div>
      <div>
        <Label htmlFor="tg-domains" hint="um por linha; links de outros domínios são apagados">
          Domínios permitidos
        </Label>
        <Textarea
          id="tg-domains"
          name="allowedDomains"
          defaultValue={initial.allowedDomains.join("\n")}
          required
          className="min-h-24 font-mono"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="warnLimit"
          label="Advertências até silenciar"
          type="number"
          min={1}
          max={10}
          defaultValue={initial.warnLimit}
          required
        />
        <Field
          name="autoMuteHours"
          label="Silêncio automático (horas)"
          type="number"
          min={1}
          max={168}
          defaultValue={initial.autoMuteHours}
          required
        />
        <Field
          name="floodRepeatLimit"
          label="Repetições para flood"
          type="number"
          min={2}
          max={20}
          defaultValue={initial.floodRepeatLimit}
          required
        />
        <Field
          name="floodWindowSeconds"
          label="Janela de flood (segundos)"
          type="number"
          min={10}
          max={600}
          defaultValue={initial.floodWindowSeconds}
          required
        />
      </div>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Salvar configurações do bot
      </Button>
    </form>
  );
}
