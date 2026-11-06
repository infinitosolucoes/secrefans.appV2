import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, CategoryTile, PageHeader, SearchPill } from "@/components/ui";
import { CreatorGrid } from "@/features/discovery/CreatorGrid";
import { CATEGORIES, categoryHref } from "@/features/discovery/categories";
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
  const supabase = await createServerSupabase();

  let query = supabase
    .from("public_profiles")
    .select("handle, display_name, is_creator")
    .eq("is_creator", true)
    .order("created_at", { ascending: false })
    .limit(48);
  if (term) query = query.or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`);

  const [user, { data, error }] = await Promise.all([getSessionUser(), query]);
  const activeCategory = CATEGORIES.some((c) => c.slug === categoria) ? categoria : "todos";

  return (
    <AppShell user={user} active="/explorar">
      <PageHeader
        eyebrow="Descoberta"
        title="Explorar"
        description="Encontre criadores verificados."
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
      {activeCategory !== "todos" && (
        <div className="mb-6">
          <Alert tone="info">
            Filtro por categoria chega quando os criadores puderem classificar o perfil (S2).
            Mostrando todos.
          </Alert>
        </div>
      )}
      {error ? (
        <Alert tone="error">Não foi possível carregar os criadores.</Alert>
      ) : (
        <CreatorGrid
          creators={data ?? []}
          emptyTitle={
            term ? `Nenhum criador encontrado para "${term}"` : "Nenhum criador verificado ainda"
          }
          emptyDescription="Criadores aparecem aqui depois da verificação de identidade."
        />
      )}
    </AppShell>
  );
}
