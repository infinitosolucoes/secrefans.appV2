import Link from "next/link";
import { Crown, Images, Lock, Play } from "lucide-react";
import { formatMediaCount } from "./constants";
import type { FeedPost } from "./queries";

/**
 * Aba "Mídias" do perfil: grade de miniaturas das publicações com foto ou vídeo. Publicação
 * bloqueada vira um bloco com cadeado (nunca carrega URL da mídia); cada bloco abre a publicação.
 */
export function MediaGrid({ posts }: { posts: FeedPost[] }) {
  const withMedia = posts.filter((p) => p.mediaCount > 0);
  return (
    <ul aria-label="Mídias" className="grid grid-cols-3 gap-1 md:gap-2">
      {withMedia.map((p) => {
        const first = p.unlocked ? p.media[0] : undefined;
        const thumb = first ? (first.kind === "video" ? first.posterUrl : first.url) : null;
        const label = `${formatMediaCount(p.mediaCount - p.videoCount, p.videoCount)}${
          p.unlocked ? "" : p.visibility === "ppv" ? ", conteúdo pago" : ", para assinantes"
        }`;
        return (
          <li key={p.id}>
            <Link
              href={`/p/${p.id}`}
              aria-label={label}
              className="relative block aspect-square overflow-hidden rounded-md border border-border bg-[radial-gradient(80%_80%_at_50%_35%,var(--brand-deep),var(--surface)_85%)]"
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração
                <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 grid place-items-center">
                  {p.visibility === "ppv" ? (
                    <Lock className="size-7 text-accent" aria-hidden strokeWidth={1.6} />
                  ) : (
                    <Crown className="size-7 text-accent" aria-hidden strokeWidth={1.6} />
                  )}
                </span>
              )}
              <span className="absolute top-1.5 right-1.5 flex gap-1 text-white drop-shadow">
                {p.videoCount > 0 && <Play className="size-4 fill-white" aria-hidden />}
                {p.mediaCount > 1 && <Images className="size-4" aria-hidden />}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
