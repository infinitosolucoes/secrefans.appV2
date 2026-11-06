import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Biblioteca" };

export default async function Page() {
  const user = await requireUser("/biblioteca");
  return (
    <AppShell user={user} active="/biblioteca">
      <ComingSoon
        title="Biblioteca"
        sprint="S3–S4"
        description="Pacotes, PPV e assinaturas que você comprou, sempre na versão adquirida"
      />
    </AppShell>
  );
}
