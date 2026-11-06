import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, CategoryTile, PageHeader, SearchPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CreatorGrid } from "@/features/discovery/CreatorGrid";
import {
  CATEGORIES,
  CREATOR_TYPES,
  creatorTypeLabel,
  explorarHref,
} from "@/features/discovery/categories";
import { getFollowedIds } from "@/features/content/queries";
import { getSessionUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Explorar" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; tipo?: string }>;
}) {
  const { q = "", categoria = "todos", tipo = "" } = await searchParams;
  const term = q
    .trim()
    .slice(0, 60)
    .replace(/[%_,()]/g, "");
  const activeCategory = CATEGORIES.some((c) => c.slug === categoria) ? categoria : "todos";
  const activeType = CREATOR_TYPES.some((t) => t.slug === tipo) ? tipo : "";
  const supabase = await createServerSupabase();

  let query = supabase
    .from("public_profiles")
    .select(
      "id, handle, display_name, is_creator, avatar_path, banner_path, categories, creator_type",
    )
    .eq("is_creator", true)
    .order("created_at", { ascending: false })
    .limit(48);
  if (term) query = query.or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`);
  if (activeCategory !== "todos") query = query.contains("categories", [activeCategory]);
  if (activeType) query = query.eq("creator_type", activeType);

  const [user, { data, error }] = await Promise.all([getSessionUser(), query]);
  const followed = await getFollowedIds(user?.id);
  const categoryLabel =
    activeCategory !== "todos" ? CATEGORIES.find((c) => c.slug === activeCategory)?.label : null;
  const typeLabel = creatorTypeLabel(activeType);
  const filterLabel = [typeLabel, categoryLabel].filter(Boolean).join(" · ");

  const typeChip = (slug: string, label: string) => (
    <Link
      key={slug || "todos"}
      href={explorarHref({
        categoria: activeCategory,
        tipo: slug || undefined,
        q: term || undefined,
      })}
      aria-current={activeType === slug ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-pill border px-4 type-label transition",
        activeType === slug
          ? "border-accent text-accent-text shadow-glow-sm"
          : "border-border text-ink-muted hover:border-ink-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );

  return (
    <AppShell user={user} active="/explorar">
      <PageHeader
        eyebrow="Descoberta"
        title="Explorar"
        description="Descubra criadores verificados por tipo de perfil e categoria."
      />
      <SearchPill className="mb-6 max-w-none md:hidden" defaultValue={q} />
      <nav aria-label="Tipo de perfil" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {typeChip("", "Todos os perfis")}
        {CREATOR_TYPES.map((t) => typeChip(t.slug, t.label))}
      </nav>
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2">
        {CATEGORIES.map((c) => (
          <CategoryTile
            key={c.slug}
            href={explorarHref({
              categoria: c.slug,
              tipo: activeType || undefined,
              q: term || undefined,
            })}
            icon={c.icon}
            label={c.label}
            active={c.slug === activeCategory}
          />
        ))}
      </div>
      <h2 className="mb-4 type-heading text-ink">
        {term ? `Resultados para "${term}"` : filterLabel || "Criadores em alta"}
      </h2>
      {error ? (
        <Alert tone="error">Não foi possível carregar os criadores.</Alert>
      ) : (
        <CreatorGrid
          creators={data ?? []}
          followed={followed}
          viewerId={user?.id}
          emptyTitle={
            term
              ? `Nenhum criador encontrado para "${term}"`
              : filterLabel
                ? `Nenhum criador em ${filterLabel} ainda`
                : "Nenhum criador verificado ainda"
          }
          emptyDescription="Criadores aparecem aqui depois da verificação de identidade."
        />
      )}
    </AppShell>
  );
}
