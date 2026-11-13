import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
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
  /** Super Admin que também é criador pode alternar a visão entre criador e fã. */
  canSwitchView: boolean;
  /** Visão atual quando canSwitchView (fora disso, sempre "criador" ou "fa" conforme o papel). */
  viewMode: ViewMode;
}

export type ViewMode = "criador" | "fa";
export const VIEW_MODE_COOKIE = "sf_modo";

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

  const realRoles = (roles ?? []) as AppRole[];
  // Alternância de visão: só para quem é Super Admin E criador. Na visão "fã" a interface trata a
  // conta como fã (sem Studio). Não concede nada: o banco continua decidindo pelos papéis reais.
  const canSwitchView = realRoles.includes("super_admin") && realRoles.includes("creator");
  const cookieMode = (await cookies()).get(VIEW_MODE_COOKIE)?.value;
  const viewMode: ViewMode =
    canSwitchView && cookieMode === "fa" ? "fa" : realRoles.includes("creator") ? "criador" : "fa";
  const roleList =
    canSwitchView && viewMode === "fa" ? realRoles.filter((r) => r !== "creator") : realRoles;
  return {
    id: auth.user.id,
    email: auth.user.email ?? "",
    handle: profile.handle,
    displayName: profile.display_name,
    roles: roleList,
    isStaff: isStaffRole(roleList),
    canSwitchView,
    viewMode,
    creatorIntent: canSwitchView && viewMode === "fa" ? false : profile.creator_intent,
    status: profile.status,
    aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasMfaFactor: aal?.nextLevel === "aal2",
  };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  if (user.status !== "active") redirect("/conta-suspensa");
  // Quem ativou a verificação em duas etapas precisa digitar o código a cada login.
  if (user.hasMfaFactor && user.aal !== "aal2")
    redirect(next ? `/entrar/codigo?next=${encodeURIComponent(next)}` : "/entrar/codigo");
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
