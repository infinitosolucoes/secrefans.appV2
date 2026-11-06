import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { VerificationStatusBadge } from "@/components/domain/VerificationStatusBadge";
import { AccountStatusForm, RoleForm } from "@/features/super-admin/forms";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { hasPermission, ROLE_LABELS } from "@/server/authorization/roles";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Usuário · Admin" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffMfa("users.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createServerSupabase();
  const canAudit = hasPermission(staff.roles, "audit.read");
  const [{ data: rows }, { data: verifications }, audit] = await Promise.all([
    supabase.rpc("admin_get_user", { p_user_id: id }),
    supabase
      .from("creator_verifications")
      .select("id, status, submitted_at, decided_at")
      .eq("user_id", id)
      .order("submitted_at", { ascending: false }),
    canAudit
      ? supabase
          .from("admin_audit_logs")
          .select("id, action, reason, created_at")
          .eq("target_id", id)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
  ]);
  const user = rows?.[0];
  if (!user) notFound();
  const isSelf = user.id === staff.id;

  return (
    <>
      <PageHeader eyebrow="Usuários" title={`@${user.handle}`} description={user.display_name} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Dados da conta</CardTitle>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-label">
            <dt className="text-ink-muted">E-mail</dt>
            <dd className="break-all">{user.email}</dd>
            <dt className="text-ink-muted">Status</dt>
            <dd>
              <Badge tone={user.status === "active" ? "success" : "danger"}>
                {user.status === "active" ? "Ativa" : "Bloqueada"}
              </Badge>
            </dd>
            <dt className="text-ink-muted">Papéis</dt>
            <dd className="flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <Badge key={r}>{ROLE_LABELS[r]}</Badge>
              ))}
            </dd>
            <dt className="text-ink-muted">Intenção de criador</dt>
            <dd>{user.creator_intent ? "Sim" : "Não"}</dd>
            <dt className="text-ink-muted">Criada em</dt>
            <dd>{formatDateTime(user.created_at)}</dd>
            <dt className="text-ink-muted">Último login</dt>
            <dd>{formatDateTime(user.last_sign_in_at)}</dd>
          </dl>
        </Card>

        <Card>
          <CardTitle>Verificações</CardTitle>
          {verifications && verifications.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {verifications.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/super-admin/verificacoes/${v.id}`}
                    className="type-label text-accent-text hover:underline"
                  >
                    {formatDateTime(v.submitted_at)}
                  </Link>
                  <VerificationStatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 type-body text-ink-muted">Nenhuma verificação enviada.</p>
          )}
        </Card>

        {hasPermission(staff.roles, "roles.manage") && !isSelf && (
          <Card>
            <CardTitle>Papéis</CardTitle>
            <div className="mt-3">
              <RoleForm userId={user.id} currentRoles={user.roles} />
            </div>
          </Card>
        )}

        {hasPermission(staff.roles, "users.manage") && !isSelf && (
          <Card>
            <CardTitle>Status da conta</CardTitle>
            <div className="mt-3">
              <AccountStatusForm userId={user.id} status={user.status} />
            </div>
          </Card>
        )}

        {audit.data && (
          <Card className="lg:col-span-2">
            <CardTitle>Auditoria recente</CardTitle>
            {audit.data.length === 0 ? (
              <p className="mt-3 type-body text-ink-muted">Sem eventos.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 type-label">
                {audit.data.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-x-3">
                    <span className="text-ink-muted">{formatDateTime(a.created_at)}</span>
                    <code className="text-accent-text">{a.action}</code>
                    {a.reason && <span className="text-ink-muted">— {a.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
