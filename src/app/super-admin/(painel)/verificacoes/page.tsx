import type { Metadata } from "next";
import Link from "next/link";
import { Alert, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { VerificationStatusBadge } from "@/components/domain/VerificationStatusBadge";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Verificações · Admin" };

const STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
const LABELS = {
  pending: "Pendentes",
  approved: "Aprovadas",
  rejected: "Rejeitadas",
  suspended: "Suspensas",
} as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaffMfa("verifications.read");
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? "pending";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("creator_verifications")
    .select("id, user_id, status, legal_name, submitted_at, appealed_at")
    .eq("status", status)
    .order("submitted_at", { ascending: status === "pending" })
    .limit(100);

  const ids = [...new Set((data ?? []).map((v) => v.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, handle").in("id", ids)
    : { data: [] as Array<{ id: string; handle: string }> };
  const handleOf = new Map((profiles ?? []).map((p) => [p.id, p.handle]));

  return (
    <>
      <PageHeader
        eyebrow="Moderação"
        title="Verificações de criadores"
        description="Fila FIFO. Toda decisão exige motivo e fica registrada."
      />
      <div className="mb-4">
        <LinkTabs
          items={STATUSES.map((s) => ({
            href: `/super-admin/verificacoes?status=${s}`,
            label: LABELS[s],
          }))}
          active={`/super-admin/verificacoes?status=${status}`}
        />
      </div>
      {error && <Alert tone="error">Não foi possível carregar a fila.</Alert>}
      {data && data.length === 0 && (
        <EmptyState title="Fila vazia" description="Nenhuma verificação com este status." />
      )}
      {data && data.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {data.map((v) => (
            <li key={v.id}>
              <Link
                href={`/super-admin/verificacoes/${v.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-alt"
              >
                <div>
                  <p className="type-label text-ink">{v.legal_name}</p>
                  <p className="type-caption text-ink-muted">
                    @{handleOf.get(v.user_id) ?? "—"} · enviada {formatDateTime(v.submitted_at)}
                    {v.appealed_at && " · recurso"}
                  </p>
                </div>
                <VerificationStatusBadge status={v.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
