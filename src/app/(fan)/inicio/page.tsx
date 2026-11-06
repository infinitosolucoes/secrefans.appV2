import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/domain/Avatar";
import { Alert, buttonClasses, EmptyState, LinkTabs } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { PostCard } from "@/features/content/PostCard";
import { FollowButton } from "@/features/content/interactions";
import { getFeed } from "@/features/content/queries";

export const metadata: Metadata = { title: "Feed" };

const TABS = [
  { tab: "seguindo", label: "Seguindo" },
  { tab: "para-voce", label: "Para você" },
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; senha?: string }>;
}) {
  const user = await requireUser("/inicio");
  const { aba, erro, senha } = await searchParams;
  const tab = aba === "para-voce" ? "para-voce" : "seguindo";
  const supabase = await createServerSupabase();

  const [{ posts, followingCount }, { data: suggestions }] = await Promise.all([
    getFeed({ tab, userId: user.id }),
    supabase
      .from("public_profiles")
      .select("id, handle, display_name, avatar_path")
      .eq("is_creator", true)
      .neq("id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const { data: myFollows } = await supabase
    .from("follows")
    .select("creator_id")
    .eq("follower_id", user.id);
  const followed = new Set((myFollows ?? []).map((f) => f.creator_id));
  const suggested = (suggestions ?? []).filter((s) => s.id && !followed.has(s.id)).slice(0, 4);
  const href = (t: string) => (t === "seguindo" ? "/inicio" : `/inicio?aba=${t}`);

  return (
    <AppShell user={user} active="/inicio">
      <div className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 type-heading text-ink">Feed</h1>
          <div className="mb-6">
            <LinkTabs
              items={TABS.map((t) => ({ href: href(t.tab), label: t.label }))}
              active={href(tab)}
            />
          </div>
          <div className="flex flex-col gap-4">
            {erro === "sem-permissao" && (
              <Alert tone="error" title="Acesso negado">
                Você não tem permissão para acessar aquela área.
              </Alert>
            )}
            {senha === "alterada" && (
              <Alert tone="success">Senha alterada. As outras sessões foram encerradas.</Alert>
            )}
            {user.creatorIntent && !user.roles.includes("creator") && (
              <Alert tone="info" title="Conclua sua verificação">
                Para publicar e receber, confirme sua identidade.{" "}
                <Link href="/estudio/verificacao" className="text-accent-text underline">
                  Verificar agora
                </Link>
              </Alert>
            )}
            {posts.length === 0 ? (
              <EmptyState
                title={
                  tab === "seguindo" && followingCount === 0
                    ? "Siga criadores para montar seu feed"
                    : "Nada por aqui ainda"
                }
                description={
                  tab === "seguindo"
                    ? "As publicações de quem você segue aparecem aqui."
                    : "Novas publicações dos criadores aparecem aqui."
                }
                action={
                  <Link href="/explorar" className={buttonClasses("outline", "sm")}>
                    Explorar criadores
                  </Link>
                }
              />
            ) : (
              posts.map((p) => <PostCard key={p.id} post={p} loggedIn />)
            )}
          </div>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-80" aria-label="Sugestões">
          {suggested.length > 0 && (
            <section className="rounded-lg border border-border bg-surface-alt p-5">
              <h2 className="mb-4 type-feature-title text-ink">Sugestões para você</h2>
              <ul className="flex flex-col gap-4">
                {suggested.map((s) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <Avatar
                      path={s.avatar_path}
                      name={s.display_name || s.handle || ""}
                      size="sm"
                    />
                    <Link href={`/${s.handle}`} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate type-label font-semibold text-ink">
                        {s.display_name || s.handle}
                      </span>
                      <span className="block truncate type-caption text-ink-muted">
                        @{s.handle}
                      </span>
                    </Link>
                    <FollowButton creatorId={s.id!} following={false} loggedIn />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-lg border border-border bg-surface-alt p-5">
            <h2 className="type-feature-title text-ink">Sua biblioteca</h2>
            <p className="mt-1 type-caption text-ink-muted">
              Tudo que você comprar fica salvo, na versão adquirida.
            </p>
            <Link href="/biblioteca" className={`${buttonClasses("outline", "sm", true)} mt-4`}>
              Abrir biblioteca
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
