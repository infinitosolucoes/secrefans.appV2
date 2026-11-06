import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, CategoryTile, PageHeader, SearchPill } from "@/components/ui";
import { CreatorGrid } from "@/features/discovery/CreatorGrid";
import { CATEGORIES, categoryHref } from "@/features/discovery/categories";
import { getFollowedIds } from "@/features/content/queries";
import { getSessionUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Explorar" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q = "", categoria = "todos" } = await searchParams;
  const term = q
    .trim()
    .slice(0, 60)
    .replace(/[%_,()]/g, "");
  const activeCategory = CATEGORIES.some((c) => c.slug === categoria) ? categoria : "todos";
  const supabase = await createServerSupabase();

  let query = supabase
    .from("public_profiles")
    .select("id, handle, display_name, is_creator, avatar_path, banner_path, categories")
    .eq("is_creator", true)
    .order("created_at", { ascending: false })
    .limit(48);
  if (term) query = query.or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`);
  if (activeCategory !== "todos") query = query.contains("categories", [activeCategory]);

  const [user, { data, error }] = await Promise.all([getSessionUser(), query]);
  const followed = await getFollowedIds(user?.id);
  const label = CATEGORIES.find((c) => c.slug === activeCategory)?.label;

  return (
    <AppShell user={user} active="/explorar">
      <PageHeader
        eyebrow="Descoberta"
        title="Explorar"
        description="Descubra criadores verificados por categoria."
      />
      <SearchPill className="mb-6 max-w-none md:hidden" defaultValue={q} />
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2">
        {CATEGORIES.map((c) => (
          <CategoryTile
            key={c.slug}
            href={categoryHref(c.slug)}
            icon={c.icon}
            label={c.label}
            active={c.slug === activeCategory}
          />
        ))}
      </div>
      <h2 className="mb-4 type-heading text-ink">
        {term
          ? `Resultados para "${term}"`
          : label && activeCategory !== "todos"
            ? label
            : "Criadores em alta"}
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
              : activeCategory !== "todos"
                ? `Nenhum criador em ${label} ainda`
                : "Nenhum criador verificado ainda"
          }
          emptyDescription="Criadores aparecem aqui depois da verificação de identidade."
        />
      )}
    </AppShell>
  );
}
