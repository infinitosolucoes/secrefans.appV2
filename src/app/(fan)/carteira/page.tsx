import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Carteira" };

export default async function Page() {
  const user = await requireUser("/carteira");
  return (
    <AppShell user={user} active="/carteira">
      <ComingSoon
        title="Carteira"
        sprint="S6"
        description="Saldo, extrato e histórico de compras, depois da ativação com o parceiro de pagamentos"
      />
    </AppShell>
  );
}
