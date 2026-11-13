import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { ORDER_KIND_LABEL, ORDER_STATUS } from "@/features/commerce/constants";
import { CreatorWallet } from "@/features/commerce/CreatorWallet";

export const metadata: Metadata = { title: "Carteira" };

/** Carteira: criador vê saldo, chave Pix e saques; todos veem as próprias compras. */
export default async function Page() {
  const user = await requireUser("/carteira");
  const isCreator = user.roles.includes("creator");
  const supabase = await createServerSupabase();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, kind, description, gross_cents, status, method, created_at")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const paid = (orders ?? []).filter((o) => o.status === "paid");
  const total = paid.reduce((s, o) => s + o.gross_cents, 0);

  return (
    <AppShell user={user} active="/carteira">
      <PageHeader
        eyebrow="Carteira"
        title={isCreator ? "Carteira" : "Minhas compras"}
        description={
          isCreator
            ? "Seu saldo na Secretfans, saques por Pix e as suas compras."
            : "Assinaturas, conteúdos, mimos e mensagens pagas. Cada compra é paga direto por Pix ou cartão."
        }
      />
      {isCreator && (
        <div className="mb-10 flex max-w-3xl flex-col gap-5">
          <CreatorWallet userId={user.id} mfa={user.hasMfaFactor} />
        </div>
      )}
      {isCreator && <h2 className="mb-3 type-body-strong text-ink">Minhas compras</h2>}
      <p className="mb-6 type-body text-ink-muted">
        Total confirmado: <strong className="text-ink">{formatBRL(total)}</strong> em {paid.length}{" "}
        compra(s).
      </p>
      {orders?.length ? (
        <Table caption="Minhas compras">
          <THead columns={["Data", "Compra", "Tipo", "Valor", "Situação", ""]} />
          <tbody>
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status as keyof typeof ORDER_STATUS];
              return (
                <Tr key={o.id}>
                  <Td>{formatDateTime(o.created_at)}</Td>
                  <Td>{o.description}</Td>
                  <Td>{ORDER_KIND_LABEL[o.kind as keyof typeof ORDER_KIND_LABEL] ?? o.kind}</Td>
                  <Td>{formatBRL(o.gross_cents)}</Td>
                  <Td>
                    <Badge tone={st?.tone ?? "neutral"}>{st?.label ?? o.status}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/pedido/${o.id}`} className="text-accent-text underline">
                      Detalhes
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState
          title="Nenhuma compra ainda"
          description="Quando você assinar um criador ou comprar um conteúdo, ele aparece aqui."
        />
      )}
    </AppShell>
  );
}
