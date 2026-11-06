import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase";
import { hasPermission, isStaffRole, type AppRole } from "@/server/authorization/roles";

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  roles: AppRole[];
  isStaff: boolean;
  creatorIntent: boolean;
  status: "active" | "blocked" | "deleted";
  aal: "aal1" | "aal2";
  /** Usuário tem fator MFA verificado (precisa só do desafio). */
  hasMfaFactor: boolean;
}

/** Usuário validado no servidor de Auth (getUser), com perfil e papéis. Memoizado por request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: roles }, { data: aal }] = await Promise.all([
    supabase
      .from("profiles")
      .select("handle, display_name, creator_intent, status")
      .eq("id", auth.user.id)
      .single(),
    supabase.rpc("my_roles"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (!profile) return null;

  const roleList = (roles ?? []) as AppRole[];
  return {
    id: auth.user.id,
    email: auth.user.email ?? "",
    handle: profile.handle,
    displayName: profile.display_name,
    roles: roleList,
    isStaff: isStaffRole(roleList),
    creatorIntent: profile.creator_intent,
    status: profile.status,
    aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasMfaFactor: aal?.nextLevel === "aal2",
  };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  if (user.status !== "active") redirect("/conta-suspensa");
  return user;
}

export async function requireRole(roles: readonly AppRole[], next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!user.roles.some((r) => roles.includes(r))) redirect("/inicio?erro=sem-permissao");
  return user;
}

/** Equipe com sessão MFA (aal2). Toda página/ação administrativa passa por aqui. */
export async function requireStaffMfa(permission?: string): Promise<SessionUser> {
  const user = await requireUser("/super-admin");
  if (!user.isStaff) redirect("/inicio?erro=sem-permissao");
  if (user.aal !== "aal2") redirect("/super-admin/mfa");
  if (permission && !hasPermission(user.roles, permission))
    redirect("/super-admin?erro=sem-permissao");
  return user;
}
