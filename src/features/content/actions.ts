"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, requireRole, requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { flattenErrors, type FieldErrors } from "@/features/identity/schemas";
import { POST_MEDIA_BUCKET, UUID_RE } from "./constants";
import { commentSchema, postInputSchema, reportSchema } from "./schemas";

export interface ActionResult {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  id?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

/** Cria a publicação (rascunho ou publicada) depois que as fotos já foram enviadas ao storage. */
export async function savePostAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole(["creator"], "/estudio/publicar");
  const parsed = postInputSchema(user.id).safeParse(input);
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("posts").insert({
    id: d.postId,
    creator_id: user.id,
    body: d.body,
    visibility: d.visibility,
    price_cents: d.visibility === "ppv" ? d.priceCents : null,
    status: d.publish ? "published" : "draft",
    // O banco troca pelo horário do servidor; publicar sem declarar é recusado lá também.
    content_attested_at: d.attested ? new Date().toISOString() : null,
  });
  if (error) return fail("Não foi possível salvar a publicação. Tente novamente.");

  if (d.media.length > 0) {
    const { error: mediaError } = await supabase.from("post_media").insert(
      d.media.map((m, position) => ({
        post_id: d.postId,
        creator_id: user.id,
        kind: m.kind,
        storage_path: m.path,
        poster_path: m.poster,
        width: m.width,
        height: m.height,
        duration_seconds: m.duration,
        size_bytes: m.size,
        position,
      })),
    );
    if (mediaError) {
      // Desfaz: o post ainda é rascunho ou acabou de ser criado; remove linhas e arquivos.
      await supabase.from("posts").update({ status: "draft" }).eq("id", d.postId);
      await supabase.from("posts").delete().eq("id", d.postId);
      await supabase.storage
        .from(POST_MEDIA_BUCKET)
        .remove(d.media.flatMap((m) => (m.poster ? [m.path, m.poster] : [m.path])));
      return fail("Falha ao registrar as fotos. Tente novamente.");
    }
  }

  revalidatePath("/estudio");
  revalidatePath(`/${user.handle}`);
  return {
    ok: true,
    id: d.postId,
    message: d.publish ? "Publicação no ar." : "Rascunho salvo.",
  };
}

export async function setPostStatusAction(fd: FormData): Promise<void> {
  const user = await requireRole(["creator"], "/estudio");
  const id = String(fd.get("postId") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!UUID_RE.test(id) || (status !== "published" && status !== "draft")) return;
  const supabase = await createServerSupabase();
  // Publicar um rascunho ainda sem declaração exige marcar a declaração (o banco confere).
  const attest = status === "published" && fd.get("attest") === "on";
  await supabase
    .from("posts")
    .update(attest ? { status, content_attested_at: new Date().toISOString() } : { status })
    .eq("id", id)
    .eq("creator_id", user.id);
  revalidatePath("/estudio");
  revalidatePath(`/${user.handle}`);
}

/** Exclui um rascunho e os arquivos dele. Publicados precisam voltar a rascunho antes. */
export async function deleteDraftAction(fd: FormData): Promise<void> {
  const user = await requireRole(["creator"], "/estudio");
  const id = String(fd.get("postId") ?? "");
  if (!UUID_RE.test(id)) return;
  const supabase = await createServerSupabase();
  const { data: media } = await supabase
    .from("post_media")
    .select("storage_path, poster_path")
    .eq("post_id", id);
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("creator_id", user.id)
    .eq("status", "draft");
  const paths = (media ?? []).flatMap((m) =>
    m.poster_path ? [m.storage_path, m.poster_path] : [m.storage_path],
  );
  if (!error && paths.length > 0) await supabase.storage.from(POST_MEDIA_BUCKET).remove(paths);
  revalidatePath("/estudio");
}

export async function toggleLikeAction(postId: string, like: boolean): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Entre para curtir.");
  if (!UUID_RE.test(postId)) return fail("Publicação inválida.");
  const supabase = await createServerSupabase();
  const { error } = like
    ? await supabase
        .from("post_likes")
        .upsert(
          { post_id: postId, user_id: user.id },
          { onConflict: "post_id,user_id", ignoreDuplicates: true },
        )
    : await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  return error ? fail("Não foi possível registrar a curtida.") : { ok: true };
}

export async function toggleFollowAction(
  creatorId: string,
  follow: boolean,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Entre para seguir criadores.");
  if (!UUID_RE.test(creatorId)) return fail("Criador inválido.");
  const supabase = await createServerSupabase();
  const { error } = follow
    ? await supabase
        .from("follows")
        .upsert(
          { follower_id: user.id, creator_id: creatorId },
          { onConflict: "follower_id,creator_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("creator_id", creatorId);
  if (error) return fail("Não foi possível atualizar. Tente novamente.");
  revalidatePath("/inicio");
  return { ok: true };
}

export async function addCommentAction(
  _: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = commentSchema.safeParse({ postId: fd.get("postId"), body: fd.get("body") });
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("post_comments").insert({
    post_id: parsed.data.postId,
    author_id: user.id,
    body: parsed.data.body,
  });
  if (error) return fail("Não foi possível comentar nesta publicação.");
  revalidatePath(`/p/${parsed.data.postId}`);
  return { ok: true };
}

export async function deleteCommentAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("commentId") ?? "");
  const postId = String(fd.get("postId") ?? "");
  if (!UUID_RE.test(id)) return;
  const supabase = await createServerSupabase();
  await supabase.from("post_comments").delete().eq("id", id).eq("author_id", user.id);
  if (UUID_RE.test(postId)) revalidatePath(`/p/${postId}`);
}

export async function reportAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Entre para denunciar.");
  const parsed = reportSchema.safeParse({
    targetType: fd.get("targetType"),
    targetId: fd.get("targetId"),
    reason: fd.get("reason"),
    details: fd.get("details") ?? "",
  });
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });
  if (error?.code === "23505")
    return { ok: true, message: "Você já denunciou este item. Estamos analisando." };
  if (error) return fail("Não foi possível enviar a denúncia.");
  return { ok: true, message: "Denúncia enviada. Nossa equipe vai analisar." };
}
