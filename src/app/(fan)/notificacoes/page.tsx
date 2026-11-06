import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Notificações" };

export default async function Page() {
  const user = await requireUser("/notificacoes");
  return (
    <AppShell user={user} active="/notificacoes">
      <ComingSoon
        title="Notificações"
        sprint="S7"
        description="Notificações de compras, mensagens e verificações"
      />
    </AppShell>
  );
}
