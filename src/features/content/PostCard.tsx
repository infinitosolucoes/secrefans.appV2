import Link from "next/link";
import { BadgeCheck, Crown, Lock, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/domain/Avatar";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { formatBRL, VISIBILITY_LABEL } from "./constants";
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
      {media.map((m, i) => (
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
      ))}
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
          {post.mediaCount} {post.mediaCount === 1 ? "foto" : "fotos"} · a mídia só é carregada
          depois do acesso liberado
        </p>
        <span className="mt-2 inline-flex h-9 items-center rounded-pill border border-border px-4 type-caption font-semibold text-ink-muted">
          {ppv ? "Compra avulsa em breve" : "Assinaturas em breve"}
        </span>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  loggedIn,
  verified = true,
  linkToPost = true,
}: {
  post: FeedPost;
  loggedIn: boolean;
  verified?: boolean;
  linkToPost?: boolean;
}) {
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
        <span className="ml-auto">
          <ReportButton targetType="post" targetId={post.id} loggedIn={loggedIn} />
        </span>
      </footer>
    </article>
  );
}
