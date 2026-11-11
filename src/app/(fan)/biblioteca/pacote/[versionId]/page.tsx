import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import { POST_MEDIA_BUCKET, UUID_RE, formatMediaCount } from "@/features/content/constants";
import { MediaGallery } from "@/features/content/PostCard";

export const metadata: Metadata = { title: "Pacote", robots: { index: false } };

/** Conteúdo de um pacote comprado: o banco só devolve os itens a quem tem acesso à versão. */
export default async function Page({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!UUID_RE.test(versionId)) notFound();
  const user = await requireUser(`/biblioteca/pacote/${versionId}`);
  const supabase = await createServerSupabase();
  const { data: items } = await supabase.rpc("package_items_for", { p_version_id: versionId });
  if (!items || items.length === 0) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select("description, creator_id, paid_at")
    .eq("buyer_id", user.id)
    .eq("kind", "package")
    .eq("target_id", versionId)
    .eq("status", "paid")
    .maybeSingle();

  const paths = items.flatMap((i) =>
    i.poster_path ? [i.storage_path, i.poster_path] : [i.storage_path],
  );
  const { data: signed } = await createServiceSupabase()
    .storage.from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, 900);
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const media = items
    .map((i) => ({
      kind: (i.kind === "video" ? "video" : "image") as "image" | "video",
      url: url.get(i.storage_path) ?? "",
      posterUrl: i.poster_path ? (url.get(i.poster_path) ?? null) : null,
      width: i.width,
      height: i.height,
      duration: i.duration_seconds,
    }))
    .filter((m) => m.url);
  const videos = media.filter((m) => m.kind === "video").length;

  return (
    <AppShell user={user} active="/biblioteca">
      <Link href="/biblioteca" className="type-label text-accent-text hover:underline">
        ← Biblioteca
      </Link>
      <PageHeader
        eyebrow="Pacote comprado"
        title={order?.description.replace(/^Pacote · /, "") ?? "Pacote"}
        description={`${formatMediaCount(media.length - videos, videos)} · versão adquirida, não muda depois da compra`}
      />
      <MediaGallery media={media} className="max-w-3xl" />
    </AppShell>
  );
}
