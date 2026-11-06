import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Assinaturas" };

export default async function Page() {
  const user = await requireUser("/assinaturas");
  return (
    <AppShell user={user} active="/assinaturas">
      <ComingSoon title="Assinaturas" sprint="S4" description="Suas assinaturas de criadores" />
    </AppShell>
  );
}
