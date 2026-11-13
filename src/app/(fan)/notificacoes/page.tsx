import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  Bell,
  CalendarClock,
  Heart,
  MessageSquare,
  ShieldCheck,
  CreditCard,
  Crown,
  Gift,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { markAllNotificationsReadAction } from "@/features/notifications/actions";
import { NotificationPrefsForm } from "@/features/notifications/NotificationPrefsForm";
import { NotificationsRealtime } from "@/features/notifications/NotificationsRealtime";
import { getNotificationPrefs, getNotifications } from "@/features/notifications/queries";

export const metadata: Metadata = { title: "Notificações" };

const ICONS: Record<string, LucideIcon> = {
  sale: ShoppingBag,
  tip: Gift,
  new_subscriber: Crown,
  renewal: Crown,
  payment_failed: CreditCard,
  message: MessageCircle,
  new_post: Sparkles,
  new_follower: UserPlus,
  payout: Banknote,
  like: Heart,
  comment: MessageSquare,
  verification: ShieldCheck,
  subscription_expiring: CalendarClock,
};

export default async function Page() {
  const user = await requireUser("/notificacoes");
  const [items, prefs] = await Promise.all([getNotifications(), getNotificationPrefs(user.id)]);
  const unread = items.filter((n) => !n.read).length;

  return (
    <AppShell user={user} active="/notificacoes">
      <NotificationsRealtime />
      <PageHeader
        title="Notificações"
        description="Vendas, mensagens, novos posts e avisos da sua conta."
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="secondary" size="sm">
                Marcar todas como lidas
              </Button>
            </form>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1" aria-label="Lista de notificações">
          {items.length === 0 ? (
            <EmptyState
              title="Nada por aqui ainda"
              description="Quando acontecer algo importante (venda, mensagem, novo post), avisamos aqui."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-alt">
              {items.map((n) => {
                const Icon = ICONS[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <Link
                      href={n.link}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-surface",
                        !n.read && "bg-surface",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-5 shrink-0",
                          n.read ? "text-ink-muted" : "text-accent",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "type-label",
                            n.read ? "text-ink-muted" : "font-semibold text-ink",
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && <p className="truncate type-caption text-ink-muted">{n.body}</p>}
                      </div>
                      <time dateTime={n.createdAt} className="shrink-0 type-caption text-ink-muted">
                        {formatRelative(n.createdAt)}
                      </time>
                      {!n.read && <span className="sr-only">(não lida)</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="w-full rounded-lg border border-border bg-surface-alt p-5 lg:w-80">
          <NotificationPrefsForm prefs={prefs} isCreator={user.roles.includes("creator")} />
        </aside>
      </div>
    </AppShell>
  );
}
