import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN = "22222222-2222-2222-2222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";
const TG_MSG = "44444444-4444-4444-8444-444444444444";

const calls: string[] = [];
const deleteGroupMessage = vi.fn(async () => {
  calls.push("delete");
});
const muteTelegramUser = vi.fn(async () => {
  calls.push("mute");
});
const banTelegramUser = vi.fn(async () => {
  calls.push("ban");
});
const removeUserFromGroup = vi.fn(async () => {});
const restoreUserAfterReactivation = vi.fn(async () => {});
const rpc = vi.fn(async () => {
  calls.push("rpc");
  return { error: null };
});

const rows: Record<string, Record<string, unknown>> = {
  reports: { target_type: "telegram_message", target_id: TG_MSG, status: "open" },
  telegram_reported_messages: { chat_id: -1001, message_id: 77, author_telegram_user_id: 555 },
};

function from(table: string) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/session", () => ({
  requireStaffMfa: vi.fn(async () => ({ id: ADMIN })),
}));
vi.mock("@/server/auth/supabase", () => ({
  createServerSupabase: vi.fn(async () => ({ from, rpc })),
}));
vi.mock("@/server/telegram/group", () => ({
  deleteGroupMessage: (...a: unknown[]) => deleteGroupMessage(...(a as [])),
  muteTelegramUser: (...a: unknown[]) => muteTelegramUser(...(a as [])),
  banTelegramUser: (...a: unknown[]) => banTelegramUser(...(a as [])),
  removeUserFromGroup: (...a: unknown[]) => removeUserFromGroup(...(a as [])),
  restoreUserAfterReactivation: (...a: unknown[]) => restoreUserAfterReactivation(...(a as [])),
  BAN_CAUSE_ACCOUNT_BLOCKED: "account_blocked",
}));

import { telegramSettingsSchema } from "@/features/super-admin/telegram-settings";
import { decideReportAction } from "@/features/super-admin/reports";
import { setAccountStatusAction } from "@/features/super-admin/actions";

const validSettings = {
  rulesText: "Seja gentil.",
  welcomeText: "Bem-vindo!",
  allowedDomains: "secretfans.app.br\nexemplo.com",
  warnLimit: "3",
  autoMuteHours: "24",
  floodRepeatLimit: "3",
  floodWindowSeconds: "60",
};

describe("telegramSettingsSchema", () => {
  it("aceita um domínio por linha", () => {
    const r = telegramSettingsSchema.safeParse(validSettings);
    expect(r.success).toBe(true);
    expect(r.data?.allowedDomains).toEqual(["secretfans.app.br", "exemplo.com"]);
    expect(r.data?.warnLimit).toBe(3);
  });

  it("ignora linhas vazias e \\r", () => {
    const r = telegramSettingsSchema.safeParse({
      ...validSettings,
      allowedDomains: "secretfans.app.br\r\n\r\n exemplo.com \r\n",
    });
    expect(r.data?.allowedDomains).toEqual(["secretfans.app.br", "exemplo.com"]);
  });

  it("rejeita domínio sem TLD", () => {
    expect(
      telegramSettingsSchema.safeParse({ ...validSettings, allowedDomains: "exemplo" }).success,
    ).toBe(false);
  });

  it("rejeita lista vazia", () => {
    expect(
      telegramSettingsSchema.safeParse({ ...validSettings, allowedDomains: "  \n" }).success,
    ).toBe(false);
  });

  it("rejeita warnLimit 0", () => {
    expect(telegramSettingsSchema.safeParse({ ...validSettings, warnLimit: "0" }).success).toBe(
      false,
    );
  });

  it("rejeita valores fora das faixas", () => {
    expect(
      telegramSettingsSchema.safeParse({ ...validSettings, autoMuteHours: "169" }).success,
    ).toBe(false);
    expect(
      telegramSettingsSchema.safeParse({ ...validSettings, floodRepeatLimit: "1" }).success,
    ).toBe(false);
    expect(
      telegramSettingsSchema.safeParse({ ...validSettings, floodWindowSeconds: "601" }).success,
    ).toBe(false);
    expect(telegramSettingsSchema.safeParse({ ...validSettings, rulesText: "" }).success).toBe(
      false,
    );
  });
});

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base = { reportId: REPORT, status: "resolved", reason: "violou as regras", ...over };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

describe("decideReportAction com ação no Telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    rows.reports = { target_type: "telegram_message", target_id: TG_MSG, status: "open" };
  });

  it("ban + procedente: bane antes do RPC", async () => {
    const r = await decideReportAction(null, form({ telegramAction: "ban" }));
    expect(r.ok).toBe(true);
    expect(banTelegramUser).toHaveBeenCalledWith(555, ADMIN, "violou as regras");
    expect(calls).toEqual(["ban", "rpc"]);
  });

  it("mute24: silencia por 24 h", async () => {
    await decideReportAction(null, form({ telegramAction: "mute24" }));
    expect(muteTelegramUser).toHaveBeenCalledWith(555, 24, ADMIN, "violou as regras");
    expect(calls).toEqual(["mute", "rpc"]);
  });

  it("delete: apaga a mensagem denunciada", async () => {
    await decideReportAction(null, form({ telegramAction: "delete" }));
    expect(deleteGroupMessage).toHaveBeenCalledWith(-1001, 77);
    expect(calls).toEqual(["delete", "rpc"]);
  });

  it("falha no Telegram: ok false e RPC não chamado", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    banTelegramUser.mockRejectedValueOnce(new Error("api com dado sensível"));
    const r = await decideReportAction(null, form({ telegramAction: "ban" }));
    expect(r).toEqual({
      ok: false,
      message: "Não foi possível executar a ação no Telegram. A denúncia continua aberta.",
    });
    expect(rpc).not.toHaveBeenCalled();
    // Falha registrada no log sem a mensagem original (que pode ter dados).
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("erro interno");
    expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain("sensível");
    errorSpy.mockRestore();
  });

  it("arquivar + ban: nenhuma ação no Telegram", async () => {
    const r = await decideReportAction(null, form({ status: "dismissed", telegramAction: "ban" }));
    expect(r.ok).toBe(true);
    expect(banTelegramUser).not.toHaveBeenCalled();
    expect(calls).toEqual(["rpc"]);
  });

  it("sem telegramAction: padrão none", async () => {
    await decideReportAction(null, form());
    expect(calls).toEqual(["rpc"]);
  });

  it("alvo que não é do Telegram: ignora a ação", async () => {
    rows.reports = { target_type: "post", target_id: TG_MSG, status: "open" };
    await decideReportAction(null, form({ telegramAction: "ban" }));
    expect(banTelegramUser).not.toHaveBeenCalled();
    expect(calls).toEqual(["rpc"]);
  });

  it("denúncia já decidida: não age no Telegram", async () => {
    rows.reports = { target_type: "telegram_message", target_id: TG_MSG, status: "resolved" };
    await decideReportAction(null, form({ telegramAction: "ban" }));
    expect(banTelegramUser).not.toHaveBeenCalled();
    expect(calls).toEqual(["rpc"]);
  });

  it("telegramAction inválida: rejeita", async () => {
    const r = await decideReportAction(null, form({ telegramAction: "kick" }));
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("setAccountStatusAction e o grupo do Telegram", () => {
  const USER = "11111111-1111-4111-8111-111111111111";
  const statusForm = (status: string) => {
    const fd = new FormData();
    fd.set("userId", USER);
    fd.set("status", status);
    fd.set("reason", "motivo do admin");
    return fd;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueio bane com a causa account_blocked", async () => {
    const r = await setAccountStatusAction(null, statusForm("blocked"));
    expect(r).toEqual({ ok: true, message: "Conta bloqueada." });
    expect(removeUserFromGroup).toHaveBeenCalledWith(USER, "motivo do admin", ADMIN, {
      ban: true,
      cause: "account_blocked",
    });
    expect(restoreUserAfterReactivation).not.toHaveBeenCalled();
  });

  it("reativação tenta liberar o grupo", async () => {
    const r = await setAccountStatusAction(null, statusForm("active"));
    expect(r).toEqual({ ok: true, message: "Conta reativada." });
    expect(restoreUserAfterReactivation).toHaveBeenCalledWith(USER, ADMIN);
    expect(removeUserFromGroup).not.toHaveBeenCalled();
  });

  it("falha no Telegram não desfaz a reativação", async () => {
    restoreUserAfterReactivation.mockRejectedValueOnce(new Error("api"));
    const r = await setAccountStatusAction(null, statusForm("active"));
    expect(r).toEqual({
      ok: true,
      message: "Conta reativada. (não foi possível liberar o acesso ao grupo do Telegram)",
    });
  });
});
