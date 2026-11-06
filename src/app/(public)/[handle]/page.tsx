import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/domain/Avatar";
import { BrandArt, buttonClasses, EmptyState, LinkTabs } from "@/components/ui";
import { UrlField } from "@/components/ui/UrlField";
import { publicEnv } from "@/lib/env";
import { createServerSupabase } from "@/server/auth/supabase";
import { getSessionUser } from "@/server/auth/session";
import { CATEGORIES, creatorTypeLabel, explorarHref } from "@/features/discovery/categories";
import { BANNER_BUCKET, publicImageUrl } from "@/features/content/constants";
import { PostCard } from "@/features/content/PostCard";
import { FollowButton, ReportButton } from "@/features/content/interactions";
import { PackageCard } from "@/features/packages/PackageCard";
import { SocialLinks } from "@/features/identity/SocialLinks";
import { parseSocials } from "@/features/identity/socials";
import { getCreatorPackages } from "@/features/packages/queries";
import { getCreatorPosts, isFollowing } from "@/features/content/queries";

const HANDLE = /^[a-z0-9_.]{3,30}$/;

async function loadProfile(handle: string) {
  if (!HANDLE.test(handle)) return null;
  const supabase = await createServerSupabase();
  // Somente a view pública: nunca colunas privadas de profiles.
  const { data } = await supabase
    .from("public_profiles")
    .select(
      "id, handle, display_name, bio, is_creator, avatar_path, banner_path, categories, links, socials, creator_type",
    )
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

export default async function PublicProfile({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const [{ handle }, { aba }] = await Promise.all([params, searchParams]);
  const [profile, user] = await Promise.all([
    loadProfile(decodeURIComponent(handle).toLowerCase()),
    getSessionUser(),
  ]);
  if (!profile || !profile.id || !profile.handle) notFound();

  const supabase = await createServerSupabase();
  const isOwner = user?.id === profile.id;
  const tab = aba === "sobre" ? "sobre" : aba === "pacotes" ? "pacotes" : "publicacoes";
  const [posts, packages, following, { data: stats }] = await Promise.all([
    profile.is_creator && tab === "publicacoes" ? getCreatorPosts(profile.id) : Promise.resolve([]),
    profile.is_creator && tab === "pacotes" ? getCreatorPackages(profile.id) : Promise.resolve([]),
    isFollowing(user?.id, profile.id),
    supabase.rpc("creator_stats", { p_creator_id: profile.id }).single(),
  ]);

  const name = profile.display_name || profile.handle;
  const bannerUrl = publicImageUrl(BANNER_BUCKET, profile.banner_path);
  const profileUrl = `${publicEnv().NEXT_PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}/${profile.handle}`;
  const base = `/${profile.handle}`;
  const categories = (profile.categories ?? [])
    .map((slug) => CATEGORIES.find((c) => c.slug === slug))
    .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c));
  const typeLabel = creatorTypeLabel(profile.creator_type);

  return (
    <AppShell user={user}>
      <div
        className="relative h-36 overflow-hidden rounded-lg border border-border md:h-56"
        aria-hidden
      >
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- banner público do perfil
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <BrandArt className="h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface/80 to-transparent" />
      </div>

      <section className="relative -mt-12 flex flex-col gap-4 px-2 md:flex-row md:items-end md:px-4">
        <Avatar
          path={profile.avatar_path}
          name={name}
          size="xl"
          className="border-4 border-surface shadow-glow-sm"
        />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 type-heading text-ink">
            <span className="truncate">{name}</span>
            {profile.is_creator && (
              <BadgeCheck className="size-6 shrink-0 text-accent" aria-label="Criador verificado" />
            )}
          </h1>
          <p className="type-label text-ink-muted">@{profile.handle}</p>
          {profile.is_creator && (typeLabel || categories.length > 0) && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tipo de perfil e categorias">
              {typeLabel && (
                <li>
                  <Link
                    href={explorarHref({ tipo: profile.creator_type ?? undefined })}
                    className="inline-flex h-7 items-center rounded-pill border border-accent px-3 type-caption font-semibold text-accent-text hover:bg-surface-alt"
                  >
                    {typeLabel}
                  </Link>
                </li>
              )}
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={explorarHref({ categoria: c.slug })}
                    className="inline-flex h-7 items-center rounded-pill border border-border px-3 type-caption text-ink-muted hover:border-ink-muted hover:text-ink"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {profile.is_creator && (
            <p className="mt-1 type-caption text-ink-muted">
              <strong className="text-ink">{stats?.posts ?? 0}</strong> publicações ·{" "}
              <strong className="text-ink">{stats?.followers ?? 0}</strong> seguidores
            </p>
          )}
          <div className="mt-3">
            <SocialLinks socials={parseSocials(profile.socials)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <Link href="/conta/perfil" className={buttonClasses("secondary", "md")}>
              <Pencil className="size-4" aria-hidden />
              Editar perfil
            </Link>
          ) : (
            profile.is_creator && (
              <FollowButton
                creatorId={profile.id}
                following={following}
                loggedIn={Boolean(user)}
                size="md"
              />
            )
          )}
        </div>
      </section>

      <div className="mt-8 mb-6">
        <LinkTabs
          items={[
            { href: base, label: "Publicações" },
            ...(profile.is_creator ? [{ href: `${base}?aba=pacotes`, label: "Pacotes" }] : []),
            { href: `${base}?aba=sobre`, label: "Sobre" },
          ]}
          active={tab === "publicacoes" ? base : `${base}?aba=${tab}`}
        />
      </div>

      {tab === "pacotes" ? (
        packages.length === 0 ? (
          <EmptyState
            title="Nenhum pacote à venda"
            description={
              isOwner
                ? "Monte seu primeiro pacote de fotos e vídeos no Studio."
                : "Quando houver pacotes, eles aparecem aqui."
            }
            action={
              isOwner ? (
                <Link href="/estudio/pacotes/novo" className={buttonClasses("outline", "sm")}>
                  Novo pacote
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map((p) => (
              <li key={p.id}>
                <PackageCard pkg={p} />
              </li>
            ))}
          </ul>
        )
      ) : tab === "sobre" ? (
        <section className="flex max-w-2xl flex-col gap-6">
          {profile.bio ? (
            <p className="whitespace-pre-line type-body text-ink">{profile.bio}</p>
          ) : (
            <p className="type-body text-ink-muted">Este perfil ainda não tem bio.</p>
          )}
          {(profile.links ?? []).length > 0 && (
            <ul className="flex flex-col gap-2">
              {(profile.links ?? []).map((l) => (
                <li key={l}>
                  <a
                    href={l}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="inline-flex items-center gap-2 type-label text-accent-text hover:underline"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    {l.replace(/^https:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="max-w-md">
            <UrlField url={profileUrl} />
          </div>
          {!isOwner && (
            <div>
              <ReportButton
                targetType="profile"
                targetId={profile.id}
                loggedIn={Boolean(user)}
                label="Denunciar perfil"
              />
            </div>
          )}
        </section>
      ) : posts.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação ainda"
          description={
            isOwner && profile.is_creator
              ? "Suas publicações aparecem aqui."
              : profile.is_creator
                ? "Quando houver publicações, elas aparecem aqui."
                : "Este perfil não publica conteúdo."
          }
          action={
            isOwner && profile.is_creator ? (
              <Link href="/estudio/publicar" className={buttonClasses("outline", "sm")}>
                Nova publicação
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex max-w-2xl flex-col gap-4">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} loggedIn={Boolean(user)} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
