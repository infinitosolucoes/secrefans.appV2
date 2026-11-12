import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { MessageComposer } from "@/features/messages/MessageComposer";
import { getBroadcasts } from "@/features/messages/queries";

export const metadata: Metadata = { title: "Mensagem em massa" };

export default async function Page() {
  const user = await requireRole(["creator"], "/mensagens/massa");
  const supabase = await createServerSupabase();
  const [broadcasts, { count }] = await Promise.all([
    getBroadcasts(user.id),
    supabase
      .from("subscriptions")
      .select("fan_id", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .in("status", ["active", "canceled"])
      .gt("current_period_end", new Date().toISOString()),
  ]);

  return (
    <AppShell user={user} active="/mensagens">
      <Link href="/mensagens" className="type-label text-accent-text hover:underline">
        ← Mensagens
      </Link>
      <PageHeader
        title="Mensagem em massa"
        description={`Chega na conversa de cada assinante ativo (${count ?? 0} hoje). Pode ter fotos, vídeos e ser paga. Um envio a cada 10 minutos.`}
      />
      <div className="flex max-w-3xl flex-col gap-8">
        <MessageComposer userId={user.id} canAttach mode="broadcast" />

        <section>
          <h2 className="mb-3 type-body-strong text-ink">Envios anteriores</h2>
          {broadcasts.length === 0 ? (
            <p className="type-body text-ink-muted">Nenhum envio ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-alt">
              {broadcasts.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <p className="min-w-0 flex-1 truncate type-body text-ink">
                    {b.body || "(só mídia)"}
                  </p>
                  {b.price_cents != null && (
                    <span className="type-caption font-semibold text-accent-text">
                      Paga · {formatBRL(b.price_cents)}
                    </span>
                  )}
                  <span className="type-caption text-ink-muted">
                    {b.recipients} assinante{b.recipients === 1 ? "" : "s"} ·{" "}
                    {formatDateTime(b.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
