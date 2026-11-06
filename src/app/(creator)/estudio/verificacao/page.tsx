import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui";
import { VerificationStatusBadge } from "@/components/domain/VerificationStatusBadge";
import { AppealForm, VerificationForm } from "@/features/creators/VerificationForm";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Verificação de criador" };

export default async function Page() {
  const user = await requireUser("/estudio/verificacao");
  const supabase = await createServerSupabase();
  const { data: latest } = await supabase
    .from("creator_verifications")
    .select("id, status, submitted_at, decided_at, decision_reason, appealed_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <AppShell user={user} active="/estudio">
      <PageHeader
        eyebrow="Creator Studio"
        title="Verificação de identidade"
        description="Para publicar conteúdo e receber pagamentos, confirmamos sua identidade e maioridade. É obrigatório por lei e protege você e seus fãs."
      />
      {latest && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Status da sua verificação</CardTitle>
            <VerificationStatusBadge status={latest.status} />
          </div>
          <dl className="mt-3 grid gap-1 type-caption text-ink-muted">
            <div>Enviada em {formatDateTime(latest.submitted_at)}</div>
            {latest.decided_at && <div>Decidida em {formatDateTime(latest.decided_at)}</div>}
          </dl>
          {latest.decision_reason && latest.status !== "approved" && (
            <div className="mt-3">
              <Alert tone="error" title="Motivo">
                {latest.decision_reason}
              </Alert>
            </div>
          )}
          {latest.status === "pending" && (
            <p className="mt-3 type-body text-ink-muted">
              Nossa equipe está analisando seus documentos. Você será avisado da decisão.
            </p>
          )}
          {latest.status === "approved" && (
            <p className="mt-3 type-body text-ink-muted">
              Tudo certo! A publicação de conteúdo chega na próxima etapa da plataforma.
            </p>
          )}
          {latest.status === "rejected" && <AppealForm verificationId={latest.id} />}
        </Card>
      )}
      {(!latest || latest.status === "rejected") && (
        <section aria-labelledby="nova-verificacao">
          <h2 id="nova-verificacao" className="mb-4 type-feature-title text-ink">
            {latest ? "Ou envie uma nova verificação" : "Enviar documentos"}
          </h2>
          <VerificationForm userId={user.id} />
        </section>
      )}
    </AppShell>
  );
}
