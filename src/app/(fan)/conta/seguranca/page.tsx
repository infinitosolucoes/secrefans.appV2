import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { MfaDisable } from "@/features/identity/MfaDisable";
import { MfaPanel } from "@/features/identity/MfaPanel";

export const metadata: Metadata = { title: "Segurança da conta" };

export default async function Page() {
  const user = await requireUser("/conta/seguranca");
  const isCreator = user.roles.includes("creator");
  return (
    <AppShell user={user} active="/conta/perfil">
      <PageHeader
        eyebrow="Conta"
        title="Segurança"
        description="Proteja sua conta com um código do celular além da senha."
      />
      <Card className="max-w-xl">
        <div className="flex flex-wrap items-center gap-3">
          <ShieldCheck className="size-6 text-accent" aria-hidden />
          <CardTitle>Verificação em duas etapas</CardTitle>
          <Badge tone={user.hasMfaFactor ? "success" : "neutral"}>
            {user.hasMfaFactor ? "Ativa" : "Desativada"}
          </Badge>
        </div>
        {user.hasMfaFactor ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="type-body text-ink-muted">
              A cada login pedimos o código de 6 dígitos do seu app autenticador. Se perder o
              celular, fale com o suporte para recuperar o acesso.
            </p>
            <MfaDisable />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p className="type-body text-ink-muted">
              Instale um app autenticador (Google Authenticator, Microsoft Authenticator, 1Password
              ou similar), escaneie o QR code e digite o código para ativar.
            </p>
            {isCreator && (
              <Alert tone="info">
                Recomendado para criadores: protege seus ganhos, sua chave Pix e seus saques.
              </Alert>
            )}
            <MfaPanel hasFactor={false} next="/conta/seguranca" />
          </div>
        )}
      </Card>
    </AppShell>
  );
}
