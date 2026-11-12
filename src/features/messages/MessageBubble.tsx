import Link from "next/link";
import { Lock, Trash2 } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { formatBRL } from "@/features/content/constants";
import { checkoutHref } from "@/features/commerce/constants";
import { deleteMessageAction } from "./actions";
import type { ChatMessage } from "./queries";

export function MessageBubble({
  message: m,
  conversationId,
}: {
  message: ChatMessage;
  conversationId: string;
}) {
  const paid = m.priceCents != null;
  return (
    <li className={cn("flex flex-col gap-1", m.mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2 rounded-lg px-4 py-3 md:max-w-[70%]",
          m.mine ? "bg-accent text-white" : "border border-border bg-surface-alt text-ink",
        )}
      >
        {m.deleted ? (
          <p className="type-body italic opacity-70">Mensagem apagada</p>
        ) : (
          <>
            {m.body && <p className="whitespace-pre-line type-body">{m.body}</p>}
            {m.media.length > 0 && (
              <div className={cn("grid gap-2", m.media.length > 1 && "grid-cols-2")}>
                {m.media.map((x, i) =>
                  x.kind === "video" ? (
                    <video
                      key={i}
                      src={x.url}
                      poster={x.posterUrl ?? undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-80 w-full rounded-md bg-black"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração
                    <img
                      key={i}
                      src={x.url}
                      alt={`Foto ${i + 1} da mensagem`}
                      width={x.width ?? undefined}
                      height={x.height ?? undefined}
                      className="max-h-80 w-full rounded-md object-cover"
                    />
                  ),
                )}
              </div>
            )}
            {paid && !m.unlocked && (
              <div className="flex flex-col items-start gap-2 rounded-md border border-accent bg-surface p-3">
                <p className="flex items-center gap-2 type-label font-semibold text-ink">
                  <Lock className="size-4 text-accent" aria-hidden />
                  Conteúdo exclusivo
                  {m.mediaCount > 0 &&
                    ` · ${m.mediaCount} ${m.mediaCount === 1 ? "arquivo" : "arquivos"}`}
                </p>
                <Link
                  href={checkoutHref("mensagem", m.id)}
                  className={buttonClasses("primary", "sm")}
                >
                  Desbloquear por {formatBRL(m.priceCents)}
                </Link>
              </div>
            )}
            {paid && m.mine && (
              <p className="type-caption opacity-80">Mensagem paga · {formatBRL(m.priceCents)}</p>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 px-1 type-caption text-ink-muted">
        <time dateTime={m.createdAt}>{formatRelative(m.createdAt)}</time>
        {paid && !m.mine && m.unlocked && <span>· desbloqueada</span>}
        {m.mine && !m.deleted && (
          <form action={deleteMessageAction}>
            <input type="hidden" name="messageId" value={m.id} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <button type="submit" aria-label="Apagar mensagem" className="hover:text-danger">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
