"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { AVATAR_BUCKET, BANNER_BUCKET, profileImagePathRe } from "@/features/content/constants";
import { CATEGORIES } from "@/features/discovery/categories";

export interface ExtrasResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

/** Grava o novo avatar/banner (já enviado pelo navegador) e apaga o arquivo anterior. */
export async function setProfileImageAction(
  kind: "avatar" | "banner",
  path: string | null,
): Promise<ExtrasResult> {
  const user = await requireUser("/conta/perfil");
  if (path !== null && !profileImagePathRe(user.id).test(path))
    return { ok: false, message: "Imagem inválida." };
  const column = kind === "avatar" ? "avatar_path" : "banner_path";
  const bucket = kind === "avatar" ? AVATAR_BUCKET : BANNER_BUCKET;

  const supabase = await createServerSupabase();
  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_path, banner_path")
    .eq("id", user.id)
    .single();
  const { error } = await supabase
    .from("profiles")
    .update(kind === "avatar" ? { avatar_path: path } : { banner_path: path })
    .eq("id", user.id);
  if (error) return { ok: false, message: "Não foi possível salvar a imagem." };

  const old = current?.[column];
  if (old && old !== path) await supabase.storage.from(bucket).remove([old]);
  revalidatePath("/", "layout");
  return { ok: true, message: path ? "Imagem atualizada." : "Imagem removida." };
}

const SLUGS = CATEGORIES.filter((c) => c.slug !== "todos").map((c) => c.slug);

const detailsSchema = z.object({
  categories: z.array(z.enum(SLUGS as [string, ...string[]])).max(3, "Escolha até 3 categorias."),
  links: z
    .array(
      z
        .string()
        .trim()
        .max(200, "Link muito longo.")
        .regex(/^https:\/\/[^\s<>"']{4,200}$/, "Use um link completo começando com https://"),
    )
    .max(3),
});

export async function updateCreatorDetailsAction(
  _: ExtrasResult | null,
  fd: FormData,
): Promise<ExtrasResult> {
  const user = await requireUser("/conta/perfil");
  const parsed = detailsSchema.safeParse({
    categories: fd.getAll("categories").map(String),
    links: fd
      .getAll("links")
      .map((l) => String(l).trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ categories: parsed.data.categories, links: parsed.data.links })
    .eq("id", user.id);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Categorias e links atualizados." };
}
