import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/domain/Avatar";
import { Alert } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { UUID_RE } from "@/features/content/constants";
import { ReportButton } from "@/features/content/interactions";
import { toggleBlockAction } from "@/features/messages/actions";
import { MessageBubble } from "@/features/messages/MessageBubble";
import { MessageComposer } from "@/features/messages/MessageComposer";
import { getConversation } from "@/features/messages/queries";
import { RealtimeRefresher } from "@/features/messages/RealtimeRefresher";

export const metadata: Metadata = { title: "Conversa", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const user = await requireUser(`/mensagens/${id}`);
  const conv = await getConversation(id, user.id);
  if (!conv) notFound();

  return (
    <AppShell user={user} active="/mensagens">
      <RealtimeRefresher conversationId={conv.id} />
      <div className="flex max-w-3xl flex-col gap-4">
        <Link href="/mensagens" className="type-label text-accent-text hover:underline">
          ← Mensagens
        </Link>
        <header className="flex items-center gap-3 rounded-lg border border-border bg-surface-alt p-3">
          <Avatar path={conv.other.avatar} name={conv.other.name} />
          <div className="min-w-0 flex-1">
            {conv.other.handle ? (
              <Link
                href={`/${conv.other.handle}`}
                className="type-body-strong text-ink hover:underline"
              >
                {conv.other.name}
              </Link>
            ) : (
              <p className="type-body-strong text-ink">{conv.other.name}</p>
            )}
            {conv.other.handle && (
              <p className="type-caption text-ink-muted">@{conv.other.handle}</p>
            )}
          </div>
          <form action={toggleBlockAction}>
            <input type="hidden" name="otherId" value={conv.other.id} />
            <input type="hidden" name="conversationId" value={conv.id} />
            <input type="hidden" name="block" value={conv.blockedByMe ? "0" : "1"} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 type-caption text-ink-muted hover:text-danger"
            >
              <Ban className="size-4" aria-hidden />
              {conv.blockedByMe ? "Desbloquear" : "Bloquear"}
            </button>
          </form>
          <ReportButton targetType="profile" targetId={conv.other.id} loggedIn />
        </header>

        {conv.messages.length === 0 ? (
          <p className="py-8 text-center type-body text-ink-muted">
            Diga olá! As mensagens são privadas entre vocês dois.
          </p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Mensagens da conversa">
            {conv.messages.map((m) => (
              <MessageBubble key={m.id} message={m} conversationId={conv.id} />
            ))}
          </ol>
        )}

        {conv.blockedByMe ? (
          <Alert tone="info">Você bloqueou esta pessoa. Desbloqueie para voltar a conversar.</Alert>
        ) : (
          <MessageComposer userId={user.id} conversationId={conv.id} canAttach={conv.iAmCreator} />
        )}
      </div>
    </AppShell>
  );
}
