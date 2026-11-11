import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, buttonClasses, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { cancelSubscriptionAction } from "@/features/commerce/actions";
import {
  ORDER_KIND_LABEL,
  ORDER_STATUS,
  type OrderKind,
  type OrderStatus,
} from "@/features/commerce/constants";

export const metadata: Metadata = { title: "Biblioteca" };

const TABS = [
  { aba: "", label: "Pacotes" },
  { aba: "ppv", label: "PPV" },
  { aba: "assinaturas", label: "Assinaturas" },
  { aba: "pedidos", label: "Pedidos" },
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireUser("/biblioteca");
  const { aba = "" } = await searchParams;
  const tab = TABS.find((t) => t.aba === aba)?.aba ?? "";
  const supabase = await createServerSupabase();

  const [{ data: orders }, { data: entitlements }, { data: subs }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, kind, target_id, creator_id, description, gross_cents, status, method, created_at, paid_at",
      )
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("entitlements")
      .select("order_id, kind, target_id, revoked_at")
      .eq("user_id", user.id),
    supabase
      .from("subscriptions")
      .select("creator_id, price_cents, status, current_period_end, cancel_at_period_end")
      .eq("fan_id", user.id)
      .order("current_period_end", { ascending: false }),
  ]);
  const active = new Map(
    (entitlements ?? []).filter((e) => !e.revoked_at).map((e) => [e.order_id, e]),
  );
  const creatorIds = [
    ...new Set([
      ...(orders ?? []).map((o) => o.creator_id),
      ...(subs ?? []).map((s) => s.creator_id),
    ]),
  ];
  const { data: creators } = creatorIds.length
    ? await supabase.from("public_profiles").select("id, handle, display_name").in("id", creatorIds)
    : {
        data: [] as Array<{
          id: string | null;
          handle: string | null;
          display_name: string | null;
        }>,
      };
  const creatorBy = new Map((creators ?? []).map((c) => [c.id, c]));
  const creatorName = (id: string) => {
    const c = creatorBy.get(id);
    return c?.display_name || c?.handle || "Criador";
  };

  const owned = (kind: OrderKind) =>
    (orders ?? []).filter((o) => o.kind === kind && o.status === "paid" && active.has(o.id));

  return (
    <AppShell user={user} active="/biblioteca">
      <PageHeader
        title="Biblioteca"
        description="Tudo o que você comprou, sempre na versão adquirida."
      />
      <div className="mb-6">
        <LinkTabs
          items={TABS.map((t) => ({
            href: t.aba ? `/biblioteca?aba=${t.aba}` : "/biblioteca",
            label: t.label,
          }))}
          active={tab ? `/biblioteca?aba=${tab}` : "/biblioteca"}
        />
      </div>

      {tab === "" &&
        (owned("package").length === 0 ? (
          <EmptyState
            title="Nenhum pacote comprado"
            description="Os pacotes que você comprar ficam aqui, na versão adquirida."
            action={
              <Link href="/explorar" className={buttonClasses("outline", "sm")}>
                Explorar criadores
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {owned("package").map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-4"
              >
                <Badge tone="success">Liberado</Badge>
                <div>
                  <h2 className="type-body-strong text-ink">
                    {o.description.replace(/^Pacote · /, "")}
                  </h2>
                  <p className="type-caption text-ink-muted">
                    {creatorName(o.creator_id)} · comprado em {formatDate(o.paid_at)}
                  </p>
                </div>
                <Link
                  href={`/biblioteca/pacote/${o.target_id}`}
                  className={`${buttonClasses("primary", "sm")} mt-auto self-start`}
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {tab === "ppv" &&
        (owned("ppv").length === 0 ? (
          <EmptyState
            title="Nenhum PPV desbloqueado"
            description="Publicações que você desbloquear ficam aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {owned("ppv").map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="type-label text-ink">{o.description.replace(/^PPV · /, "")}</p>
                  <p className="type-caption text-ink-muted">
                    {creatorName(o.creator_id)} · {formatDate(o.paid_at)}
                  </p>
                </div>
                <Link href={`/p/${o.target_id}`} className={buttonClasses("secondary", "sm")}>
                  Ver publicação
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {tab === "assinaturas" &&
        ((subs ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma assinatura"
            description="Assine criadores para ver as publicações exclusivas."
          />
        ) : (
          <Table caption="Suas assinaturas" minWidth={640}>
            <THead columns={["Criador", "Valor", "Situação", "Ações"]} />
            <tbody>
              {(subs ?? []).map((s) => {
                const valid = new Date(s.current_period_end) > new Date();
                const c = creatorBy.get(s.creator_id);
                return (
                  <Tr key={s.creator_id}>
                    <Td>
                      <Link
                        href={`/${c?.handle ?? ""}`}
                        className="font-semibold text-ink hover:underline"
                      >
                        {creatorName(s.creator_id)}
                      </Link>
                    </Td>
                    <Td nowrap>{formatBRL(s.price_cents)}/mês</Td>
                    <Td>
                      {!valid || s.status === "expired" ? (
                        <Badge>Encerrada</Badge>
                      ) : s.status === "canceled" ? (
                        <Badge tone="warning">
                          Cancelada · acesso até {formatDate(s.current_period_end)}
                        </Badge>
                      ) : (
                        <Badge tone="success">
                          Ativa · renova em {formatDate(s.current_period_end)}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {valid && s.status === "active" ? (
                        <form action={cancelSubscriptionAction}>
                          <input type="hidden" name="creatorId" value={s.creator_id} />
                          <button type="submit" className={buttonClasses("ghost", "sm")}>
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <Link
                          href={`/checkout?tipo=assinatura&id=${s.creator_id}`}
                          className={buttonClasses("secondary", "sm")}
                        >
                          {valid ? "Renovar" : "Assinar de novo"}
                        </Link>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ))}

      {tab === "pedidos" &&
        ((orders ?? []).length === 0 ? (
          <EmptyState title="Nenhum pedido ainda" />
        ) : (
          <Table caption="Seus pedidos" minWidth={760}>
            <THead columns={["Data", "Descrição", "Tipo", "Valor", "Status"]} />
            <tbody>
              {(orders ?? []).map((o) => (
                <Tr key={o.id}>
                  <Td nowrap>{formatDateTime(o.created_at)}</Td>
                  <Td>
                    <Link href={`/pedido/${o.id}`} className="text-ink hover:underline">
                      {o.description}
                    </Link>
                    <span className="block type-caption text-ink-muted">
                      {creatorName(o.creator_id)}
                    </span>
                  </Td>
                  <Td nowrap>{ORDER_KIND_LABEL[o.kind as OrderKind]}</Td>
                  <Td nowrap>{formatBRL(o.gross_cents)}</Td>
                  <Td>
                    <Badge tone={ORDER_STATUS[o.status as OrderStatus].tone}>
                      {ORDER_STATUS[o.status as OrderStatus].label}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ))}
    </AppShell>
  );
}
