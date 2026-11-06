import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const STAFF_ROLES: readonly AppRole[] = [
  "moderator",
  "support",
  "finance",
  "admin_ops",
  "super_admin",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  fan: "Fã",
  creator: "Criador",
  moderator: "Moderador",
  support: "Suporte",
  finance: "Financeiro",
  admin_ops: "Admin operacional",
  super_admin: "Super Admin",
};

export const isStaffRole = (roles: readonly AppRole[]) =>
  roles.some((r) => STAFF_ROLES.includes(r));

/** Espelha role_permissions (migration 0002) só para esconder itens de menu; o banco decide o acesso. */
const ROLE_PERMISSIONS: Record<AppRole, readonly string[]> = {
  fan: [],
  creator: [],
  support: ["users.read"],
  moderator: [
    "users.read",
    "verifications.read",
    "verifications.decide",
    "verification_documents.read",
    "reports.read",
    "reports.decide",
    "content.moderate",
  ],
  finance: ["users.read", "audit.read"],
  admin_ops: [
    "users.read",
    "users.manage",
    "verifications.read",
    "audit.read",
    "settings.read",
    "reports.read",
  ],
  super_admin: [
    "users.read",
    "users.manage",
    "roles.manage",
    "verifications.read",
    "verifications.decide",
    "verification_documents.read",
    "audit.read",
    "settings.read",
    "settings.manage",
    "reports.read",
    "reports.decide",
    "content.moderate",
  ],
};

export function hasPermission(roles: readonly AppRole[], permission: string): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r].includes(permission));
}
