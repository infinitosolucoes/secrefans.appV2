import "server-only";
import { createServerSupabase } from "@/server/auth/supabase";

export interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPrefs {
  emailSales: boolean;
  emailMessages: boolean;
  emailAccount: boolean;
  inappNewPosts: boolean;
  inappEngagement: boolean;
}

export async function getNotifications(limit = 50): Promise<NotificationItem[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    read: Boolean(n.read_at),
    createdAt: n.created_at,
  }));
}

export async function getUnreadNotifications(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("notification_prefs")
    .select("email_sales, email_messages, email_account, inapp_new_posts, inapp_engagement")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    emailSales: data?.email_sales ?? true,
    emailMessages: data?.email_messages ?? true,
    emailAccount: data?.email_account ?? true,
    inappNewPosts: data?.inapp_new_posts ?? true,
    inappEngagement: data?.inapp_engagement ?? true,
  };
}
