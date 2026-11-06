import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/domain/Avatar";
import { EmptyState } from "@/components/ui";
import { BANNER_BUCKET, publicImageUrl } from "@/features/content/constants";
import { FollowButton } from "@/features/content/interactions";
import { CATEGORIES } from "./categories";

export interface CreatorSummary {
  id: string | null;
  handle: string | null;
  display_name: string | null;
  is_creator: boolean | null;
  avatar_path?: string | null;
  banner_path?: string | null;
  categories?: string[] | null;
}

/** Grade de criadores (canvas Explorar): capa, avatar, nome verificado, categoria e Seguir. */
export function CreatorGrid({
  creators,
  emptyTitle,
  emptyDescription,
  followed,
  viewerId,
}: {
  creators: CreatorSummary[];
  emptyTitle: string;
  emptyDescription?: string;
  followed?: Set<string>;
  viewerId?: string;
}) {
  if (creators.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {creators.map((c) => {
        const name = c.display_name || c.handle || "";
        const banner = publicImageUrl(BANNER_BUCKET, c.banner_path);
        const category = CATEGORIES.find((k) => k.slug === c.categories?.[0])?.label;
        return (
          <li
            key={c.handle}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-alt"
          >
            <div className="h-24 bg-[radial-gradient(80%_120%_at_50%_0%,var(--brand-deep),var(--surface))]">
              {banner && (
                // eslint-disable-next-line @next/next/no-img-element -- banner público
                <img src={banner} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </div>
            <div className="-mt-8 flex flex-1 flex-col gap-3 p-4 pt-0">
              <Avatar
                path={c.avatar_path}
                name={name}
                size="lg"
                className="border-4 border-surface-alt"
              />
              <div className="min-w-0">
                <Link
                  href={`/${c.handle}`}
                  className="flex items-center gap-1.5 type-body-strong text-ink hover:underline"
                >
                  <span className="truncate">{name}</span>
                  {c.is_creator && (
                    <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="verificado" />
                  )}
                </Link>
                <p className="truncate type-caption text-ink-muted">
                  @{c.handle}
                  {category && ` · ${category}`}
                </p>
              </div>
              {c.id && c.id !== viewerId && (
                <div className="mt-auto">
                  <FollowButton
                    creatorId={c.id}
                    following={followed?.has(c.id) ?? false}
                    loggedIn={Boolean(viewerId)}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
