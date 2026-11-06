"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { flattenErrors, type FieldErrors } from "@/features/identity/schemas";
import { verificationSubmitSchema } from "./verification";

export interface ActionResult {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
}

const rpcMessage = (code?: string, fallback = "Não foi possível concluir. Tente novamente.") =>
  code === "23505"
    ? "Você já tem uma verificação em andamento."
    : code === "22023"
      ? "Dados inválidos. Revise o formulário."
      : fallback;

export async function submitVerificationAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser("/estudio/verificacao");
  const parsed = verificationSubmitSchema(user.id).safeParse(input);
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("submit_creator_verification", {
    p_legal_name: d.legalName,
    p_birth_date: d.birthDate,
    p_document_front_path: d.documentFrontPath,
    // Postgres aceita null; o tipo gerado não marca o parâmetro como opcional.
    p_document_back_path: d.documentBackPath as string,
    p_selfie_path: d.selfiePath,
    p_rights_consent: d.rightsConsent,
    p_depicted_consent: d.depictedConsent,
  });
  if (error) return { ok: false, message: rpcMessage(error.code) };
  revalidatePath("/estudio", "layout");
  return { ok: true, message: "Verificação enviada. Você será avisado quando houver uma decisão." };
}

export async function appealVerificationAction(
  _: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  await requireUser("/estudio/verificacao");
  const id = String(fd.get("verificationId") ?? "");
  const text = String(fd.get("appeal") ?? "").trim();
  if (text.length < 10)
    return { ok: false, errors: { appeal: "Explique o recurso (mínimo 10 caracteres)." } };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("appeal_creator_verification", {
    p_verification_id: id,
    p_text: text,
  });
  if (error) return { ok: false, message: rpcMessage(error.code) };
  revalidatePath("/estudio", "layout");
  return { ok: true, message: "Recurso enviado. Sua verificação voltou para análise." };
}
