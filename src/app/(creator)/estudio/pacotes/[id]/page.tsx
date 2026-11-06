import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/server/auth/session";
import { UUID_RE } from "@/features/content/constants";
import { PackageEditor, type PackageEditorInitial } from "@/features/packages/PackageEditor";
import { getPackageForEdit } from "@/features/packages/queries";

export const metadata: Metadata = { title: "Editor de pacote · Studio" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["creator"], `/estudio/pacotes/${id}`);

  let initial: PackageEditorInitial;
  if (id === "novo") {
    initial = {
      packageId: randomUUID(),
      isNew: true,
      hasPublished: false,
      version: 1,
      title: "",
      description: "",
      category: null,
      priceCents: null,
      audience: "all",
      coverPath: null,
      items: [],
    };
  } else {
    if (!UUID_RE.test(id)) notFound();
    const pkg = await getPackageForEdit(id, user.id);
    if (!pkg || pkg.status === "removed") notFound();
    initial = { ...pkg, packageId: pkg.id, isNew: false };
  }

  return (
    <AppShell user={user} active="/estudio">
      <Link href="/estudio/pacotes" className="type-label text-accent-text hover:underline">
        ← Pacotes
      </Link>
      <PageHeader
        eyebrow="Studio"
        title={initial.isNew ? "Novo pacote" : "Editar pacote"}
        description={
          initial.isNew
            ? "Monte o pacote, defina o preço e publique."
            : `${initial.title} · ${initial.hasPublished ? "publicado" : "rascunho"} · versão ${initial.version}`
        }
      />
      <PackageEditor userId={user.id} initial={initial} />
    </AppShell>
  );
}
