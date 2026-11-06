import { cn } from "@/lib/cn";
import { AVATAR_BUCKET, publicImageUrl } from "@/features/content/constants";

const sizes = {
  sm: "size-9 text-sm",
  md: "size-12 text-base",
  lg: "size-20 text-2xl",
  xl: "size-28 text-4xl",
} as const;

/** Avatar público do perfil, ou monograma sobre `brand-deep` quando não há foto. */
export function Avatar({
  path,
  name,
  size = "md",
  className,
}: {
  path: string | null | undefined;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const url = publicImageUrl(AVATAR_BUCKET, path);
  const base = cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-deep font-extrabold text-accent-text",
    sizes[size],
    className,
  );
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagem do storage com nome aleatório
      <img src={url} alt="" className={cn(base, "object-cover")} loading="lazy" />
    );
  return (
    <span aria-hidden className={base}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}
