import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Alert,
  Badge,
  buttonClasses,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/authorization/roles";

export const metadata: Metadata = { title: "Início" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; senha?: string }>;
}) {
  const user = await requireUser("/inicio");
  const { erro, senha } = await searchParams;
  return (
    <AppShell user={user} active="/inicio">
      <PageHeader
        eyebrow="Início"
        title={`Olá, ${user.displayName || user.handle}`}
        description="Seu feed aparece aqui quando você seguir criadores."
      />
      <div className="flex flex-col gap-4">
        {erro === "sem-permissao" && (
          <Alert tone="error" title="Acesso negado">
            Você não tem permissão para acessar aquela área.
          </Alert>
        )}
        {senha === "alterada" && (
          <Alert tone="success">Senha alterada. As outras sessões foram encerradas.</Alert>
        )}
        <Card>
          <CardTitle>Sua conta</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.roles.map((r) => (
              <Badge key={r} tone={r === "creator" ? "accent" : "neutral"}>
                {ROLE_LABELS[r]}
              </Badge>
            ))}
          </div>
          {user.creatorIntent && !user.roles.includes("creator") && (
            <p className="mt-4 type-body text-ink-muted">
              Para publicar e receber, conclua a verificação de identidade.{" "}
              <Link href="/estudio/verificacao" className="text-accent-text underline">
                Verificar agora
              </Link>
            </p>
          )}
        </Card>
        <EmptyState
          title="Seu feed está vazio"
          description="Feed, publicações e assinaturas chegam nas próximas etapas da plataforma."
          action={
            <Link href="/explorar" className={buttonClasses("outline", "sm")}>
              Explorar criadores
            </Link>
          }
        />
      </div>
    </AppShell>
  );
}
