import Link from "next/link";
import { BadgeCheck, Crown, Gift, Lock, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/domain/Avatar";
import { Badge, buttonClasses } from "@/components/ui";
import { checkoutHref } from "@/features/commerce/constants";
import { TipButton } from "@/features/commerce/TipModal";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { formatBRL, formatDuration, formatMediaCount, VISIBILITY_LABEL } from "./constants";
import { LikeButton, ReportButton } from "./interactions";
import type { FeedPost, PostMedia } from "./queries";

export function MediaGallery({ media, className }: { media: PostMedia[]; className?: string }) {
  if (media.length === 0) return null;
  const single = media.length === 1;
  return (
    <div
      className={cn(
        "grid gap-1 overflow-hidden rounded-md border border-border",
        single ? "grid-cols-1" : "grid-cols-2",
        className,
      )}
    >
      {media.map((m, i) =>
        m.kind === "video" ? (
          // URL assinada curta; sem download direto pelo menu nativo.
          <video
            key={m.url}
            src={m.url}
            poster={m.posterUrl ?? undefined}
            controls
            playsInline
            preload="none"
            controlsList="nodownload"
            aria-label={`Vídeo ${i + 1} de ${media.length}${m.duration ? `, ${formatDuration(m.duration)}` : ""}`}
            className={cn(
              "w-full bg-black object-contain",
              single ? "max-h-[640px]" : "aspect-square",
            )}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração
          <img
            key={m.url}
            src={m.url}
            alt={`Foto ${i + 1} de ${media.length}`}
            width={m.width ?? undefined}
            height={m.height ?? undefined}
            loading="lazy"
            className={cn(
              "w-full bg-surface-alt object-cover",
              single ? "max-h-[640px]" : "aspect-square",
            )}
          />
        ),
      )}
    </div>
  );
}

/** Placeholder de conteúdo bloqueado: não usa miniatura nem URL da mídia (só a contagem). */
export function LockedMedia({ post }: { post: FeedPost }) {
  const ppv = post.visibility === "ppv";
  return (
    <div className="relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-md border border-border bg-[radial-gradient(80%_80%_at_50%_35%,var(--brand-deep),var(--surface)_85%)] p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        {ppv ? (
          <Lock className="size-8 text-accent" aria-hidden strokeWidth={1.6} />
        ) : (
          <Crown className="size-8 text-accent" aria-hidden strokeWidth={1.6} />
        )}
        <p className="type-body-strong text-ink">
          {ppv ? `Desbloqueie por ${formatBRL(post.priceCents)}` : "Conteúdo para assinantes"}
        </p>
        <p className="type-caption text-ink-muted">
          {formatMediaCount(post.mediaCount - post.videoCount, post.videoCount)} · a mídia só é
          carregada depois do acesso liberado
        </p>
        <Link
          href={ppv ? checkoutHref("ppv", post.id) : checkoutHref("assinatura", post.creatorId)}
          className={`${buttonClasses("primary", "md")} mt-2`}
        >
          {ppv ? <Lock className="size-4" aria-hidden /> : <Crown className="size-4" aria-hidden />}
          {ppv ? `Desbloquear por ${formatBRL(post.priceCents)}` : "Assinar para ver"}
        </Link>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  loggedIn,
  verified = true,
  linkToPost = true,
  viewerId,
}: {
  post: FeedPost;
  loggedIn: boolean;
  verified?: boolean;
  linkToPost?: boolean;
  /** Quem está vendo: o próprio criador não vê o botão de mimo nos seus posts. */
  viewerId?: string | null;
}) {
  const canGift = viewerId !== post.creatorId;
  const name = post.displayName || post.handle;
  const badgeTone = post.visibility === "free" ? "neutral" : "accent";
  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface-alt p-4 md:p-5">
      <header className="flex items-center gap-3">
        <Link href={`/${post.handle}`} aria-hidden tabIndex={-1}>
          <Avatar path={post.avatarPath} name={name} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/${post.handle}`}
            className="flex items-center gap-1.5 type-body-strong text-ink hover:underline"
          >
            <span className="truncate">{name}</span>
            {verified && (
              <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="verificado" />
            )}
          </Link>
          <p className="type-caption text-ink-muted">
            @{post.handle}
            {post.publishedAt && (
              <>
                {" · "}
                <time dateTime={post.publishedAt}>{formatRelative(post.publishedAt)}</time>
              </>
            )}
          </p>
        </div>
        <Badge tone={badgeTone}>
          {post.visibility === "ppv"
            ? `PPV · ${formatBRL(post.priceCents)}`
            : VISIBILITY_LABEL[post.visibility]}
        </Badge>
      </header>

      {post.body && <p className="whitespace-pre-line type-body text-ink">{post.body}</p>}

      {post.mediaCount > 0 &&
        (post.unlocked ? <MediaGallery media={post.media} /> : <LockedMedia post={post} />)}

      <footer className="-ml-3 flex flex-wrap items-center gap-1">
        <LikeButton
          postId={post.id}
          liked={post.likedByMe}
          count={post.likeCount}
          loggedIn={loggedIn}
        />
        {linkToPost ? (
          <Link
            href={`/p/${post.id}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 type-label text-ink-muted hover:text-ink"
            aria-label={`${post.commentCount} comentários. Abrir publicação`}
          >
            <MessageCircle className="size-5" aria-hidden />
            {post.commentCount}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center gap-2 px-3 type-label text-ink-muted">
            <MessageCircle className="size-5" aria-hidden />
            {post.commentCount}
          </span>
        )}
        {canGift &&
          (loggedIn ? (
            <TipButton
              creator={{
                id: post.creatorId,
                name,
                handle: post.handle,
                avatarPath: post.avatarPath,
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 type-label text-ink-muted hover:text-accent-text"
            />
          ) : (
            <Link
              href={checkoutHref("mimo", post.creatorId)}
              className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 type-label text-ink-muted hover:text-accent-text"
              aria-label={`Enviar um mimo para ${name}`}
            >
              <Gift className="size-5" aria-hidden />
              Mimo
            </Link>
          ))}
        <span className="ml-auto">
          <ReportButton targetType="post" targetId={post.id} loggedIn={loggedIn} />
        </span>
      </footer>
    </article>
  );
}
