import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { hasPermission } from "@/server/authorization/roles";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import {
  REPORT_REASON_LABEL,
  STATUS_LABEL,
  type PostStatus,
  type ReportReason,
} from "@/features/content/constants";
import { ReportDecisionForm } from "@/features/super-admin/ReportDecisionForm";

export const metadata: Metadata = { title: "Denúncias · Admin" };

const STATUSES = ["open", "resolved", "dismissed"] as const;
const LABELS = { open: "Abertas", resolved: "Procedentes", dismissed: "Arquivadas" } as const;
const TARGET_LABEL = {
  post: "Publicação",
  comment: "Comentário",
  profile: "Perfil",
  message: "Mensagem",
  telegram_message: "Mensagem do Telegram",
} as const;
const URGENT = new Set(["nao_consensual", "menor_de_idade", "violencia"]);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireStaffMfa("reports.read");
  const canDecide = hasPermission(user.roles, "reports.decide");
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? "open";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_id, reason, details, status, created_at, decided_at, decision_reason",
    )
    .eq("status", status)
    .order("created_at", { ascending: status === "open" })
    .limit(100);
  const reports = data ?? [];

  // Contexto de cada alvo (equipe com MFA lê posts/comentários pela RLS de moderação).
  const postIds = reports.filter((r) => r.target_type === "post").map((r) => r.target_id);
  const commentIds = reports.filter((r) => r.target_type === "comment").map((r) => r.target_id);
  const tgIds = reports.filter((r) => r.target_type === "telegram_message").map((r) => r.target_id);
  const [{ data: posts }, { data: comments }, { data: tgMessages }] = await Promise.all([
    postIds.length
      ? supabase.from("posts").select("id, body, status, creator_id").in("id", postIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; body: string; status: string; creator_id: string }>,
        }),
    commentIds.length
      ? supabase
          .from("post_comments")
          .select("id, body, status, post_id, author_id")
          .in("id", commentIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            body: string;
            status: string;
            post_id: string;
            author_id: string;
          }>,
        }),
    tgIds.length
      ? supabase
          .from("telegram_reported_messages")
          .select("id, author_telegram_user_id, author_user_id, text, has_media")
          .in("id", tgIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            author_telegram_user_id: number;
            author_user_id: string | null;
            text: string;
            has_media: boolean;
          }>,
        }),
  ]);
  const people = [
    ...reports.map((r) => r.reporter_id),
    ...reports.filter((r) => r.target_type === "profile").map((r) => r.target_id),
    ...(posts ?? []).map((p) => p.creator_id),
    ...(comments ?? []).map((c) => c.author_id),
    ...(tgMessages ?? []).flatMap((m) => (m.author_user_id ? [m.author_user_id] : [])),
  ];
  const { data: profiles } = people.length
    ? await supabase
        .from("profiles")
        .select("id, handle")
        .in("id", [...new Set(people)])
    : { data: [] as Array<{ id: string; handle: string }> };
  const handle = new Map((profiles ?? []).map((p) => [p.id, p.handle]));
  const postById = new Map((posts ?? []).map((p) => [p.id, p]));
  const commentById = new Map((comments ?? []).map((c) => [c.id, c]));
  const tgById = new Map((tgMessages ?? []).map((m) => [m.id, m]));

  return (
    <>
      <PageHeader
        eyebrow="Moderação"
        title="Denúncias"
        description="Casos graves primeiro. Toda decisão exige motivo e fica registrada na auditoria."
      />
      <div className="mb-4">
        <LinkTabs
          items={STATUSES.map((s) => ({
            href: `/super-admin/denuncias?status=${s}`,
            label: LABELS[s],
          }))}
          active={`/super-admin/denuncias?status=${status}`}
        />
      </div>
      {error && <Alert tone="error">Não foi possível carregar as denúncias.</Alert>}
      {!error && reports.length === 0 && (
        <EmptyState title="Nada por aqui" description="Nenhuma denúncia com este status." />
      )}
      <ul className="flex flex-col gap-4">
        {[...reports]
          .sort((a, b) => Number(URGENT.has(b.reason)) - Number(URGENT.has(a.reason)))
          .map((r) => {
            const post = r.target_type === "post" ? postById.get(r.target_id) : undefined;
            const comment = r.target_type === "comment" ? commentById.get(r.target_id) : undefined;
            const isTelegram = r.target_type === "telegram_message";
            const tg = isTelegram ? tgById.get(r.target_id) : undefined;
            const targetHandle =
              r.target_type === "profile"
                ? handle.get(r.target_id)
                : handle.get(post?.creator_id ?? comment?.author_id ?? tg?.author_user_id ?? "");
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={URGENT.has(r.reason) ? "danger" : "neutral"}>
                    {REPORT_REASON_LABEL[r.reason as ReportReason] ?? r.reason}
                  </Badge>
                  <Badge>{TARGET_LABEL[r.target_type]}</Badge>
                  <span className="type-caption text-ink-muted">
                    {formatDateTime(r.created_at)} · por @{handle.get(r.reporter_id) ?? "—"}
                  </span>
                </div>
                <div className="rounded-md border border-border bg-surface p-4">
                  <p className="type-caption text-ink-muted">
                    {targetHandle ? (
                      <Link href={`/${targetHandle}`} className="text-accent-text hover:underline">
                        @{targetHandle}
                      </Link>
                    ) : tg ? (
                      `Telegram id ${tg.author_telegram_user_id} (sem conta vinculada)`
                    ) : (
                      "conta indisponível"
                    )}
                    {tg?.has_media && " · contém mídia"}
                    {post && ` · ${STATUS_LABEL[post.status as PostStatus] ?? post.status}`}
                    {comment &&
                      ` · ${comment.status === "removed" ? "Comentário retirado" : "Comentário visível"}`}
                  </p>
                  {post && (
                    <>
                      <p className="mt-2 line-clamp-4 whitespace-pre-line type-body text-ink">
                        {post.body || "(sem texto)"}
                      </p>
                      <Link
                        href={`/p/${post.id}`}
                        className="mt-2 inline-block type-label text-accent-text hover:underline"
                      >
                        Abrir publicação →
                      </Link>
                    </>
                  )}
                  {comment && (
                    <p className="mt-2 whitespace-pre-line type-body text-ink">{comment.body}</p>
                  )}
                  {tg && (
                    <p className="mt-2 whitespace-pre-line type-body text-ink">
                      {tg.text || "(sem texto)"}
                    </p>
                  )}
                  {isTelegram && !tg && (
                    <p className="mt-2 type-body text-ink-muted">Mensagem não encontrada.</p>
                  )}
                </div>
                {r.details && (
                  <p className="type-body text-ink-muted">
                    <span className="text-ink">Detalhes do denunciante:</span> {r.details}
                  </p>
                )}
                {r.status === "open" ? (
                  canDecide ? (
                    <ReportDecisionForm
                      reportId={r.id}
                      canRemove={r.target_type !== "profile"}
                      telegram={isTelegram}
                    />
                  ) : (
                    <p className="type-caption text-ink-muted">Seu papel só permite consultar.</p>
                  )
                ) : (
                  <p className="type-caption text-ink-muted">
                    Decidida em {formatDateTime(r.decided_at)} · {r.decision_reason}
                  </p>
                )}
              </li>
            );
          })}
      </ul>
    </>
  );
}
