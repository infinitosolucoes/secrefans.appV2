import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/features/identity/forms";
import { CreatorDetailsForm, ProfileImages } from "@/features/identity/ProfileExtras";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function Page() {
  const user = await requireUser("/conta/perfil");
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, display_name, bio, visibility, avatar_path, banner_path, categories, links")
    .eq("id", user.id)
    .single();
  const isCreator = user.roles.includes("creator") || user.creatorIntent;
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
      <div className="flex flex-col gap-12">
        <ProfileImages
          userId={user.id}
          name={profile?.display_name || user.handle}
          avatarPath={profile?.avatar_path ?? null}
          bannerPath={profile?.banner_path ?? null}
        />
        <section aria-labelledby="dados" className="flex flex-col gap-4">
          <h2 id="dados" className="type-feature-title text-ink">
            Dados do perfil
          </h2>
          <ProfileForm
            initial={{
              handle: profile?.handle ?? user.handle,
              displayName: profile?.display_name ?? "",
              bio: profile?.bio ?? "",
              visibility: profile?.visibility ?? "public",
            }}
          />
        </section>
        {isCreator && (
          <CreatorDetailsForm categories={profile?.categories ?? []} links={profile?.links ?? []} />
        )}
      </div>
    </AppShell>
  );
}
