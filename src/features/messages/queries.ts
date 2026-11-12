import "server-only";
import { createServerSupabase, createServiceSupabase } from "@/server/auth/supabase";
import { POST_MEDIA_BUCKET } from "@/features/content/constants";

/** URLs assinadas curtas (mesmo prazo dos posts). */
const SIGNED_URL_TTL = 600;

export interface InboxItem {
  id: string;
  otherId: string;
  otherHandle: string;
  otherName: string;
  otherAvatar: string | null;
  iAmCreator: boolean;
  preview: string;
  lastAt: string | null;
  unread: number;
}

export interface ChatMedia {
  kind: "image" | "video";
  url: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  mine: boolean;
  body: string;
  priceCents: number | null;
  deleted: boolean;
  createdAt: string;
  mediaCount: number;
  /** PPV: o leitor (fã) já comprou? Para quem enviou é sempre true. */
  unlocked: boolean;
  media: ChatMedia[];
}

export interface ConversationView {
  id: string;
  creatorId: string;
  fanId: string;
  iAmCreator: boolean;
  other: { id: string; handle: string; name: string; avatar: string | null };
  messages: ChatMessage[];
  blockedByMe: boolean;
}

async function profilesById(ids: string[]) {
  if (ids.length === 0)
    return new Map<string, { handle: string; name: string; avatar: string | null }>();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("public_profiles")
    .select("id, handle, display_name, avatar_path")
    .in("id", ids);
  return new Map(
    (data ?? []).map((p) => [
      p.id ?? "",
      { handle: p.handle ?? "", name: p.display_name || p.handle || "", avatar: p.avatar_path },
    ]),
  );
}

export async function getInbox(userId: string): Promise<InboxItem[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, creator_id, fan_id, last_message_at, last_message_preview, creator_unread, fan_unread",
    )
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const others = rows.map((c) => (c.creator_id === userId ? c.fan_id : c.creator_id));
  const profiles = await profilesById([...new Set(others)]);
  return rows.map((c) => {
    const iAmCreator = c.creator_id === userId;
    const otherId = iAmCreator ? c.fan_id : c.creator_id;
    const p = profiles.get(otherId);
    return {
      id: c.id,
      otherId,
      otherHandle: p?.handle ?? "",
      otherName: p?.name || "Usuário",
      otherAvatar: p?.avatar ?? null,
      iAmCreator,
      preview: c.last_message_preview,
      lastAt: c.last_message_at,
      unread: iAmCreator ? c.creator_unread : c.fan_unread,
    };
  });
}

export async function getUnreadTotal(userId: string): Promise<number> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("conversations")
    .select("creator_id, creator_unread, fan_unread")
    .or("creator_unread.gt.0,fan_unread.gt.0");
  return (data ?? []).reduce(
    (t, c) => t + (c.creator_id === userId ? c.creator_unread : c.fan_unread),
    0,
  );
}

export async function getConversation(
  id: string,
  userId: string,
): Promise<ConversationView | null> {
  const supabase = await createServerSupabase();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, creator_id, fan_id")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return null;
  const iAmCreator = conv.creator_id === userId;
  const otherId = iAmCreator ? conv.fan_id : conv.creator_id;

  const [{ data: msgs }, profiles, { data: block }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, price_cents, deleted_at, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    profilesById([otherId]),
    supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", userId)
      .eq("blocked_id", otherId)
      .maybeSingle(),
  ]);
  const rows = (msgs ?? []).reverse();

  // Quais mensagens pagas o leitor já comprou.
  const paidIds = rows
    .filter((m) => m.price_cents != null && m.sender_id !== userId)
    .map((m) => m.id);
  const { data: owned } = paidIds.length
    ? await supabase
        .from("entitlements")
        .select("target_id")
        .eq("kind", "message")
        .is("revoked_at", null)
        .in("target_id", paidIds)
    : { data: [] as Array<{ target_id: string }> };
  const ownedSet = new Set((owned ?? []).map((o) => o.target_id));

  // Mídia: RPC de acesso com a sessão do leitor, depois URLs assinadas curtas.
  const visible = rows.filter((m) => !m.deleted_at);
  const mediaRows = await Promise.all(
    visible.map(async (m) => {
      const { data } = await supabase.rpc("message_media_for", { p_message_id: m.id });
      return { id: m.id, items: data ?? [] };
    }),
  );
  const paths = mediaRows.flatMap((r) =>
    r.items.flatMap((i) => (i.poster_path ? [i.storage_path, i.poster_path] : [i.storage_path])),
  );
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await createServiceSupabase()
      .storage.from(POST_MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  const mediaById = new Map(
    mediaRows.map((r) => [
      r.id,
      r.items
        .map((i) => ({
          kind: (i.kind === "video" ? "video" : "image") as ChatMedia["kind"],
          url: urlByPath.get(i.storage_path) ?? "",
          posterUrl: i.poster_path ? (urlByPath.get(i.poster_path) ?? null) : null,
          width: i.width,
          height: i.height,
        }))
        .filter((x) => x.url),
    ]),
  );

  // Quantas mídias tem cada PPV bloqueado (para o "cadeado" mostrar o que vem).
  const { data: counts } = await supabase.rpc("message_media_counts", { p_conversation_id: id });
  const countById = new Map((counts ?? []).map((c) => [c.message_id, c.media_count]));

  const p = profiles.get(otherId);
  return {
    id: conv.id,
    creatorId: conv.creator_id,
    fanId: conv.fan_id,
    iAmCreator,
    other: {
      id: otherId,
      handle: p?.handle ?? "",
      name: p?.name || "Usuário",
      avatar: p?.avatar ?? null,
    },
    blockedByMe: Boolean(block),
    messages: rows.map((m) => {
      const mine = m.sender_id === userId;
      return {
        id: m.id,
        senderId: m.sender_id,
        mine,
        body: m.body,
        priceCents: m.price_cents,
        deleted: Boolean(m.deleted_at),
        createdAt: m.created_at,
        mediaCount: countById.get(m.id) ?? 0,
        unlocked: mine || m.price_cents == null || ownedSet.has(m.id),
        media: mediaById.get(m.id) ?? [],
      };
    }),
  };
}

export async function getBroadcasts(creatorId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("message_broadcasts")
    .select("id, body, price_cents, recipients, created_at")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

export async function getDmPolicy(userId: string): Promise<"subscribers" | "everyone"> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("profiles").select("dm_policy").eq("id", userId).single();
  return data?.dm_policy === "everyone" ? "everyone" : "subscribers";
}
