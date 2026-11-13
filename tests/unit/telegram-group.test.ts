import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotApi } from "@/server/telegram/client";
import type { TelegramRepo } from "@/server/telegram/repo";

const GROUP = -1001;
const cfg = { token: "t", webhookSecret: "s", botUsername: "bot", groupId: GROUP };

const telegramConfig = vi.fn();
let api: BotApi;
let repo: TelegramRepo;

vi.mock("@/server/telegram/config", () => ({ telegramConfig: () => telegramConfig() }));
vi.mock("@/server/telegram/client", () => ({
  createBotApi: vi.fn(() => api),
  TelegramApiError: class TelegramApiError extends Error {},
}));
vi.mock("@/server/telegram/repo", () => ({ createTelegramRepo: vi.fn(() => repo) }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://site.test" }) }));

import {
  banTelegramUser,
  deleteGroupMessage,
  muteTelegramUser,
  removeUserFromGroup,
  restoreUserAfterReactivation,
  sweepGroupMembers,
} from "@/server/telegram/group";

function fakeApi(): BotApi {
  return {
    sendMessage: vi.fn(async () => ({ message_id: 1 })),
    deleteMessage: vi.fn(async () => {}),
    approveChatJoinRequest: vi.fn(async () => {}),
    declineChatJoinRequest: vi.fn(async () => {}),
    createChatInviteLink: vi.fn(async () => "https://t.me/+x"),
    restrictChatMember: vi.fn(async () => {}),
    banChatMember: vi.fn(async () => {}),
    unbanChatMember: vi.fn(async () => {}),
    kickChatMember: vi.fn(async () => {}),
    getChatAdministratorIds: vi.fn(async () => []),
  };
}

function fakeRepo(over: Partial<TelegramRepo> = {}): TelegramRepo {
  return {
    markUpdateSeen: vi.fn(async () => true),
    getSettings: vi.fn(),
    consumeLinkCode: vi.fn(),
    userFor: vi.fn(async () => null),
    getMember: vi.fn(async () => ({ status: "member" as const, warnings: 0, mutedUntil: null })),
    upsertMember: vi.fn(async () => {}),
    ensureMember: vi.fn(async () => {}),
    lastBanCause: vi.fn(async () => "account_blocked"),
    markLeft: vi.fn(async () => {}),
    countRecentHash: vi.fn(async () => 0),
    logAction: vi.fn(async () => {}),
    createReport: vi.fn(async () => "r"),
    scheduleDelete: vi.fn(async () => {}),
    takeDueDeletes: vi.fn(async () => []),
    telegramIdForUser: vi.fn(async () => 555),
    listSweepCandidates: vi.fn(async () => []),
    purgeStale: vi.fn(async () => {}),
    ...over,
  } as TelegramRepo;
}

const USER = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";

describe("removeUserFromGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfig.mockReturnValue(cfg);
    api = fakeApi();
    repo = fakeRepo();
  });

  it("bot desligado: não faz nada", async () => {
    telegramConfig.mockReturnValue(null);
    await removeUserFromGroup(USER, "x", ADMIN);
    expect(repo.telegramIdForUser).not.toHaveBeenCalled();
    expect(api.kickChatMember).not.toHaveBeenCalled();
  });

  it("sem vínculo: nenhuma chamada à API", async () => {
    repo = fakeRepo({ telegramIdForUser: vi.fn(async () => null) });
    await removeUserFromGroup(USER, "x", ADMIN, { ban: true });
    expect(api.banChatMember).not.toHaveBeenCalled();
    expect(api.kickChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });

  it("ban: banChatMember, status banned e log telegram.ban com a causa", async () => {
    await removeUserFromGroup(USER, "conta bloqueada", ADMIN, { ban: true, cause: "account_blocked" });
    expect(repo.telegramIdForUser).toHaveBeenCalledWith(USER);
    expect(api.banChatMember).toHaveBeenCalledWith(GROUP, 555);
    expect(api.kickChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).toHaveBeenCalledWith(555, { status: "banned", lastActionBy: ADMIN });
    expect(repo.logAction).toHaveBeenCalledWith(ADMIN, "telegram.ban", 555, "conta bloqueada", {
      cause: "account_blocked",
    });
  });

  it("sem ban: kickChatMember, status left e log telegram.kick", async () => {
    await removeUserFromGroup(USER, "desvinculou", USER);
    expect(api.kickChatMember).toHaveBeenCalledWith(GROUP, 555);
    expect(api.banChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).toHaveBeenCalledWith(555, { status: "left", lastActionBy: USER });
    expect(repo.logAction).toHaveBeenCalledWith(USER, "telegram.kick", 555, "desvinculou");
  });

  it("sem ban e já banido: não chama kick (que desbaniria)", async () => {
    repo = fakeRepo({ getMember: vi.fn(async () => ({ status: "banned" as const, warnings: 0, mutedUntil: null })) });
    await removeUserFromGroup(USER, "desvinculou", USER);
    expect(api.kickChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
  });

  it("erro da API propaga e não grava estado", async () => {
    (api.banChatMember as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("api"));
    await expect(removeUserFromGroup(USER, "x", ADMIN, { ban: true })).rejects.toThrow("api");
    expect(repo.upsertMember).not.toHaveBeenCalled();
  });
});

describe("bloqueio sobre ban de moderação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfig.mockReturnValue(cfg);
    api = fakeApi();
  });

  it("banido pelo moderador -> conta bloqueada -> reativada: continua banido, sem unban", async () => {
    // Estado e auditoria simulados: o /banir do moderador já gravou banned e um telegram.ban sem causa.
    let status: "member" | "banned" | "left" = "banned";
    const bans: (string | null)[] = [null];
    repo = fakeRepo({
      getMember: vi.fn(async () => ({ status, warnings: 0, mutedUntil: null })),
      upsertMember: vi.fn(async (_tg: number, patch: { status?: typeof status }) => {
        if (patch.status) status = patch.status;
      }),
      logAction: vi.fn(async (_a, action, _t, _r, meta?: Record<string, unknown>) => {
        if (action === "telegram.ban") bans.push(typeof meta?.cause === "string" ? meta.cause : null);
      }),
      lastBanCause: vi.fn(async () => bans[bans.length - 1] ?? null),
    });

    await removeUserFromGroup(USER, "conta bloqueada", ADMIN, { ban: true, cause: "account_blocked" });
    expect(api.banChatMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();

    await restoreUserAfterReactivation(USER, ADMIN);
    expect(api.unbanChatMember).not.toHaveBeenCalled();
    expect(status).toBe("banned");
  });
});

describe("restoreUserAfterReactivation", () => {
  const banned = { status: "banned" as const, warnings: 0, mutedUntil: null };

  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfig.mockReturnValue(cfg);
    api = fakeApi();
    repo = fakeRepo({ getMember: vi.fn(async () => banned) });
  });

  it("banido pelo bloqueio da conta: desbane, grava left e audita telegram.unban com a causa", async () => {
    await restoreUserAfterReactivation(USER, ADMIN);
    expect(repo.lastBanCause).toHaveBeenCalledWith(555);
    expect(api.unbanChatMember).toHaveBeenCalledWith(GROUP, 555);
    expect(repo.upsertMember).toHaveBeenCalledWith(555, { status: "left", lastActionBy: ADMIN });
    expect(repo.logAction).toHaveBeenCalledWith(ADMIN, "telegram.unban", 555, "conta reativada", {
      cause: "account_reactivated",
    });
  });

  it("último ban por outro motivo (moderação): continua banido", async () => {
    repo = fakeRepo({ getMember: vi.fn(async () => banned), lastBanCause: vi.fn(async () => null) });
    await restoreUserAfterReactivation(USER, ADMIN);
    expect(api.unbanChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });

  it("não está banido: não faz nada", async () => {
    repo = fakeRepo();
    await restoreUserAfterReactivation(USER, ADMIN);
    expect(repo.lastBanCause).not.toHaveBeenCalled();
    expect(api.unbanChatMember).not.toHaveBeenCalled();
  });

  it("sem linha de membro: não faz nada", async () => {
    repo = fakeRepo({ getMember: vi.fn(async () => null) });
    await restoreUserAfterReactivation(USER, ADMIN);
    expect(api.unbanChatMember).not.toHaveBeenCalled();
  });

  it("sem vínculo ou bot desligado: não faz nada", async () => {
    repo = fakeRepo({ getMember: vi.fn(async () => banned), telegramIdForUser: vi.fn(async () => null) });
    await restoreUserAfterReactivation(USER, ADMIN);
    telegramConfig.mockReturnValue(null);
    await restoreUserAfterReactivation(USER, ADMIN);
    expect(api.unbanChatMember).not.toHaveBeenCalled();
  });

  it("erro da API propaga sem gravar estado nem auditar", async () => {
    (api.unbanChatMember as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("api"));
    await expect(restoreUserAfterReactivation(USER, ADMIN)).rejects.toThrow("api");
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });
});

describe("sweepGroupMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfig.mockReturnValue(cfg);
  });

  it("remove quem está bloqueado ou sem vínculo", async () => {
    const a = fakeApi();
    const r = fakeRepo({
      listSweepCandidates: vi.fn(async () => [
        { tgId: 1, accountStatus: "active" as const },
        { tgId: 2, accountStatus: "blocked" as const },
        { tgId: 3, accountStatus: null },
      ]),
    });
    const result = await sweepGroupMembers({ api: a, repo: r, groupId: GROUP });
    expect(result).toEqual({ removed: 2 });
    expect(a.kickChatMember).toHaveBeenCalledTimes(2);
    expect(a.kickChatMember).toHaveBeenCalledWith(GROUP, 2);
    expect(a.kickChatMember).toHaveBeenCalledWith(GROUP, 3);
    expect(r.upsertMember).toHaveBeenCalledWith(2, { status: "left", lastActionBy: null });
    expect(r.logAction).toHaveBeenCalledWith(null, "telegram.kick", 3, "conta inativa no site");
    expect(r.logAction).toHaveBeenCalledTimes(2);
  });

  it("não remove administradores do grupo", async () => {
    const a = fakeApi();
    (a.getChatAdministratorIds as ReturnType<typeof vi.fn>).mockResolvedValue([3]);
    const r = fakeRepo({
      listSweepCandidates: vi.fn(async () => [{ tgId: 3, accountStatus: null }]),
    });
    expect(await sweepGroupMembers({ api: a, repo: r, groupId: GROUP })).toEqual({ removed: 0 });
    expect(a.kickChatMember).not.toHaveBeenCalled();
  });

  it("falha ao buscar administradores aborta a varredura sem remover ninguém", async () => {
    const a = fakeApi();
    (a.getChatAdministratorIds as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("api"));
    const r = fakeRepo({
      listSweepCandidates: vi.fn(async () => [{ tgId: 3, accountStatus: null }]),
    });
    await expect(sweepGroupMembers({ api: a, repo: r, groupId: GROUP })).rejects.toThrow("api");
    expect(a.kickChatMember).not.toHaveBeenCalled();
    expect(r.upsertMember).not.toHaveBeenCalled();
    expect(r.logAction).not.toHaveBeenCalled();
  });

  it("falha num membro não interrompe os demais", async () => {
    const a = fakeApi();
    (a.kickChatMember as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("api"))
      .mockResolvedValue(undefined);
    const r = fakeRepo({
      listSweepCandidates: vi.fn(async () => [
        { tgId: 2, accountStatus: "deleted" as const },
        { tgId: 3, accountStatus: null },
      ]),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sweepGroupMembers({ api: a, repo: r, groupId: GROUP })).toEqual({ removed: 1 });
    expect(r.upsertMember).toHaveBeenCalledTimes(1);
  });

  it("sem deps e bot desligado: removed 0", async () => {
    telegramConfig.mockReturnValue(null);
    expect(await sweepGroupMembers()).toEqual({ removed: 0 });
  });
});

describe("ações do Super Admin no Telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telegramConfig.mockReturnValue(cfg);
    api = fakeApi();
    repo = fakeRepo();
  });

  it("bot desligado: as três lançam", async () => {
    telegramConfig.mockReturnValue(null);
    await expect(deleteGroupMessage(GROUP, 7)).rejects.toThrow();
    await expect(muteTelegramUser(555, 24, ADMIN, "x")).rejects.toThrow();
    await expect(banTelegramUser(555, ADMIN, "x")).rejects.toThrow();
    expect(api.deleteMessage).not.toHaveBeenCalled();
  });

  it("deleteGroupMessage apaga a mensagem; erro da API propaga", async () => {
    await deleteGroupMessage(GROUP, 7);
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 7);
    (api.deleteMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("api"));
    await expect(deleteGroupMessage(GROUP, 7)).rejects.toThrow("api");
  });

  it("muteTelegramUser restringe, grava muted e audita", async () => {
    await muteTelegramUser(555, 24, ADMIN, "denúncia");
    expect(api.restrictChatMember).toHaveBeenCalledWith(GROUP, 555, expect.any(Number));
    expect(repo.upsertMember).toHaveBeenCalledWith(
      555,
      expect.objectContaining({ status: "muted", lastActionBy: ADMIN }),
    );
    expect(repo.logAction).toHaveBeenCalledWith(
      ADMIN,
      "telegram.mute",
      555,
      "denúncia",
      expect.objectContaining({ hours: 24 }),
    );
  });

  it("muteTelegramUser: erro da API propaga sem auditar", async () => {
    (api.restrictChatMember as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("api"));
    await expect(muteTelegramUser(555, 24, ADMIN, "x")).rejects.toThrow("api");
    expect(repo.logAction).not.toHaveBeenCalled();
  });

  it("banTelegramUser bane, grava banned e audita", async () => {
    await banTelegramUser(555, ADMIN, "denúncia");
    expect(api.banChatMember).toHaveBeenCalledWith(GROUP, 555);
    expect(repo.upsertMember).toHaveBeenCalledWith(555, { status: "banned", lastActionBy: ADMIN });
    expect(repo.logAction).toHaveBeenCalledWith(
      ADMIN,
      "telegram.ban",
      555,
      "denúncia",
      expect.any(Object),
    );
  });

  it("banTelegramUser: erro da API propaga sem auditar", async () => {
    (api.banChatMember as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("api"));
    await expect(banTelegramUser(555, ADMIN, "x")).rejects.toThrow("api");
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });
});
