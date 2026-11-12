import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/features/identity/forms";
import { CreatorDetailsForm, ProfileImages, SocialsForm } from "@/features/identity/ProfileExtras";
import { parseSocials } from "@/features/identity/socials";
import { TelegramCard, type TelegramNotice } from "@/features/telegram/TelegramCard";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { telegramConfig } from "@/server/telegram/config";

export const metadata: Metadata = { title: "Meu perfil" };

/** Bot ligado? Env malformado (zod lança) conta como desligado. */
function telegramEnabled(): boolean {
  try {
    return telegramConfig() !== null;
  } catch {
    return false;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ telegram?: string }>;
}) {
  const user = await requireUser("/conta/perfil");
  const supabase = await createServerSupabase();
  const { telegram } = await searchParams;
  const notice: TelegramNotice =
    telegram === "sem-consentimento" || telegram === "erro" ? telegram : null;
  const showTelegram = telegramEnabled();
  const { data: telegramLink } = showTelegram
    ? await supabase
        .from("telegram_links")
        .select("telegram_username")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "handle, display_name, bio, visibility, avatar_path, banner_path, categories, links, socials, creator_type",
    )
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
        <SocialsForm socials={parseSocials(profile?.socials)} />
        {isCreator && (
          <CreatorDetailsForm
            creatorType={profile?.creator_type ?? null}
            categories={profile?.categories ?? []}
            links={profile?.links ?? []}
          />
        )}
        {showTelegram && (
          <TelegramCard
            linked={telegramLink ? { username: telegramLink.telegram_username } : null}
            notice={notice}
          />
        )}
      </div>
    </AppShell>
  );
}
