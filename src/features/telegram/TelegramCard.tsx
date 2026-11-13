import { Alert, Button } from "@/components/ui";
import { startTelegramLinkAction, unlinkTelegramAction } from "./actions";

export type TelegramNotice = "sem-consentimento" | "erro" | null;

/** Card do grupo VIP no Telegram (só renderizado com o bot configurado). */
export function TelegramCard({
  linked,
  notice,
}: {
  linked: { username: string | null } | null;
  notice: TelegramNotice;
}) {
  return (
    <section aria-labelledby="telegram" className="flex max-w-xl flex-col gap-4">
      <div>
        <h2 id="telegram" className="mb-1 type-feature-title text-ink">
          Grupo VIP no Telegram
        </h2>
        <p className="type-caption text-ink-muted">
          Vincule sua conta para entrar no grupo exclusivo da Secretfans.
        </p>
      </div>
      {notice === "sem-consentimento" && (
        <Alert tone="warning">
          Para entrar no grupo, confirme que tem 18 anos ou mais nos termos da sua conta.
        </Alert>
      )}
      {notice === "erro" && (
        <Alert tone="error">Não foi possível concluir a operação. Tente novamente.</Alert>
      )}
      {linked ? (
        <form action={unlinkTelegramAction} className="flex flex-col gap-3">
          <p className="type-body text-ink">
            {linked.username ? `Vinculado como @${linked.username}` : "Vinculado ao Telegram"}
          </p>
          <p className="type-caption text-ink-muted">Ao desvincular, você sai do grupo.</p>
          <Button type="submit" variant="danger" className="self-start">
            Desvincular
          </Button>
        </form>
      ) : (
        <form action={startTelegramLinkAction}>
          <Button type="submit">Entrar no grupo VIP</Button>
        </form>
      )}
    </section>
  );
}
