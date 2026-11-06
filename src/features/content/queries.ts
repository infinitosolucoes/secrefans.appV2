import "server-only";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import { POST_MEDIA_BUCKET, type PostVisibility } from "./constants";

/** Validade das URLs assinadas de mídia (segundos). */
const SIGNED_URL_TTL = 600;
export const FEED_PAGE_SIZE = 20;

export interface PostMedia {
  kind: "image" | "video";
  url: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface FeedPost {
  id: string;
  creatorId: string;
  handle: string;
  displayName: string;
  avatarPath: string | null;
  body: string;
  visibility: PostVisibility;
  priceCents: number | null;
  publishedAt: string | null;
  mediaCount: number;
  videoCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  unlocked: boolean;
  /** Preenchido só quando o leitor tem acesso; post bloqueado nunca carrega URL. */
  media: PostMedia[];
}

type FeedRow = {
  id: string | null;
  creator_id: string | null;
  handle: string | null;
  display_name: string | null;
  avatar_path: string | null;
  body: string | null;
  visibility: PostVisibility | null;
  price_cents: number | null;
  published_at: string | null;
  media_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  liked_by_me: boolean | null;
  unlocked: boolean | null;
  video_count: number | null;
};

const FEED_COLUMNS =
  "id, creator_id, handle, display_name, avatar_path, body, visibility, price_cents, published_at, media_count, like_count, comment_count, liked_by_me, unlocked, video_count";

const toPost = (r: FeedRow): FeedPost => ({
  id: r.id ?? "",
  creatorId: r.creator_id ?? "",
  handle: r.handle ?? "",
  displayName: r.display_name ?? "",
  avatarPath: r.avatar_path,
  body: r.body ?? "",
  visibility: r.visibility ?? "free",
  priceCents: r.price_cents,
  publishedAt: r.published_at,
  mediaCount: r.media_count ?? 0,
  videoCount: r.video_count ?? 0,
  likeCount: r.like_count ?? 0,
  commentCount: r.comment_count ?? 0,
  likedByMe: Boolean(r.liked_by_me),
  unlocked: Boolean(r.unlocked),
  media: [],
});

/**
 * Busca os caminhos pela RPC post_media_for (que aplica a regra de acesso no banco, com a sessão
 * do leitor) e só então assina URLs curtas com a service_role.
 */
async function attachMedia(posts: FeedPost[]): Promise<FeedPost[]> {
  const targets = posts.filter((p) => p.unlocked && p.mediaCount > 0);
  if (targets.length === 0) return posts;
  const supabase = await createServerSupabase();
  const rows = await Promise.all(
    targets.map(async (p) => {
      const { data } = await supabase.rpc("post_media_for", { p_post_id: p.id });
      return { postId: p.id, items: data ?? [] };
    }),
  );
  const paths = rows.flatMap((r) =>
    r.items.flatMap((i) => (i.poster_path ? [i.storage_path, i.poster_path] : [i.storage_path])),
  );
  if (paths.length === 0) return posts;

  const { data: signed } = await createServiceSupabase()
    .storage.from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const mediaByPost = new Map(
    rows.map((r) => [
      r.postId,
      r.items
        .map((i) => ({
          kind: (i.kind === "video" ? "video" : "image") as PostMedia["kind"],
          url: urlByPath.get(i.storage_path) ?? "",
          posterUrl: i.poster_path ? (urlByPath.get(i.poster_path) ?? null) : null,
          width: i.width,
          height: i.height,
          duration: i.duration_seconds,
        }))
        .filter((m) => m.url),
    ]),
  );
  return posts.map((p) => ({ ...p, media: mediaByPost.get(p.id) ?? [] }));
}

export async function getFeed(opts: {
  tab: "seguindo" | "para-voce";
  userId: string;
  limit?: number;
}): Promise<{ posts: FeedPost[]; followingCount: number }> {
  const supabase = await createServerSupabase();
  const { data: follows } = await supabase
    .from("follows")
    .select("creator_id")
    .eq("follower_id", opts.userId);
  const following = (follows ?? []).map((f) => f.creator_id);

  if (opts.tab === "seguindo" && following.length === 0) return { posts: [], followingCount: 0 };

  let query = supabase
    .from("feed_posts")
    .select(FEED_COLUMNS)
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? FEED_PAGE_SIZE);
  if (opts.tab === "seguindo") query = query.in("creator_id", following);
  const { data } = await query;
  return {
    posts: await attachMedia(((data ?? []) as FeedRow[]).map(toPost)),
    followingCount: following.length,
  };
}

export async function getCreatorPosts(creatorId: string, limit = 30): Promise<FeedPost[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("feed_posts")
    .select(FEED_COLUMNS)
    .eq("creator_id", creatorId)
    .order("published_at", { ascending: false })
    .limit(limit);
  return attachMedia(((data ?? []) as FeedRow[]).map(toPost));
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("feed_posts")
    .select(FEED_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const [post] = await attachMedia([toPost(data as FeedRow)]);
  return post ?? null;
}

export interface PostComment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
}

/** Comentários exigem login (RLS de post_comments é só para autenticados). */
export async function getComments(postId: string): Promise<PostComment[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("post_comments")
    .select("id, body, created_at, author_id")
    .eq("post_id", postId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: authors } = await supabase
    .from("public_profiles")
    .select("id, handle, display_name")
    .in("id", [...new Set(rows.map((r) => r.author_id))]);
  const byId = new Map((authors ?? []).map((a) => [a.id, a]));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorId: r.author_id,
    authorHandle: byId.get(r.author_id)?.handle ?? "",
    authorName: byId.get(r.author_id)?.display_name || byId.get(r.author_id)?.handle || "Usuário",
  }));
}

export async function isFollowing(userId: string | undefined, creatorId: string) {
  if (!userId) return false;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("follows")
    .select("creator_id")
    .eq("follower_id", userId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  return Boolean(data);
}

export async function getFollowedIds(userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("follows").select("creator_id").eq("follower_id", userId);
  return new Set((data ?? []).map((f) => f.creator_id));
}
