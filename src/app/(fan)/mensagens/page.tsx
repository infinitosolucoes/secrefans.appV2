import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/domain/Avatar";
import { Alert, buttonClasses, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { setDmPolicyAction } from "@/features/messages/actions";
import { getDmPolicy, getInbox } from "@/features/messages/queries";
import { RealtimeRefresher } from "@/features/messages/RealtimeRefresher";

export const metadata: Metadata = { title: "Mensagens" };

const ERRORS: Record<string, string> = {
  P0001: "Este criador só recebe mensagens de assinantes. Assine para conversar.",
  P0002: "Não foi possível abrir esta conversa.",
  "42501": "Não foi possível abrir esta conversa.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser("/mensagens");
  const { erro } = await searchParams;
  const isCreator = user.roles.includes("creator");
  const [inbox, policy] = await Promise.all([
    getInbox(user.id),
    isCreator ? getDmPolicy(user.id) : Promise.resolve(null),
  ]);

  return (
    <AppShell user={user} active="/mensagens">
      <RealtimeRefresher />
      <PageHeader
        title="Mensagens"
        description="Conversas privadas entre fãs e criadores."
        actions={
          isCreator ? (
            <Link href="/mensagens/massa" className={buttonClasses("secondary", "sm")}>
              <Megaphone className="size-4" aria-hidden />
              Mensagem em massa
            </Link>
          ) : undefined
        }
      />
      <div className="flex max-w-3xl flex-col gap-5">
        {erro && <Alert tone="error">{ERRORS[erro] ?? ERRORS.P0002}</Alert>}

        {isCreator && (
          <form
            action={setDmPolicyAction}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-alt p-4"
          >
            <span className="type-label font-semibold text-ink">Quem pode me mandar mensagem:</span>
            {(
              [
                ["subscribers", "Só assinantes"],
                ["everyone", "Qualquer fã logado"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="submit"
                name="policy"
                value={value}
                aria-pressed={policy === value}
                className={cn(
                  "inline-flex h-9 items-center rounded-pill border px-4 type-label",
                  policy === value
                    ? "border-accent font-semibold text-accent-text"
                    : "border-border text-ink-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </form>
        )}

        {inbox.length === 0 ? (
          <EmptyState
            title="Nenhuma conversa ainda"
            description={
              isCreator
                ? "Quando um fã mandar mensagem, ela aparece aqui. Você também pode enviar uma mensagem em massa para seus assinantes."
                : "Abra o perfil de um criador e toque em Mensagem para começar."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-alt">
            {inbox.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mensagens/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface"
                >
                  <Avatar path={c.otherAvatar} name={c.otherName} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate type-body-strong text-ink",
                          c.unread > 0 && "text-accent-text",
                        )}
                      >
                        {c.otherName}
                      </span>
                      {c.iAmCreator && <span className="type-caption text-ink-muted">· fã</span>}
                    </p>
                    <p
                      className={cn(
                        "truncate type-caption",
                        c.unread ? "font-semibold text-ink" : "text-ink-muted",
                      )}
                    >
                      {c.preview}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {c.lastAt && (
                      <time dateTime={c.lastAt} className="type-caption text-ink-muted">
                        {formatRelative(c.lastAt)}
                      </time>
                    )}
                    {c.unread > 0 && (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 type-caption font-bold text-white"
                        aria-label={`${c.unread} não lidas`}
                      >
                        {c.unread}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
