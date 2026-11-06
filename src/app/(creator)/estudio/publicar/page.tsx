import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { Composer } from "@/features/content/Composer";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = { title: "Nova publicação" };

export default async function Page() {
  const user = await requireRole(["creator"], "/estudio/publicar");
  return (
    <AppShell user={user} active="/estudio">
      <Link href="/estudio" className="type-label text-accent-text hover:underline">
        ← Studio
      </Link>
      <PageHeader eyebrow="Studio" title="Nova publicação" />
      <Composer userId={user.id} />
    </AppShell>
  );
}
