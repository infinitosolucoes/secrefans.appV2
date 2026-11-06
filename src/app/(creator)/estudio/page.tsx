import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { buttonClasses, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Creator Studio" };

export default async function Page() {
  const user = await requireUser("/estudio");
  const isCreator = user.roles.includes("creator");
  return (
    <AppShell user={user} active="/estudio">
      <PageHeader eyebrow="Para criadores" title="Creator Studio" />
      {!isCreator ? (
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            title="Publicações"
            description="Upload e publicação de fotos e vídeos chegam na S2/S3."
          />
          <EmptyState
            title="Pacotes"
            description="Pacotes de fotos e vídeos com preço definido por você chegam na S3."
          />
          <EmptyState
            title="Comissão"
            description="A regra de comissão vigente será exibida aqui (S4)."
          />
          <EmptyState
            title="Financeiro"
            description="Vendas, extrato e transferências dependem do parceiro de pagamentos."
          />
        </div>
      )}
    </AppShell>
  );
}
