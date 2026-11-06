import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Mensagens" };

export default async function Page() {
  const user = await requireUser("/mensagens");
  return (
    <AppShell user={user} active="/mensagens">
      <ComingSoon title="Mensagens" sprint="S6" description="Mensagens privadas com criadores" />
    </AppShell>
  );
}
