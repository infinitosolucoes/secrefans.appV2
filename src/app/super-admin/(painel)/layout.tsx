import Link from "next/link";
import {
  ClipboardCheck,
  Flag,
  Landmark,
  LayoutDashboard,
  Percent,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { Topbar } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui";
import { requireStaffMfa } from "@/server/auth/session";
import { hasPermission, ROLE_LABELS } from "@/server/authorization/roles";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffMfa();
  const nav = [
    { href: "/super-admin", label: "Visão geral", icon: LayoutDashboard, show: true },
    {
      href: "/super-admin/usuarios",
      label: "Usuários",
      icon: Users,
      show: hasPermission(user.roles, "users.read"),
    },
    {
      href: "/super-admin/verificacoes",
      label: "Verificações",
      icon: ClipboardCheck,
      show: hasPermission(user.roles, "verifications.read"),
    },
    {
      href: "/super-admin/comissoes",
      label: "Comissões",
      icon: Percent,
      show: hasPermission(user.roles, "finance.read"),
    },
    {
      href: "/super-admin/financeiro",
      label: "Financeiro",
      icon: Landmark,
      show: hasPermission(user.roles, "finance.read"),
    },
    {
      href: "/super-admin/denuncias",
      label: "Denúncias",
      icon: Flag,
      show: hasPermission(user.roles, "reports.read"),
    },
    {
      href: "/super-admin/auditoria",
      label: "Auditoria",
      icon: ScrollText,
      show: hasPermission(user.roles, "audit.read"),
    },
    {
      href: "/super-admin/configuracoes",
      label: "Configurações",
      icon: Settings,
      show: hasPermission(user.roles, "settings.read"),
    },
  ].filter((i) => i.show);

  return (
    <>
      <Topbar user={user} />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8">
        <aside className="md:w-60 md:shrink-0" aria-label="Administração">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="type-tagline text-accent-text">Admin</span>
            {user.roles
              .filter((r) => r !== "fan" && r !== "creator")
              .map((r) => (
                <Badge key={r} tone="accent">
                  {ROLE_LABELS[r]}
                </Badge>
              ))}
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 type-label text-ink-muted hover:bg-surface-alt hover:text-ink"
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main id="conteudo" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </>
  );
}
