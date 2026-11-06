"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { VERIFICATION_BUCKET } from "@/features/creators/verification";

export interface AdminResult {
  ok: boolean;
  message: string;
}

const ROLES = [
  "fan",
  "creator",
  "moderator",
  "support",
  "finance",
  "admin_ops",
  "super_admin",
] as const;
const reason = z.string().trim().min(3, "Informe o motivo (mín. 3 caracteres).").max(500);

const errorMessage = (code?: string) =>
  code === "42501"
    ? "Acesso negado."
    : code === "22023"
      ? "Operação inválida para o estado atual."
      : "Não foi possível concluir a operação.";

const roleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(ROLES),
  reason,
  op: z.enum(["grant", "revoke"]),
});

export async function changeRoleAction(_: AdminResult | null, fd: FormData): Promise<AdminResult> {
  await requireStaffMfa("roles.manage");
  const parsed = roleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { userId, role, op } = parsed.data;

  const supabase = await createServerSupabase();
  const fn = op === "grant" ? "grant_role" : "revoke_role";
  const { data, error } = await supabase.rpc(fn, {
    p_user_id: userId,
    p_role: role,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: errorMessage(error.code) };
  if (data === false)
    return { ok: false, message: "Acesso negado. A tentativa foi registrada na auditoria." };
  revalidatePath(`/super-admin/usuarios/${userId}`);
  return { ok: true, message: op === "grant" ? "Papel concedido." : "Papel revogado." };
}

const statusSchema = z.object({ userId: z.uuid(), status: z.enum(["active", "blocked"]), reason });

export async function setAccountStatusAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  await requireStaffMfa("users.manage");
  const parsed = statusSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_account_status", {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: errorMessage(error.code) };
  revalidatePath(`/super-admin/usuarios/${parsed.data.userId}`);
  return {
    ok: true,
    message: parsed.data.status === "blocked" ? "Conta bloqueada." : "Conta reativada.",
  };
}

const decisionSchema = z.object({
  verificationId: z.uuid(),
  status: z.enum(["approved", "rejected", "suspended"]),
  reason,
});

export async function decideVerificationAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  await requireStaffMfa("verifications.decide");
  const parsed = decisionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("decide_creator_verification", {
    p_verification_id: parsed.data.verificationId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: errorMessage(error.code) };
  revalidatePath("/super-admin/verificacoes", "layout");
  const labels = { approved: "aprovada", rejected: "rejeitada", suspended: "suspensa" } as const;
  return { ok: true, message: `Verificação ${labels[parsed.data.status]}.` };
}

/** Registra o acesso na auditoria e devolve URL assinada de 60s. Nunca expõe URL permanente. */
export async function openVerificationDocumentAction(
  verificationId: string,
  path: string,
): Promise<{ url?: string; error?: string }> {
  await requireStaffMfa("verification_documents.read");
  if (!z.uuid().safeParse(verificationId).success) return { error: "Documento inválido." };

  const supabase = await createServerSupabase();
  const { error: auditError } = await supabase.rpc("log_verification_document_access", {
    p_verification_id: verificationId,
    p_path: path,
  });
  if (auditError) return { error: errorMessage(auditError.code) };

  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data) return { error: "Arquivo indisponível." };
  return { url: data.signedUrl };
}
