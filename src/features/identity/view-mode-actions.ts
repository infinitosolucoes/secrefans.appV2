"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser, VIEW_MODE_COOKIE } from "@/server/auth/session";

/** Alterna a visão criador/fã. Só tem efeito para Super Admin que também é criador. */
export async function switchViewModeAction(fd: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user?.canSwitchView) return;
  const mode = fd.get("mode") === "fa" ? "fa" : "criador";
  const store = await cookies();
  store.set(VIEW_MODE_COOKIE, mode, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
  redirect(mode === "criador" ? "/estudio" : "/inicio");
}
