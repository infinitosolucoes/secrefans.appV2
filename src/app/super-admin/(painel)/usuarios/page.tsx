import type { Metadata } from "next";
import Link from "next/link";
import {
  Alert,
  Badge,
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
import { ROLE_LABELS } from "@/server/authorization/roles";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Usuários · Admin" };
const PAGE = 50;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>;
}) {
  await requireStaffMfa("users.read");
  const { q = "", p = "0" } = await searchParams;
  const page = Math.max(0, Number.parseInt(p, 10) || 0);
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: q.slice(0, 100),
    p_limit: PAGE,
    p_offset: page * PAGE,
  });
  const total = data?.[0]?.total_count ?? 0;

  return (
    <>
      <PageHeader eyebrow="Admin" title="Usuários" description={`${total} resultado(s)`} />
      <form className="mb-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Buscar por handle, nome ou e-mail
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Buscar por handle, nome ou e-mail" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      {error && <Alert tone="error">Não foi possível carregar os usuários.</Alert>}
      {data && data.length === 0 && <EmptyState title="Nenhum usuário encontrado" />}
      {data && data.length > 0 && (
        <Table caption="Usuários">
          <THead columns={["Usuário", "E-mail", "Papéis", "Status", "Criado"]} />
          <tbody>
            {data.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <Link
                    href={`/super-admin/usuarios/${u.id}`}
                    className="text-accent-text hover:underline"
                  >
                    @{u.handle}
                  </Link>
                  <div className="type-caption text-ink-muted">{u.display_name}</div>
                </Td>
                <Td muted>{u.email}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r}>{ROLE_LABELS[r]}</Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  <Badge tone={u.status === "active" ? "success" : "danger"}>
                    {u.status === "active" ? "Ativa" : "Bloqueada"}
                  </Badge>
                </Td>
                <Td muted>{formatDate(u.created_at)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <nav aria-label="Paginação" className="mt-4 flex gap-4 type-label">
        {page > 0 && (
          <Link href={`?q=${encodeURIComponent(q)}&p=${page - 1}`} className="text-accent-text">
            ← Anterior
          </Link>
        )}
        {(page + 1) * PAGE < total && (
          <Link href={`?q=${encodeURIComponent(q)}&p=${page + 1}`} className="text-accent-text">
            Próxima →
          </Link>
        )}
      </nav>
    </>
  );
}
