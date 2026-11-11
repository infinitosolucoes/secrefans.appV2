import "server-only";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import { POST_MEDIA_BUCKET } from "@/features/content/constants";

export interface EditorItem {
  kind: "image" | "video";
  path: string;
  poster: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  size: number | null;
  /** Pré-visualização para o dono (URL assinada curta). */
  previewUrl: string | null;
}

export interface PackageForEdit {
  id: string;
  status: string;
  hasPublished: boolean;
  version: number;
  title: string;
  description: string;
  category: string | null;
  priceCents: number;
  audience: "all" | "subscribers";
  coverPath: string | null;
  items: EditorItem[];
}

/**
 * Carrega o pacote do próprio criador para edição: o rascunho aberto ou, se não houver,
 * a versão publicada (salvar cria uma nova versão a partir dela).
 */
export async function getPackageForEdit(
  id: string,
  userId: string,
): Promise<PackageForEdit | null> {
  const supabase = await createServerSupabase();
  const { data: pkg } = await supabase
    .from("packages")
    .select("id, status, creator_id, current_version_id")
    .eq("id", id)
    .maybeSingle();
  if (!pkg || pkg.creator_id !== userId) return null;

  const { data: versions } = await supabase
    .from("package_versions")
    .select("id, version, status, title, description, category, price_cents, audience, cover_path")
    .eq("package_id", id)
    .in("status", ["draft", "published"]);
  const v =
    (versions ?? []).find((x) => x.status === "draft") ??
    (versions ?? []).find((x) => x.status === "published");
  if (!v) return null;

  const { data: items } = await supabase
    .from("package_items")
    .select(
      "kind, storage_path, poster_path, width, height, duration_seconds, size_bytes, position",
    )
    .eq("version_id", v.id)
    .order("position");

  const previewPaths = (items ?? []).map((i) => i.poster_path ?? i.storage_path);
  const { data: signed } = previewPaths.length
    ? await createServiceSupabase()
        .storage.from(POST_MEDIA_BUCKET)
        .createSignedUrls(previewPaths, 900)
    : { data: [] as Array<{ path: string | null; signedUrl: string }> };
  const urlBy = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return {
    id: pkg.id,
    status: pkg.status,
    hasPublished: Boolean(pkg.current_version_id),
    version: v.version,
    title: v.title,
    description: v.description,
    category: v.category,
    priceCents: v.price_cents,
    audience: v.audience,
    coverPath: v.cover_path,
    items: (items ?? []).map((i) => ({
      kind: i.kind === "video" ? "video" : "image",
      path: i.storage_path,
      poster: i.poster_path,
      width: i.width,
      height: i.height,
      duration: i.duration_seconds,
      size: i.size_bytes,
      previewUrl: urlBy.get(i.poster_path ?? i.storage_path) ?? null,
    })),
  };
}

export interface PublicPackage {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  audience: "all" | "subscribers";
  coverPath: string | null;
  photoCount: number;
  videoCount: number;
  version: number;
  versionId: string;
}

export async function getCreatorPackages(creatorId: string): Promise<PublicPackage[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("public_packages")
    .select(
      "id, title, description, price_cents, audience, cover_path, photo_count, video_count, version, version_id",
    )
    .eq("creator_id", creatorId)
    .order("published_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((p) => ({
    id: p.id ?? "",
    title: p.title ?? "",
    description: p.description ?? "",
    priceCents: p.price_cents ?? 0,
    audience: p.audience ?? "all",
    coverPath: p.cover_path,
    photoCount: p.photo_count ?? 0,
    videoCount: p.video_count ?? 0,
    version: p.version ?? 1,
    versionId: p.version_id ?? "",
  }));
}
