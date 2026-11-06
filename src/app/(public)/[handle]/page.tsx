import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { BrandArt, EmptyState } from "@/components/ui";
import { UrlField } from "@/components/ui/UrlField";
import { publicEnv } from "@/lib/env";
import { createServerSupabase } from "@/server/auth/supabase";
import { getSessionUser } from "@/server/auth/session";

const HANDLE = /^[a-z0-9_.]{3,30}$/;

async function loadProfile(handle: string) {
  if (!HANDLE.test(handle)) return null;
  const supabase = await createServerSupabase();
  // Somente a view pública: nunca colunas privadas de profiles.
  const { data } = await supabase
    .from("public_profiles")
    .select("handle, display_name, bio, is_creator")
    .eq("handle", handle)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(decodeURIComponent(handle).toLowerCase());
  return {
    title: profile
      ? `${profile.display_name || profile.handle} (@${profile.handle})`
      : "Perfil não encontrado",
  };
}

export default async function PublicProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [profile, user] = await Promise.all([
    loadProfile(decodeURIComponent(handle).toLowerCase()),
    getSessionUser(),
  ]);
  if (!profile) notFound();
  const profileUrl = `${publicEnv().NEXT_PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}/${profile.handle}`;
  return (
    <AppShell user={user}>
      <div
        className="relative h-36 overflow-hidden rounded-lg border border-border md:h-52"
        aria-hidden
      >
        <BrandArt className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface/80 to-transparent" />
      </div>
      <div className="relative -mt-10 px-4">
        <div
          className="grid size-20 place-items-center rounded-full border-4 border-surface bg-brand-deep text-2xl font-extrabold text-accent-text shadow-glow-sm"
          aria-hidden
        >
          {(profile.display_name || profile.handle || "?").charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-4 flex items-center gap-2 type-heading text-ink">
          {profile.display_name || profile.handle}
          {profile.is_creator && (
            <BadgeCheck className="size-6 text-accent" aria-label="Criador verificado" />
          )}
        </h1>
        <p className="type-label text-ink-muted">@{profile.handle}</p>
        {profile.bio && (
          <p className="mt-4 max-w-2xl whitespace-pre-line type-body text-ink">{profile.bio}</p>
        )}
        <div className="mt-6 max-w-md">
          <UrlField url={profileUrl} />
        </div>
      </div>
      <div className="mt-10">
        <EmptyState
          title="Nenhuma publicação ainda"
          description="As publicações chegam na próxima etapa da plataforma."
        />
      </div>
    </AppShell>
  );
}
