import Link from "next/link";
import {
  Bell,
  Compass,
  Crown,
  Flame,
  House,
  Library,
  Wallet,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { SearchPill } from "@/components/ui/brand";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { signOutAction } from "@/features/identity/actions";
import { switchViewModeAction } from "@/features/identity/view-mode-actions";
import type { SessionUser } from "@/server/auth/session";
import { getUnreadTotal } from "@/features/messages/queries";

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Visitante: menu do DS (Início, Explorar, Criadores, Assinaturas, Mensagens, Notificações). */
const visitorNav: NavItem[] = [
  { href: "/descobrir", label: "Início", icon: House },
  { href: "/explorar", label: "Explorar", icon: Compass },
  { href: "/criadores", label: "Criadores", icon: Users },
  { href: "/assinaturas", label: "Assinaturas", icon: Star },
  { href: "/mensagens", label: "Mensagens", icon: MessageCircle },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
];

/** Logado: menu das telas do fã no canvas (Início, Explorar, Feed, Biblioteca, Mensagens, Carteira, Notificações). */
const memberNav: NavItem[] = [
  { href: "/descobrir", label: "Início", icon: House },
  { href: "/explorar", label: "Explorar", icon: Compass },
  { href: "/inicio", label: "Feed", icon: Flame },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/mensagens", label: "Mensagens", icon: MessageCircle },
  { href: "/carteira", label: "Carteira", icon: Wallet },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
];

const navFor = (user: SessionUser | null) => (user ? memberNav : visitorNav);
const findNav = (items: NavItem[], href: string) => items.find((i) => i.href === href)!;

const topLinks = [
  { href: "/inicio", label: "Início" },
  { href: "/explorar", label: "Explorar" },
  { href: "/criar-conta?perfil=criador", label: "Seja Criador", visitorOnly: true },
];

/** Alternância criador/fã (só Super Admin que também é criador). Segmentado com as duas opções. */
function ViewModeSwitch({ mode }: { mode: "criador" | "fa" }) {
  return (
    <form
      action={switchViewModeAction}
      className="flex items-center rounded-pill border border-border bg-surface-alt p-0.5"
      aria-label="Ver o site como"
    >
      {(
        [
          { value: "criador", label: "Criador" },
          { value: "fa", label: "Fã" },
        ] as const
      ).map((o) => (
        <button
          key={o.value}
          type="submit"
          name="mode"
          value={o.value}
          aria-pressed={mode === o.value}
          className={cn(
            "h-8 rounded-pill px-3 type-caption font-semibold transition",
            mode === o.value ? "bg-rosa-profundo text-on-accent" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </form>
  );
}

/** Topbar do DS: logo, busca em pílula, links (ativo em accent-text sublinhado), Entrar e Criar Conta. */
export function Topbar({ user, active }: { user: SessionUser | null; active?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:gap-6">
        <Logo />
        <SearchPill className="hidden md:block" />
        <nav aria-label="Atalhos" className="hidden items-center gap-5 lg:flex">
          {topLinks
            .filter((l) => !(l.visitorOnly && user))
            .map((l) => (l.href === "/inicio" && !user ? { ...l, href: "/descobrir" } : l))
            .map((l) => {
              const isActive = active === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "type-label underline-offset-8",
                    isActive
                      ? "text-accent-text underline decoration-2"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/explorar"
            className={cn(buttonClasses("ghost", "sm"), "px-2 md:hidden")}
            aria-label="Buscar"
          >
            <Search className="size-5" aria-hidden />
          </Link>
          {user ? (
            <>
              {user.canSwitchView && <ViewModeSwitch mode={user.viewMode} />}
              {user.isStaff && (
                <Link href="/super-admin" className={buttonClasses("ghost", "sm")}>
                  <ShieldCheck className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
              <Link
                href="/conta/perfil"
                className="hidden type-label text-ink-muted hover:text-ink sm:inline"
              >
                @{user.handle}
              </Link>
              <form action={signOutAction}>
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              {/* No mobile, "Entrar" fica na navegação inferior. */}
              <span className="hidden sm:contents">
                <Link href="/entrar" className={buttonClasses("secondary", "sm")}>
                  Entrar
                </Link>
              </span>
              <Link href="/criar-conta" className={buttonClasses("primary", "sm")}>
                Criar Conta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Sidebar 240px do DS. Ativo em surface-alt + radius-md. Visitante vê "Criar Conta" e o card "Seja um Criador". */
export function Sidebar({
  user,
  active,
  unread = 0,
}: {
  user: SessionUser | null;
  active?: string;
  unread?: number;
}) {
  const items: NavItem[] = [...navFor(user)];
  if (user) items.push({ href: "/conta/perfil", label: "Meu perfil", icon: UserRound });
  if (user && (user.roles.includes("creator") || user.creatorIntent)) {
    items.push({ href: "/estudio", label: "Creator Studio", icon: Sparkles });
  }
  const isCreator = user?.roles.includes("creator") ?? false;
  return (
    <aside className="hidden w-60 shrink-0 md:block" aria-label="Navegação principal">
      <div className="sticky top-20 flex flex-col gap-1">
        <nav aria-label="Seções" className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            const isActive = active === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-4 py-2 type-label",
                  isActive
                    ? "bg-surface-alt text-accent-text"
                    : "text-ink-muted hover:bg-surface-alt hover:text-ink",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
                {href === "/mensagens" && <UnreadBadge count={unread} />}
              </Link>
            );
          })}
        </nav>
        {!user && (
          <Link href="/criar-conta" className={cn(buttonClasses("primary", "md", true), "mt-4")}>
            Criar Conta
          </Link>
        )}
        {!isCreator && (
          <div className="mt-6 rounded-lg border border-border bg-surface-alt p-4">
            <Crown className="mb-2 size-6 text-accent-text" aria-hidden />
            <p className="type-feature-title text-ink">Seja um Criador</p>
            <p className="mt-1 type-caption text-ink-muted">
              Monetize seu conteúdo com privacidade e segurança.
            </p>
            <Link
              href={user ? "/estudio/verificacao" : "/criar-conta?perfil=criador"}
              className={cn(buttonClasses("outline", "sm", true), "mt-4")}
            >
              Saiba mais
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Navegação inferior no mobile. Criadores veem o Estúdio no lugar de Notificações. */
function BottomNav({
  user,
  active,
  unread = 0,
}: {
  user: SessionUser | null;
  active?: string;
  unread?: number;
}) {
  const showStudio = user && (user.roles.includes("creator") || user.creatorIntent);
  const nav = navFor(user);
  const items: NavItem[] = [
    user ? findNav(nav, "/inicio") : findNav(nav, "/descobrir"),
    findNav(nav, "/explorar"),
    findNav(nav, "/mensagens"),
    showStudio
      ? { href: "/estudio", label: "Estúdio", icon: Sparkles }
      : findNav(nav, "/notificacoes"),
    user
      ? { href: "/conta/perfil", label: "Perfil", icon: UserRound }
      : { href: "/entrar", label: "Entrar", icon: UserRound },
  ];
  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active === href ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 type-caption",
                active === href ? "text-accent-text" : "text-ink-muted",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
              {href === "/mensagens" && <UnreadBadge count={unread} compact />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Selo de mensagens não lidas no item "Mensagens". */
function UnreadBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-pill bg-accent font-bold text-white",
        compact
          ? "absolute -top-1 right-1/4 h-4 min-w-4 px-1 text-[10px]"
          : "ml-auto h-5 min-w-5 px-1.5 type-caption",
      )}
      aria-label={`${count} mensagens não lidas`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export async function AppShell({
  user,
  active,
  children,
}: {
  user: SessionUser | null;
  active?: string;
  children: React.ReactNode;
}) {
  let unread = 0;
  if (user) {
    try {
      unread = await getUnreadTotal(user.id);
    } catch {
      unread = 0;
    }
  }
  return (
    <>
      <Topbar user={user} active={active} />
      <div className="mx-auto flex max-w-7xl gap-10 px-4 py-6 pb-24 md:pb-10">
        <Sidebar user={user} active={active} unread={unread} />
        <main id="conteudo" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
      <BottomNav user={user} active={active} unread={unread} />
    </>
  );
}

/**
 * Login/cadastro em duas colunas (canvas Auth.dc.html): marca à esquerda, formulário à direita
 * com abas Entrar / Criar conta. No mobile a coluna da marca vira um cabeçalho compacto.
 */
export function AuthSplitLayout({
  mode,
  title,
  query = "",
  children,
}: {
  mode: "entrar" | "criar-conta";
  title: string;
  query?: string;
  children: React.ReactNode;
}) {
  const tabs = [
    { href: `/entrar${query}`, label: "Entrar", active: mode === "entrar" },
    { href: `/criar-conta${query}`, label: "Criar conta", active: mode === "criar-conta" },
  ];
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <section className="relative flex flex-col md:flex-[1_1_520px] justify-between gap-10 overflow-hidden border-b border-border bg-[radial-gradient(60%_70%_at_60%_45%,color-mix(in_srgb,var(--rosa-neon)_30%,transparent),transparent_70%)] px-6 py-8 md:border-r md:border-b-0 md:px-14 md:py-10">
        <Logo />
        <div className="hidden max-w-[520px] flex-col gap-5 md:flex">
          <p className="type-tagline text-ink-muted">Conteúdo • Conexão • Liberdade</p>
          <p className="type-hero-italic-fluid text-ink uppercase">
            Sua imagem é sua marca.{" "}
            <span className="text-accent-text">Seu conteúdo tem valor.</span>
          </p>
          <p className="text-[17px] leading-[26px] text-ink-muted">
            Entre para descobrir criadores, assinar, comprar pacotes e conversar com quem você
            admira.
          </p>
        </div>
        <p className="hidden origin-left -rotate-[5deg] type-script-fluid text-accent-text md:block">
          O segredo é viver do seu jeito.
        </p>
      </section>
      <section className="flex flex-1 items-center md:flex-[1_1_460px] justify-center px-4 py-10 md:px-6">
        <main id="conteudo" className="flex w-full max-w-[440px] flex-col gap-5">
          <nav
            aria-label="Acesso"
            className="grid grid-cols-2 gap-1.5 rounded-pill border border-border bg-surface-alt p-1.5"
          >
            {tabs.map((t) => (
              <Link
                key={t.label}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center justify-center rounded-pill type-label font-bold",
                  t.active
                    ? "bg-rosa-profundo text-on-accent shadow-glow-sm"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <h1 className="text-[26px] leading-8 font-extrabold text-ink">{title}</h1>
          {children}
        </main>
      </section>
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-10">
        <Logo />
      </div>
      <main
        id="conteudo"
        className="w-full max-w-md rounded-lg border border-border bg-surface-alt p-6 shadow-glow-sm md:p-10"
      >
        <h1 className="type-heading text-ink">{title}</h1>
        {subtitle && <p className="mt-1 type-body text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
      <p className="mt-10 type-tagline text-ink-muted">Conteúdo • Conexão • Liberdade</p>
    </div>
  );
}
