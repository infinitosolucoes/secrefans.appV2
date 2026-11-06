import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, buttonClasses, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL, formatMediaCount } from "@/features/content/constants";
import { deletePackageDraftAction, setPackageStatusAction } from "@/features/packages/actions";

export const metadata: Metadata = { title: "Pacotes · Studio" };

const STATUS = {
  draft: { label: "Rascunho", tone: "neutral" },
  published: { label: "Publicado", tone: "success" },
  archived: { label: "Arquivado", tone: "warning" },
  removed: { label: "Retirado pela moderação", tone: "danger" },
} as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const user = await requireRole(["creator"], "/estudio/pacotes");
  const { salvo } = await searchParams;
  const supabase = await createServerSupabase();
  const { data: packages } = await supabase
    .from("packages")
    .select(
      "id, status, current_version_id, updated_at, removed_reason, package_versions!package_versions_package_id_fkey(id, version, status, title, price_cents, package_items(kind))",
    )
    .eq("creator_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  const rows = (packages ?? []).map((p) => {
    const versions = p.package_versions ?? [];
    const draft = versions.find((v) => v.status === "draft");
    const published = versions.find((v) => v.status === "published");
    const shown = draft ?? published ?? versions[0];
    const items = shown?.package_items ?? [];
    return {
      id: p.id,
      status: p.status as keyof typeof STATUS,
      everPublished: Boolean(p.current_version_id),
      title: shown?.title ?? "(sem título)",
      price: shown?.price_cents ?? 0,
      photos: items.filter((i) => i.kind === "image").length,
      videos: items.filter((i) => i.kind === "video").length,
      publishedVersion: published?.version,
      draftVersion: draft?.version,
      updatedAt: p.updated_at,
      removedReason: p.removed_reason,
    };
  });

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Studio"
        title="Pacotes"
        description="Pacotes de fotos e vídeos com preço definido por você."
        actions={
          <Link href="/estudio/pacotes/novo" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" aria-hidden />
            Novo pacote
          </Link>
        }
      />
      <div className="mb-6">
        <LinkTabs
          items={[
            { href: "/estudio", label: "Publicações" },
            { href: "/estudio/pacotes", label: "Pacotes" },
          ]}
          active="/estudio/pacotes"
        />
      </div>
      {salvo && (
        <div className="mb-6">
          <Alert tone="success">
            {salvo === "publicado" ? "Pacote publicado." : "Rascunho do pacote salvo."}
          </Alert>
        </div>
      )}
      <Alert tone="info">
        A venda de pacotes começa com os pagamentos (S4). Até lá, os pacotes publicados aparecem na
        vitrine do seu perfil com o botão de compra desativado.
      </Alert>
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhum pacote ainda"
            description="Monte um pacote com fotos e vídeos, defina o preço e publique."
            action={
              <Link href="/estudio/pacotes/novo" className={buttonClasses("outline", "sm")}>
                Criar o primeiro pacote
              </Link>
            }
          />
        ) : (
          <Table caption="Seus pacotes" minWidth={820}>
            <THead columns={["Pacote", "Preço", "Status", "Versão", "Atualizado", "Ações"]} />
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span className="block font-semibold text-ink">{r.title}</span>
                    <span className="block type-caption text-ink-muted">
                      {formatMediaCount(r.photos, r.videos)}
                    </span>
                  </Td>
                  <Td nowrap>{formatBRL(r.price)}</Td>
                  <Td>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    {r.status === "removed" && r.removedReason && (
                      <p className="mt-1 max-w-xs type-caption text-ink-muted">
                        Motivo: {r.removedReason}
                      </p>
                    )}
                  </Td>
                  <Td nowrap>
                    {r.publishedVersion ? `v${r.publishedVersion}` : "—"}
                    {r.draftVersion && (
                      <span className="block type-caption text-ink-muted">
                        rascunho v{r.draftVersion}
                      </span>
                    )}
                  </Td>
                  <Td nowrap>{formatDateTime(r.updatedAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "removed" && (
                        <Link
                          href={`/estudio/pacotes/${r.id}`}
                          className={buttonClasses("secondary", "sm")}
                        >
                          Editar
                        </Link>
                      )}
                      {(r.status === "published" || r.status === "archived") && (
                        <form action={setPackageStatusAction}>
                          <input type="hidden" name="packageId" value={r.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={r.status === "published" ? "archived" : "published"}
                          />
                          <button type="submit" className={buttonClasses("ghost", "sm")}>
                            {r.status === "published" ? "Arquivar" : "Reativar"}
                          </button>
                        </form>
                      )}
                      {!r.everPublished && (
                        <form action={deletePackageDraftAction}>
                          <input type="hidden" name="packageId" value={r.id} />
                          <button type="submit" className={buttonClasses("danger", "sm")}>
                            Excluir
                          </button>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
