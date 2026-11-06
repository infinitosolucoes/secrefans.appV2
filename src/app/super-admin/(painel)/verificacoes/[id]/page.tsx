import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui";
import { VerificationStatusBadge } from "@/components/domain/VerificationStatusBadge";
import { DecisionForm, DocumentButton } from "@/features/super-admin/forms";
import { ageOn } from "@/features/creators/verification";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { hasPermission } from "@/server/authorization/roles";
import { formatCivilDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Verificação · Admin" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffMfa("verifications.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createServerSupabase();
  const { data: v } = await supabase
    .from("creator_verifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name")
    .eq("id", v.user_id)
    .maybeSingle();

  const docs = [
    { label: "Documento (frente)", path: v.document_front_path },
    { label: "Documento (verso)", path: v.document_back_path },
    { label: "Selfie com documento", path: v.selfie_path },
  ].filter((d): d is { label: string; path: string } => Boolean(d.path));

  const canDecide = hasPermission(staff.roles, "verifications.decide") && v.user_id !== staff.id;
  const canOpenDocs = hasPermission(staff.roles, "verification_documents.read");

  return (
    <>
      <PageHeader
        eyebrow="Verificação"
        title={v.legal_name}
        description={profile ? `@${profile.handle}` : undefined}
        actions={<VerificationStatusBadge status={v.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Dados enviados</CardTitle>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-label">
            <dt className="text-ink-muted">Nascimento</dt>
            <dd>
              {formatCivilDate(v.birth_date)} ({ageOn(v.birth_date)} anos)
            </dd>
            <dt className="text-ink-muted">Enviada em</dt>
            <dd>{formatDateTime(v.submitted_at)}</dd>
            {v.decided_at && (
              <>
                <dt className="text-ink-muted">Decidida em</dt>
                <dd>{formatDateTime(v.decided_at)}</dd>
                <dt className="text-ink-muted">Motivo</dt>
                <dd>{v.decision_reason}</dd>
              </>
            )}
            <dt className="text-ink-muted">Usuário</dt>
            <dd>
              <Link
                href={`/super-admin/usuarios/${v.user_id}`}
                className="text-accent-text hover:underline"
              >
                Ver conta
              </Link>
            </dd>
          </dl>
          {v.appeal_text && (
            <div className="mt-4">
              <Alert title={`Recurso (${formatDateTime(v.appealed_at)})`}>{v.appeal_text}</Alert>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Documentos</CardTitle>
          {canOpenDocs ? (
            <>
              <p className="mt-2 type-caption text-ink-muted">
                Cada abertura gera um link de 60 segundos e um registro na auditoria.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {docs.map((d) => (
                  <DocumentButton
                    key={d.path}
                    verificationId={v.id}
                    path={d.path}
                    label={d.label}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 type-body text-ink-muted">Seu papel não permite abrir documentos.</p>
          )}
        </Card>

        {canDecide && (
          <Card className="lg:col-span-2">
            <CardTitle>Decisão</CardTitle>
            <div className="mt-3">
              <DecisionForm verificationId={v.id} status={v.status} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
