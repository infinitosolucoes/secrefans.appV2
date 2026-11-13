"use server";

import { revalidatePath } from "next/cache";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { parsePriceToCents } from "@/features/content/schemas";
import { EDITABLE_SETTINGS, isEditableSetting } from "./settings";

export interface SettingResult {
  ok: boolean;
  message: string;
}

/** Super Admin (MFA): altera uma configuração com motivo; o banco valida a faixa e audita. */
export async function updateSettingAction(
  _: SettingResult | null,
  fd: FormData,
): Promise<SettingResult> {
  await requireStaffMfa("settings.manage");
  const key = String(fd.get("key") ?? "");
  if (!isEditableSetting(key)) return { ok: false, message: "Configuração não editável." };
  const def = EDITABLE_SETTINGS[key];
  const raw = String(fd.get("value") ?? "").trim();
  const value = def.unit === "brl" ? parsePriceToCents(raw) : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (value === null || Number.isNaN(value) || value < def.min || value > def.max)
    return { ok: false, message: "Valor fora da faixa permitida." };
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, message: "Informe o motivo (mín. 5 caracteres)." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_platform_setting", {
    p_key: key,
    p_value: value,
    p_reason: reason,
  });
  if (error)
    return {
      ok: false,
      message: error.code === "42501" ? "Acesso negado." : "Não foi possível salvar.",
    };
  revalidatePath("/super-admin/configuracoes");
  return { ok: true, message: "Configuração salva e registrada na auditoria." };
}
