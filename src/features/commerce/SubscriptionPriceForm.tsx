"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { setSubscriptionPriceAction } from "./actions";
import { SUBSCRIPTION_PRICE_MAX, SUBSCRIPTION_PRICE_MIN } from "./constants";

export function SubscriptionPriceForm({ priceCents }: { priceCents: number | null }) {
  const [state, action, pending] = useActionState(setSubscriptionPriceAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="max-w-xs">
        <Label htmlFor="price" hint={`R$ ${SUBSCRIPTION_PRICE_MIN} a R$ ${SUBSCRIPTION_PRICE_MAX}`}>
          Preço mensal (R$)
        </Label>
        <Input
          id="price"
          name="price"
          inputMode="decimal"
          placeholder="29,90"
          defaultValue={priceCents ? (priceCents / 100).toFixed(2).replace(".", ",") : ""}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {priceCents ? "Atualizar preço" : "Ativar assinatura"}
        </Button>
        {priceCents && (
          <Button type="submit" size="sm" variant="ghost" name="disable" value="1">
            Desativar para novos fãs
          </Button>
        )}
      </div>
      <p className="type-caption text-ink-muted">
        Novo preço vale para novas assinaturas e renovações; quem já assina mantém o valor do
        período pago.
      </p>
    </form>
  );
}
