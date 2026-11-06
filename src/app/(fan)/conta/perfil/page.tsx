import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/features/identity/forms";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function Page() {
  const user = await requireUser("/conta/perfil");
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, bio, visibility")
    .eq("id", user.id)
    .single();
  return (
    <AppShell user={user} active="/conta/perfil">
      <PageHeader
        eyebrow="Conta"
        title="Meu perfil"
        description="Estas informações aparecem no seu perfil público."
        actions={
          <Link href={`/${user.handle}`} className="type-label text-accent-text hover:underline">
            Ver perfil público →
          </Link>
        }
      />
      <ProfileForm
        initial={{
          handle: profile?.handle ?? user.handle,
          displayName: profile?.display_name ?? "",
          bio: profile?.bio ?? "",
          visibility: profile?.visibility ?? "public",
        }}
      />
    </AppShell>
  );
}
