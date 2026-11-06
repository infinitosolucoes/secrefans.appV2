import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui";
import { createServerSupabase } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Super Admin" };

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_dashboard_counts");
  const counts = data?.[0];

  // Somente números reais do banco; GMV/receita aparecem quando houver transações conciliadas (S5+).
  const tiles = [
    { label: "Usuários", value: counts?.users_total, href: "/super-admin/usuarios" },
    { label: "Criadores aprovados", value: counts?.creators_total, href: "/super-admin/usuarios" },
    {
      label: "Verificações pendentes",
      value: counts?.pending_verifications,
      href: "/super-admin/verificacoes",
    },
    {
      label: "Eventos de auditoria (24h)",
      value: counts?.audit_events_24h,
      href: "/super-admin/auditoria",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Visão geral"
        description="Indicadores operacionais reais. Indicadores financeiros entram com o módulo de pagamentos."
      />
      {erro === "sem-permissao" && (
        <div className="mb-4">
          <Alert tone="error">Seu papel não tem permissão para aquela área.</Alert>
        </div>
      )}
      {error ? (
        <Alert tone="error" title="Não foi possível carregar os indicadores" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="rounded-lg">
              <Card className="h-full hover:border-accent">
                <p className="type-caption text-ink-muted">{t.label}</p>
                <p className="mt-1 type-hero text-[40px] text-ink tabular-nums">{t.value ?? "—"}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
