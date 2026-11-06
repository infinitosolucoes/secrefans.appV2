import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, PageHeader } from "@/components/ui";
import { CreatorGrid } from "@/features/discovery/CreatorGrid";
import { getFollowedIds } from "@/features/content/queries";
import { getSessionUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Criadores" };

export default async function Page() {
  const supabase = await createServerSupabase();
  const [user, { data, error }] = await Promise.all([
    getSessionUser(),
    supabase
      .from("public_profiles")
      .select("id, handle, display_name, is_creator, avatar_path, banner_path, categories")
      .eq("is_creator", true)
      .order("created_at", { ascending: false })
      .limit(96),
  ]);
  const followed = await getFollowedIds(user?.id);
  return (
    <AppShell user={user} active="/criadores">
      <PageHeader
        eyebrow="Comunidade"
        title="Criadores"
        description="Todos os criadores verificados da Secretfans."
      />
      {error ? (
        <Alert tone="error">Não foi possível carregar os criadores.</Alert>
      ) : (
        <CreatorGrid
          creators={data ?? []}
          followed={followed}
          viewerId={user?.id}
          emptyTitle="Nenhum criador verificado ainda"
          emptyDescription="Criadores aparecem aqui depois da verificação de identidade."
        />
      )}
    </AppShell>
  );
}
