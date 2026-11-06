import type { Metadata } from "next";
import {
  Alert,
  Button,
  EmptyState,
  Input,
  PageHeader,
  Table,
  Td,
  THead,
  Tr,
} from "@/components/ui";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Auditoria · Admin" };

export default async function Page({ searchParams }: { searchParams: Promise<{ acao?: string }> }) {
  await requireStaffMfa("audit.read");
  const { acao = "" } = await searchParams;
  const supabase = await createServerSupabase();
  let query = supabase
    .from("admin_audit_logs")
    .select("id, actor_id, action, target_type, target_id, reason, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (acao) query = query.ilike("action", `${acao.replace(/[%_]/g, "")}%`);
  const { data, error } = await query;

  const actorIds = [
    ...new Set((data ?? []).map((a) => a.actor_id).filter((x): x is string => Boolean(x))),
  ];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, handle").in("id", actorIds)
    : { data: [] as Array<{ id: string; handle: string }> };
  const handleOf = new Map((actors ?? []).map((p) => [p.id, p.handle]));

  return (
    <>
      <PageHeader
        eyebrow="Governança"
        title="Trilha de auditoria"
        description="Registros imutáveis. Últimos 100 eventos."
      />
      <form className="mb-4 flex gap-2" role="search">
        <label htmlFor="acao" className="sr-only">
          Filtrar por ação
        </label>
        <Input
          id="acao"
          name="acao"
          defaultValue={acao}
          placeholder="Filtrar por ação (ex.: role., verification.)"
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {error && <Alert tone="error">Não foi possível carregar a auditoria.</Alert>}
      {data && data.length === 0 && <EmptyState title="Nenhum evento" />}
      {data && data.length > 0 && (
        <Table caption="Eventos de auditoria" minWidth={720}>
          <THead columns={["Quando", "Autor", "Ação", "Alvo", "Motivo"]} />
          <tbody>
            {data.map((a) => (
              <Tr key={a.id}>
                <Td muted nowrap>
                  {formatDateTime(a.created_at)}
                </Td>
                <Td>
                  {a.actor_id
                    ? `@${handleOf.get(a.actor_id) ?? a.actor_id.slice(0, 8)}`
                    : "sistema"}
                </Td>
                <Td>
                  <code className="text-accent-text">{a.action}</code>
                </Td>
                <Td muted>
                  {a.target_type}
                  {a.target_id ? ` · ${a.target_id.slice(0, 8)}` : ""}
                </Td>
                <Td muted>{a.reason ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
