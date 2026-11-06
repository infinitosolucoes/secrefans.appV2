"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import type { AdminResult } from "./actions";

const schema = z.object({
  reportId: z.uuid(),
  status: z.enum(["resolved", "dismissed"]),
  reason: z.string().trim().min(5, "Informe o motivo (mín. 5 caracteres).").max(500),
  removeTarget: z.boolean(),
});

export async function decideReportAction(
  _: AdminResult | null,
  fd: FormData,
): Promise<AdminResult> {
  await requireStaffMfa("reports.decide");
  const parsed = schema.safeParse({
    reportId: fd.get("reportId"),
    status: fd.get("status"),
    reason: fd.get("reason"),
    removeTarget: fd.get("removeTarget") === "on",
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("decide_report", {
    p_report_id: parsed.data.reportId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
    p_remove_target: parsed.data.removeTarget,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Acesso negado."
          : error.code === "P0002"
            ? "Esta denúncia já foi decidida."
            : "Não foi possível registrar a decisão.",
    };
  revalidatePath("/super-admin/denuncias");
  return {
    ok: true,
    message:
      parsed.data.status === "resolved"
        ? parsed.data.removeTarget
          ? "Denúncia procedente. Conteúdo retirado."
          : "Denúncia procedente."
        : "Denúncia arquivada.",
  };
}
