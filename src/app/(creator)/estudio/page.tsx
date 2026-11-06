import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Alert,
  Badge,
  buttonClasses,
  Card,
  CardTitle,
  EmptyState,
  LinkTabs,
  PageHeader,
} from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { deleteDraftAction, setPostStatusAction } from "@/features/content/actions";
import {
  formatBRL,
  STATUS_LABEL,
  VISIBILITY_LABEL,
  type PostStatus,
  type PostVisibility,
} from "@/features/content/constants";

export const metadata: Metadata = { title: "Creator Studio" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const user = await requireUser("/estudio");
  const { salvo } = await searchParams;
  const isCreator = user.roles.includes("creator");

  if (!isCreator)
    return (
      <AppShell user={user} active="/estudio">
        <PageHeader eyebrow="Para criadores" title="Creator Studio" />
        <Card>
          <Lock className="mb-2 size-6 text-accent-text" aria-hidden />
          <CardTitle>Verifique sua identidade para começar</CardTitle>
          <p className="mt-2 type-body text-ink-muted">
            Publicação, pacotes e recebimentos ficam bloqueados até a aprovação da sua verificação.
          </p>
          <Link href="/estudio/verificacao" className={`${buttonClasses("primary", "md")} mt-4`}>
            Iniciar verificação
          </Link>
        </Card>
      </AppShell>
    );

  const supabase = await createServerSupabase();
  const [{ data: posts }, { data: stats }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, body, visibility, price_cents, status, published_at, created_at, removed_reason, post_media(count)",
      )
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("creator_stats", { p_creator_id: user.id }).single(),
  ]);
  const list = posts ?? [];

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Studio"
        title={`Olá, ${user.displayName || user.handle}`}
        description="Suas publicações e o resumo do seu perfil."
        actions={
          <Link href="/estudio/publicar" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" aria-hidden />
            Nova publicação
          </Link>
        }
      />
      {salvo && (
        <div className="mb-6">
          <Alert tone="success">Publicação salva.</Alert>
        </div>
      )}

      <dl className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Seguidores", value: stats?.followers ?? 0 },
          { label: "Publicações no ar", value: stats?.posts ?? 0 },
          { label: "Rascunhos", value: list.filter((p) => p.status === "draft").length },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface-alt p-5">
            <dt className="type-caption text-ink-muted">{s.label}</dt>
            <dd className="mt-1 text-3xl font-extrabold text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-6">
        <LinkTabs
          items={[
            { href: "/estudio", label: "Publicações" },
            { href: "/estudio/pacotes", label: "Pacotes" },
          ]}
          active="/estudio"
        />
      </div>
      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação ainda"
          description="Publique fotos grátis para atrair seguidores, ou deixe posts prontos para assinantes e PPV."
          action={
            <Link href="/estudio/publicar" className={buttonClasses("outline", "sm")}>
              Criar a primeira
            </Link>
          }
        />
      ) : (
        <Table caption="Suas publicações" minWidth={760}>
          <THead columns={["Publicação", "Tipo", "Status", "Data", "Ações"]} />
          <tbody>
            {list.map((p) => {
              const status = p.status as PostStatus;
              const mediaCount =
                (p.post_media as unknown as Array<{ count: number }>)[0]?.count ?? 0;
              return (
                <Tr key={p.id}>
                  <Td>
                    <span className="line-clamp-2 max-w-md text-ink">
                      {p.body || <span className="text-ink-muted">(sem texto)</span>}
                    </span>
                    <span className="block type-caption text-ink-muted">
                      {mediaCount} {mediaCount === 1 ? "arquivo" : "arquivos"}
                    </span>
                  </Td>
                  <Td>
                    {p.visibility === "ppv"
                      ? `PPV · ${formatBRL(p.price_cents)}`
                      : VISIBILITY_LABEL[p.visibility as PostVisibility]}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        status === "published"
                          ? "success"
                          : status === "removed"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {STATUS_LABEL[status]}
                    </Badge>
                    {status === "removed" && p.removed_reason && (
                      <p className="mt-1 max-w-xs type-caption text-ink-muted">
                        Motivo: {p.removed_reason}
                      </p>
                    )}
                  </Td>
                  <Td nowrap>{formatDateTime(p.published_at ?? p.created_at)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {status === "published" && (
                        <>
                          <Link href={`/p/${p.id}`} className={buttonClasses("ghost", "sm")}>
                            Ver
                          </Link>
                          <form action={setPostStatusAction}>
                            <input type="hidden" name="postId" value={p.id} />
                            <input type="hidden" name="status" value="draft" />
                            <button type="submit" className={buttonClasses("secondary", "sm")}>
                              Despublicar
                            </button>
                          </form>
                        </>
                      )}
                      {status === "draft" && (
                        <>
                          <form action={setPostStatusAction}>
                            <input type="hidden" name="postId" value={p.id} />
                            <input type="hidden" name="status" value="published" />
                            <button type="submit" className={buttonClasses("primary", "sm")}>
                              Publicar
                            </button>
                          </form>
                          <form action={deleteDraftAction}>
                            <input type="hidden" name="postId" value={p.id} />
                            <button type="submit" className={buttonClasses("danger", "sm")}>
                              Excluir
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </AppShell>
  );
}
