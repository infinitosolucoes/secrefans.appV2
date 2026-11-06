"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/server/auth/supabase";
import { getSessionUser } from "@/server/auth/session";
import { checkAuthRateLimit } from "@/server/security/rateLimit";
import { publicEnv } from "@/lib/env";
import {
  CONSENT_VERSION,
  flattenErrors,
  forgotSchema,
  profileSchema,
  resetSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
  type FieldErrors,
} from "./schemas";

export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  values?: Record<string, string>;
}

const formValues = (fd: FormData, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["email", "handle", "displayName", "intent"]);
  const limited = await checkAuthRateLimit("signup");
  if (limited) return { message: limited, values };

  const parsed = signUpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: flattenErrors(parsed.error), values };
  const input = parsed.data;

  const supabase = await createServerSupabase();
  const { data: available } = await supabase.rpc("handle_available", { p_handle: input.handle });
  if (!available) return { errors: { handle: "Este nome de usuário já está em uso." }, values };

  const consents = [
    { type: "terms", version: CONSENT_VERSION },
    { type: "privacy", version: CONSENT_VERSION },
    { type: "age_18", version: CONSENT_VERSION },
    ...(input.marketing ? [{ type: "marketing", version: CONSENT_VERSION }] : []),
  ];

  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${input.intent === "creator" ? "/estudio/verificacao" : "/inicio"}`,
      data: {
        handle: input.handle,
        display_name: input.displayName,
        creator_intent: input.intent === "creator",
        consents,
      },
    },
  });
  if (error) {
    return {
      message:
        error.code === "weak_password"
          ? "Senha fraca. Escolha outra."
          : "Não foi possível criar a conta. Tente novamente.",
      values,
    };
  }
  // Resposta idêntica para e-mail novo ou já cadastrado (evita enumeração de contas).
  redirect(`/confirmar-email?email=${encodeURIComponent(input.email)}`);
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["email", "next"]);
  const limited = await checkAuthRateLimit("signin");
  if (limited) return { message: limited, values };

  const parsed = signInSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: flattenErrors(parsed.error), values };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."
        : "E-mail ou senha incorretos.";
    return { message, values };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  redirect("/entrar");
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const limited = await checkAuthRateLimit("forgot");
  if (limited) return { message: limited };
  const parsed = forgotSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: flattenErrors(parsed.error) };

  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/redefinir-senha`,
  });
  return {
    ok: true,
    message: "Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha.",
  };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: flattenErrors(parsed.error) };

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { message: "Link expirado. Solicite uma nova redefinição de senha." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      message:
        error.code === "same_password"
          ? "A nova senha precisa ser diferente da atual."
          : "Não foi possível alterar a senha.",
    };
  }
  await supabase.auth.signOut({ scope: "others" });
  redirect("/inicio?senha=alterada");
}

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  const values = formValues(fd, ["handle", "displayName", "bio", "visibility"]);
  const parsed = profileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { errors: flattenErrors(parsed.error), values };

  const supabase = await createServerSupabase();
  if (parsed.data.handle !== user.handle) {
    const { data: available } = await supabase.rpc("handle_available", {
      p_handle: parsed.data.handle,
    });
    if (!available) return { errors: { handle: "Este nome de usuário já está em uso." }, values };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      handle: parsed.data.handle,
      display_name: parsed.data.displayName,
      bio: parsed.data.bio,
      visibility: parsed.data.visibility,
    })
    .eq("id", user.id);
  if (error) {
    return {
      message:
        error.code === "23505"
          ? "Este nome de usuário já está em uso."
          : "Não foi possível salvar o perfil.",
      values,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil atualizado.", values };
}
