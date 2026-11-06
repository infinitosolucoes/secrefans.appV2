import { AtSign } from "lucide-react";
import { SOCIAL_NETWORKS, type Socials } from "./socials";

/** Redes sociais do perfil público como pílulas de link (abrem em nova aba, sem repassar referência). */
export function SocialLinks({ socials }: { socials: Socials }) {
  const items = SOCIAL_NETWORKS.filter((n) => socials[n.key]);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Redes sociais">
      {items.map((n) => (
        <li key={n.key}>
          <a
            href={n.url(socials[n.key]!)}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border px-3 type-caption font-semibold text-ink-muted hover:border-accent hover:text-accent-text"
          >
            <AtSign className="size-3.5" aria-hidden />
            <span>
              {n.label}: {socials[n.key]}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
