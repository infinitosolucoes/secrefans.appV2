"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { flattenErrors, type FieldErrors } from "@/features/identity/schemas";
import {
  MAX_PACKAGE_ITEMS,
  PACKAGE_COVER_BUCKET,
  PACKAGE_PRICE_MAX,
  PACKAGE_PRICE_MIN,
  POST_MEDIA_BUCKET,
  UUID_RE,
  packageMediaPathRe,
  profileImagePathRe,
} from "@/features/content/constants";
import { CATEGORIES } from "@/features/discovery/categories";

export interface PackageResult {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  version?: number;
}

const SLUGS = CATEGORIES.filter((c) => c.slug !== "todos").map((c) => c.slug) as [
  string,
  ...string[],
];

const schema = (userId: string) =>
  z
    .object({
      packageId: z.string().regex(UUID_RE),
      title: z.string().trim().min(3, "Dê um título (mín. 3 caracteres).").max(80),
      description: z.string().trim().max(2000, "Máximo de 2000 caracteres."),
      category: z.enum(SLUGS).nullable(),
      priceCents: z
        .number()
        .int()
        .min(
          PACKAGE_PRICE_MIN * 100,
          `Preço entre R$ ${PACKAGE_PRICE_MIN} e R$ ${PACKAGE_PRICE_MAX}.`,
        )
        .max(
          PACKAGE_PRICE_MAX * 100,
          `Preço entre R$ ${PACKAGE_PRICE_MIN} e R$ ${PACKAGE_PRICE_MAX}.`,
        ),
      audience: z.enum(["all", "subscribers"]),
      coverPath: z.string().nullable(),
      publish: z.boolean(),
      items: z
        .array(
          z.object({
            kind: z.enum(["image", "video"]),
            path: z.string(),
            poster: z.string().nullable(),
            width: z.number().int().min(1).max(10000).nullable(),
            height: z.number().int().min(1).max(10000).nullable(),
            duration: z.number().int().min(1).max(3600).nullable(),
            size: z.number().int().min(1).max(104857600).nullable(),
          }),
        )
        .min(1, "Adicione pelo menos uma foto ou vídeo.")
        .max(MAX_PACKAGE_ITEMS, `No máximo ${MAX_PACKAGE_ITEMS} itens.`),
    })
    .superRefine((d, ctx) => {
      const webp = packageMediaPathRe(userId, d.packageId, "webp");
      const mp4 = packageMediaPathRe(userId, d.packageId, "mp4");
      const bad = d.items.some((i) =>
        i.kind === "image"
          ? !webp.test(i.path)
          : !mp4.test(i.path) || !i.poster || !webp.test(i.poster),
      );
      if (bad)
        ctx.addIssue({ code: "custom", path: ["items"], message: "Arquivo de mídia inválido." });
      if (d.coverPath && !profileImagePathRe(userId).test(d.coverPath))
        ctx.addIssue({ code: "custom", path: ["cover"], message: "Capa inválida." });
    });

export async function savePackageAction(input: unknown): Promise<PackageResult> {
  const user = await requireRole(["creator"], "/estudio/pacotes");
  const parsed = schema(user.id).safeParse(input);
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("save_package", {
    p_package_id: d.packageId,
    p_title: d.title,
    p_description: d.description,
    // Postgres aceita null; o tipo gerado não marca o parâmetro como opcional.
    p_category: d.category as string,
    p_price_cents: d.priceCents,
    p_audience: d.audience,
    p_cover_path: d.coverPath as string,
    p_items: d.items,
    p_publish: d.publish,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Você não pode alterar este pacote."
          : error.code === "22023"
            ? "Revise os dados do pacote."
            : "Não foi possível salvar o pacote.",
    };
  revalidatePath("/estudio/pacotes");
  revalidatePath(`/${user.handle}`);
  return {
    ok: true,
    version: data ?? undefined,
    message: d.publish ? `Pacote publicado (versão ${data}).` : "Rascunho salvo.",
  };
}

export async function setPackageStatusAction(fd: FormData): Promise<void> {
  const user = await requireRole(["creator"], "/estudio/pacotes");
  const id = String(fd.get("packageId") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!UUID_RE.test(id) || (status !== "archived" && status !== "published")) return;
  const supabase = await createServerSupabase();
  await supabase.rpc("set_package_status", { p_package_id: id, p_status: status });
  revalidatePath("/estudio/pacotes");
  revalidatePath(`/${user.handle}`);
}

export async function deletePackageDraftAction(fd: FormData): Promise<void> {
  await requireRole(["creator"], "/estudio/pacotes");
  const id = String(fd.get("packageId") ?? "");
  if (!UUID_RE.test(id)) return;
  const supabase = await createServerSupabase();
  const { data: covers } = await supabase
    .from("package_versions")
    .select("cover_path")
    .eq("package_id", id);
  const { data: paths, error } = await supabase.rpc("delete_package_draft", { p_package_id: id });
  if (!error) {
    if (paths && paths.length) await supabase.storage.from(POST_MEDIA_BUCKET).remove(paths);
    const coverPaths = (covers ?? []).map((c) => c.cover_path).filter((p): p is string => !!p);
    if (coverPaths.length) await supabase.storage.from(PACKAGE_COVER_BUCKET).remove(coverPaths);
  }
  revalidatePath("/estudio/pacotes");
}
