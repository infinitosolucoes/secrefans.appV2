import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleUpdate, resetAdminCache, type Ctx } from "@/server/telegram/handler";
import type { TelegramRepo, TelegramSettings } from "@/server/telegram/repo";
import type { BotApi } from "@/server/telegram/client";
import type { Message, Update, User } from "@/server/telegram/types";

const GROUP = -1001;
const NOW = new Date("2026-11-12T12:00:00Z");
const NOW_UNIX = Math.floor(NOW.getTime() / 1000);

const SETTINGS: TelegramSettings = {
  rulesText: "Regras do grupo",
  welcomeText: "Bem-vindo, {nome}!",
  allowedDomains: ["secretfans.app.br"],
  warnLimit: 3,
  autoMuteHours: 24,
  floodRepeatLimit: 3,
  floodWindowSeconds: 60,
};

const ADMIN: User = { id: 10, is_bot: false, first_name: "Mod" };
const PLAIN_ADMIN: User = { id: 11, is_bot: false, first_name: "Admin" };
const FAN: User = { id: 20, is_bot: false, first_name: "Ana" };
const OTHER: User = { id: 30, is_bot: false, first_name: "Beto" };

function fakeApi() {
  return {
    sendMessage: vi.fn<BotApi["sendMessage"]>(async () => ({ message_id: 900 })),
    deleteMessage: vi.fn<BotApi["deleteMessage"]>(async () => {}),
    approveChatJoinRequest: vi.fn<BotApi["approveChatJoinRequest"]>(async () => {}),
    declineChatJoinRequest: vi.fn<BotApi["declineChatJoinRequest"]>(async () => {}),
    createChatInviteLink: vi.fn<BotApi["createChatInviteLink"]>(async () => "https://t.me/+convite"),
    restrictChatMember: vi.fn<BotApi["restrictChatMember"]>(async () => {}),
    banChatMember: vi.fn<BotApi["banChatMember"]>(async () => {}),
    unbanChatMember: vi.fn<BotApi["unbanChatMember"]>(async () => {}),
    kickChatMember: vi.fn<BotApi["kickChatMember"]>(async () => {}),
    getChatAdministratorIds: vi.fn<BotApi["getChatAdministratorIds"]>(async () => [ADMIN.id, PLAIN_ADMIN.id]),
  } satisfies BotApi;
}

function fakeRepo() {
  return {
    markUpdateSeen: vi.fn(async () => true),
    getSettings: vi.fn(async () => SETTINGS),
    consumeLinkCode: vi.fn<TelegramRepo["consumeLinkCode"]>(async () => ({ ok: true, userId: "u-fan" })),
    userFor: vi.fn<TelegramRepo["userFor"]>(async (tgId: number) => {
      if (tgId === ADMIN.id) return { userId: "u-mod", status: "active", canModerate: true };
      if (tgId === PLAIN_ADMIN.id) return { userId: "u-admin", status: "active", canModerate: false };
      if (tgId === FAN.id) return { userId: "u-fan", status: "active", canModerate: false };
      return null;
    }),
    getMember: vi.fn<TelegramRepo["getMember"]>(async () => null),
    upsertMember: vi.fn(async () => {}),
    ensureMember: vi.fn(async () => {}),
    lastBanCause: vi.fn<TelegramRepo["lastBanCause"]>(async () => null),
    markLeft: vi.fn(async () => {}),
    countRecentHash: vi.fn(async () => 0),
    logAction: vi.fn(async () => {}),
    createReport: vi.fn(async () => "rep-1"),
    scheduleDelete: vi.fn(async () => {}),
    takeDueDeletes: vi.fn<TelegramRepo["takeDueDeletes"]>(async () => []),
    telegramIdForUser: vi.fn<TelegramRepo["telegramIdForUser"]>(async () => null),
    listSweepCandidates: vi.fn<TelegramRepo["listSweepCandidates"]>(async () => []),
    purgeStale: vi.fn(async () => {}),
  } satisfies TelegramRepo;
}

let api: ReturnType<typeof fakeApi>;
let repo: ReturnType<typeof fakeRepo>;
let ctx: Ctx;

beforeEach(() => {
  resetAdminCache();
  api = fakeApi();
  repo = fakeRepo();
  ctx = {
    api,
    repo,
    config: { token: "t", webhookSecret: "s", botUsername: "SfBot", groupId: GROUP },
    now: () => NOW,
    siteUrl: "https://secretfans.app.br",
  };
});

let nextId = 1;
function groupMsg(from: User, text: string, extra: Partial<Message> = {}): Update {
  return {
    update_id: nextId++,
    message: { message_id: 500, from, chat: { id: GROUP, type: "supergroup" }, text, ...extra },
  };
}

function privateMsg(from: User, text: string): Update {
  return {
    update_id: nextId++,
    message: { message_id: 1, from, chat: { id: from.id, type: "private" }, text },
  };
}

function replyTo(author: User, extra: Partial<Message> = {}): Message {
  return { message_id: 400, from: author, chat: { id: GROUP, type: "supergroup" }, text: "oi", ...extra };
}

describe("/start no privado", () => {
  it("código válido vincula e envia regras com o convite", async () => {
    await handleUpdate(ctx, privateMsg(FAN, "/start abc123"));
    expect(repo.consumeLinkCode).toHaveBeenCalledWith("abc123", FAN.id, null);
    expect(api.createChatInviteLink).toHaveBeenCalledWith(GROUP);
    const text = api.sendMessage.mock.calls[0]?.[1] ?? "";
    expect(api.sendMessage.mock.calls[0]?.[0]).toBe(FAN.id);
    expect(text).toContain("Regras do grupo");
    expect(text).toContain("https://t.me/+convite");
  });

  it("código inválido: orienta a gerar outro, sem convite", async () => {
    repo.consumeLinkCode.mockResolvedValueOnce({ ok: false, error: "invalid" });
    await handleUpdate(ctx, privateMsg(FAN, "/start velho"));
    expect(api.createChatInviteLink).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(
      FAN.id,
      "Link expirado ou já usado. Gere outro em https://secretfans.app.br/conta/perfil",
    );
  });

  it("Telegram já vinculado a outra conta: recusa, sem convite", async () => {
    repo.consumeLinkCode.mockResolvedValueOnce({ ok: false, error: "taken" });
    await handleUpdate(ctx, privateMsg(FAN, "/start abc"));
    expect(api.createChatInviteLink).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(FAN.id, "Este Telegram já está vinculado a outra conta Secretfans");
  });

  it("conta inativa", async () => {
    repo.consumeLinkCode.mockResolvedValueOnce({ ok: false, error: "inactive" });
    await handleUpdate(ctx, privateMsg(FAN, "/start abc"));
    expect(api.sendMessage).toHaveBeenCalledWith(FAN.id, "Sua conta Secretfans não está ativa");
  });

  it("/start sem código manda instrução com o link do site", async () => {
    await handleUpdate(ctx, privateMsg(FAN, "/start"));
    expect(repo.consumeLinkCode).not.toHaveBeenCalled();
    expect(api.sendMessage.mock.calls[0]?.[1]).toContain("https://secretfans.app.br/conta/perfil");
  });
});

describe("pedido de entrada", () => {
  const join = (from: User): Update => ({
    update_id: nextId++,
    chat_join_request: { chat: { id: GROUP, type: "supergroup" }, from, user_chat_id: from.id },
  });

  it("usuário ativo é aprovado", async () => {
    await handleUpdate(ctx, join(FAN));
    expect(api.approveChatJoinRequest).toHaveBeenCalledWith(GROUP, FAN.id);
    expect(api.declineChatJoinRequest).not.toHaveBeenCalled();
  });

  it("sem vínculo é recusado e avisado no privado", async () => {
    await handleUpdate(ctx, join(OTHER));
    expect(api.declineChatJoinRequest).toHaveBeenCalledWith(GROUP, OTHER.id);
    expect(api.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(api.sendMessage.mock.calls[0]?.[0]).toBe(OTHER.id);
  });

  it("conta bloqueada é recusada", async () => {
    repo.userFor.mockResolvedValueOnce({ userId: "u-x", status: "blocked", canModerate: false });
    await handleUpdate(ctx, join(FAN));
    expect(api.declineChatJoinRequest).toHaveBeenCalledWith(GROUP, FAN.id);
  });

  it("membro banido é recusado", async () => {
    repo.getMember.mockResolvedValueOnce({ status: "banned", warnings: 0, mutedUntil: null });
    await handleUpdate(ctx, join(FAN));
    expect(api.declineChatJoinRequest).toHaveBeenCalledWith(GROUP, FAN.id);
    expect(api.approveChatJoinRequest).not.toHaveBeenCalled();
  });

  it("falha ao avisar no privado é ignorada", async () => {
    const { TelegramApiError } = await import("@/server/telegram/client");
    api.sendMessage.mockRejectedValueOnce(new TelegramApiError("sendMessage", 403, "bot was blocked"));
    await expect(handleUpdate(ctx, join(OTHER))).resolves.toBeUndefined();
    expect(api.declineChatJoinRequest).toHaveBeenCalled();
  });
});

describe("entrada e saída", () => {
  const member = (
    user: User,
    oldStatus: string,
    newStatus: string,
    flags: { oldIsMember?: boolean; newIsMember?: boolean } = {},
  ): Update => ({
    update_id: nextId++,
    chat_member: {
      chat: { id: GROUP, type: "supergroup" },
      from: user,
      old_chat_member: { status: oldStatus, is_member: flags.oldIsMember },
      new_chat_member: { status: newStatus, user, is_member: flags.newIsMember },
    },
  });

  it("entrada grava membro, envia boas-vindas com o nome e agenda a exclusão em 300 s", async () => {
    await handleUpdate(ctx, member(FAN, "left", "member"));
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, { status: "member" });
    expect(api.sendMessage).toHaveBeenCalledWith(GROUP, "Bem-vindo, Ana!");
    expect(repo.scheduleDelete).toHaveBeenCalledWith(GROUP, 900, 300);
  });

  it("saída usa a escrita condicional markLeft (não sobrescreve banned)", async () => {
    await handleUpdate(ctx, member(FAN, "member", "left"));
    expect(repo.markLeft).toHaveBeenCalledWith(FAN.id);
    expect(repo.getMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
  });

  it("kicked (gerado pelo ban) também passa só por markLeft", async () => {
    await handleUpdate(ctx, member(FAN, "member", "kicked"));
    expect(repo.markLeft).toHaveBeenCalledWith(FAN.id);
    expect(repo.upsertMember).not.toHaveBeenCalled();
  });

  it("restrito que sai do grupo (is_member=false) conta como saída", async () => {
    await handleUpdate(ctx, member(FAN, "restricted", "restricted", { oldIsMember: true, newIsMember: false }));
    expect(repo.markLeft).toHaveBeenCalledWith(FAN.id);
  });

  it("fim de restrição de quem está no grupo não repete boas-vindas", async () => {
    await handleUpdate(ctx, member(FAN, "restricted", "member", { oldIsMember: true }));
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(repo.markLeft).not.toHaveBeenCalled();
  });

  it("restrito fora do grupo que volta como member recebe boas-vindas", async () => {
    await handleUpdate(ctx, member(FAN, "restricted", "member", { oldIsMember: false }));
    expect(api.sendMessage).toHaveBeenCalledWith(GROUP, "Bem-vindo, Ana!");
  });

  it("silenciado que desvincula e volta: reaplica a restrição até muted_until e mantém muted", async () => {
    const until = new Date(NOW.getTime() + 5 * 3600 * 1000);
    repo.getMember.mockResolvedValue({ status: "left", warnings: 0, mutedUntil: until.toISOString() });
    await handleUpdate(ctx, member(FAN, "left", "member"));
    expect(api.restrictChatMember).toHaveBeenCalledWith(GROUP, FAN.id, Math.floor(until.getTime() / 1000));
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, { status: "muted" });
    expect(repo.upsertMember).not.toHaveBeenCalledWith(FAN.id, { status: "member" });
  });

  it("silêncio já vencido não é reaplicado", async () => {
    const past = new Date(NOW.getTime() - 3600 * 1000);
    repo.getMember.mockResolvedValue({ status: "left", warnings: 0, mutedUntil: past.toISOString() });
    await handleUpdate(ctx, member(FAN, "left", "member"));
    expect(api.restrictChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, { status: "member" });
  });

  it("silêncio a menos de 30 s do fim não é reaplicado (o Telegram trataria como permanente)", async () => {
    const soon = new Date(NOW.getTime() + 10 * 1000);
    repo.getMember.mockResolvedValue({ status: "left", warnings: 0, mutedUntil: soon.toISOString() });
    await handleUpdate(ctx, member(FAN, "left", "member"));
    expect(api.restrictChatMember).not.toHaveBeenCalled();
  });

  it("entrada já como restrito (is_member=true) vinda de fora conta como entrada", async () => {
    await handleUpdate(ctx, member(FAN, "left", "restricted", { newIsMember: true }));
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, { status: "member" });
    expect(repo.markLeft).not.toHaveBeenCalled();
  });

  it("restrito vindo de kicked também conta como entrada", async () => {
    await handleUpdate(ctx, member(FAN, "kicked", "restricted", { newIsMember: true }));
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, { status: "member" });
  });

  it("restrição aplicada a quem já está no grupo não é entrada", async () => {
    await handleUpdate(ctx, member(FAN, "member", "restricted", { newIsMember: true }));
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.markLeft).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});

describe("comandos de moderação", () => {
  it("/banir em resposta, autor admin e moderador", async () => {
    await handleUpdate(ctx, groupMsg(ADMIN, "/banir spam pesado", { reply_to_message: replyTo(FAN) }));
    expect(api.banChatMember).toHaveBeenCalledWith(GROUP, FAN.id);
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, expect.objectContaining({ status: "banned" }));
    expect(repo.logAction).toHaveBeenCalledWith("u-mod", "telegram.ban", FAN.id, "spam pesado", expect.anything());
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.sendMessage.mock.calls[0]?.[0]).toBe(GROUP);
    expect(repo.scheduleDelete).toHaveBeenCalledWith(GROUP, 900, 30);
    // A Bot API vem antes de gravar "banned": se ela falhar, o banco não diz banido com a pessoa no grupo.
    expect(api.banChatMember.mock.invocationCallOrder[0]).toBeLessThan(
      repo.upsertMember.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("/banir com falha na Bot API não grava banned nem audita", async () => {
    const { TelegramApiError } = await import("@/server/telegram/client");
    api.banChatMember.mockRejectedValueOnce(new TelegramApiError("banChatMember", 400, "x"));
    await expect(
      handleUpdate(ctx, groupMsg(ADMIN, "/banir x", { reply_to_message: replyTo(FAN) })),
    ).rejects.toThrow();
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });

  it("apaga as mensagens vencidas antes de processar", async () => {
    repo.takeDueDeletes.mockResolvedValueOnce([{ chatId: GROUP, messageId: 77 }]);
    await handleUpdate(ctx, groupMsg(ADMIN, "/banir", { reply_to_message: replyTo(FAN) }));
    expect(repo.takeDueDeletes).toHaveBeenCalledWith(NOW);
    expect(api.deleteMessage.mock.calls[0]).toEqual([GROUP, 77]);
    expect(api.deleteMessage.mock.invocationCallOrder[0]).toBeLessThan(
      api.banChatMember.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("erros ao apagar mensagens vencidas são ignorados", async () => {
    repo.takeDueDeletes.mockRejectedValueOnce(new Error("db fora"));
    await handleUpdate(ctx, groupMsg(ADMIN, "/banir", { reply_to_message: replyTo(FAN) }));
    expect(api.banChatMember).toHaveBeenCalled();
  });

  it("admin sem permissão de moderar: só apaga o comando", async () => {
    await handleUpdate(ctx, groupMsg(PLAIN_ADMIN, "/banir", { reply_to_message: replyTo(FAN) }));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.banChatMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });

  it("moderador vinculado que não é admin do grupo: só apaga", async () => {
    api.getChatAdministratorIds.mockResolvedValue([PLAIN_ADMIN.id]);
    await handleUpdate(ctx, groupMsg(ADMIN, "/banir", { reply_to_message: replyTo(FAN) }));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.banChatMember).not.toHaveBeenCalled();
  });

  it("/banir sem resposta: só apaga", async () => {
    await handleUpdate(ctx, groupMsg(ADMIN, "/banir"));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.banChatMember).not.toHaveBeenCalled();
  });

  it("/banir em resposta a um admin: só apaga", async () => {
    await handleUpdate(ctx, groupMsg(ADMIN, "/banir", { reply_to_message: replyTo(PLAIN_ADMIN) }));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.banChatMember).not.toHaveBeenCalled();
  });

  it("/silenciar 7d restringe até o prazo", async () => {
    await handleUpdate(ctx, groupMsg(ADMIN, "/silenciar 7d flood", { reply_to_message: replyTo(FAN) }));
    expect(api.restrictChatMember).toHaveBeenCalledWith(GROUP, FAN.id, NOW_UNIX + 168 * 3600);
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, expect.objectContaining({ status: "muted" }));
    expect(repo.logAction).toHaveBeenCalledWith("u-mod", "telegram.mute", FAN.id, "flood", expect.anything());
  });

  it("/desbanir libera e grava left", async () => {
    repo.getMember.mockResolvedValue({ status: "banned", warnings: 0, mutedUntil: null });
    await handleUpdate(ctx, groupMsg(ADMIN, "/desbanir", { reply_to_message: replyTo(FAN) }));
    expect(api.unbanChatMember).toHaveBeenCalledWith(GROUP, FAN.id);
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, expect.objectContaining({ status: "left" }));
    expect(repo.logAction).toHaveBeenCalledWith("u-mod", "telegram.unban", FAN.id, "", expect.anything());
  });

  it("/desbanir em quem não está banido: só apaga o comando", async () => {
    repo.getMember.mockResolvedValue({ status: "member", warnings: 1, mutedUntil: null });
    await handleUpdate(ctx, groupMsg(ADMIN, "/desbanir", { reply_to_message: replyTo(FAN) }));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.unbanChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("/desbanir sem registro de membro: só apaga o comando", async () => {
    await handleUpdate(ctx, groupMsg(ADMIN, "/desbanir", { reply_to_message: replyTo(FAN) }));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.unbanChatMember).not.toHaveBeenCalled();
  });

  it("/advertir soma advertência com o moderador como ator", async () => {
    repo.getMember.mockResolvedValue({ status: "member", warnings: 0, mutedUntil: null });
    await handleUpdate(ctx, groupMsg(ADMIN, "/advertir chato", { reply_to_message: replyTo(FAN) }));
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, expect.objectContaining({ warnings: 1 }));
    expect(repo.logAction).toHaveBeenCalledWith("u-mod", "telegram.warn", FAN.id, "chato", expect.anything());
    expect(api.restrictChatMember).not.toHaveBeenCalled();
  });
});

describe("antispam", () => {
  const link = (from: User) =>
    groupMsg(from, "veja https://spam.com", { entities: [{ type: "url", offset: 5, length: 15 }] });

  it("link proibido de membro comum: apaga e adverte", async () => {
    repo.getMember.mockResolvedValue({ status: "member", warnings: 0, mutedUntil: null });
    await handleUpdate(ctx, link(FAN));
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(repo.upsertMember).toHaveBeenCalledWith(FAN.id, expect.objectContaining({ warnings: 1 }));
    expect(repo.logAction).toHaveBeenCalledWith(null, "telegram.warn", FAN.id, "spam:link", expect.anything());
    expect(repo.logAction).toHaveBeenCalledWith(null, "telegram.spam_deleted", FAN.id, "spam:link", expect.anything());
    expect(api.restrictChatMember).not.toHaveBeenCalled();
  });

  it("3ª advertência silencia por auto_mute_hours e zera", async () => {
    repo.getMember.mockResolvedValue({ status: "member", warnings: 2, mutedUntil: null });
    await handleUpdate(ctx, link(FAN));
    expect(api.restrictChatMember).toHaveBeenCalledWith(GROUP, FAN.id, NOW_UNIX + 24 * 3600);
    expect(repo.upsertMember).toHaveBeenCalledWith(
      FAN.id,
      expect.objectContaining({ status: "muted", warnings: 0 }),
    );
  });

  it("link de um admin não é apagado", async () => {
    await handleUpdate(ctx, link(ADMIN));
    expect(api.deleteMessage).not.toHaveBeenCalled();
  });

  it("mensagem de bot é ignorada", async () => {
    await handleUpdate(ctx, link({ id: 99, is_bot: true, first_name: "OutroBot" }));
    expect(api.deleteMessage).not.toHaveBeenCalled();
  });

  it("flood conta mensagens repetidas recentes", async () => {
    repo.countRecentHash.mockResolvedValueOnce(2);
    await handleUpdate(ctx, groupMsg(FAN, "compre já"));
    expect(repo.countRecentHash).toHaveBeenCalledWith(FAN.id, expect.any(String), 60);
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
  });

  it("autor de mensagem no grupo é registrado como membro se não houver linha (sem boas-vindas)", async () => {
    await handleUpdate(ctx, groupMsg(OTHER, "bom dia"));
    expect(repo.ensureMember).toHaveBeenCalledWith(OTHER.id);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("edição de mensagem com link proibido: apaga e adverte", async () => {
    repo.getMember.mockResolvedValue({ status: "member", warnings: 0, mutedUntil: null });
    const u: Update = {
      update_id: nextId++,
      edited_message: {
        message_id: 501,
        from: FAN,
        chat: { id: GROUP, type: "supergroup" },
        text: "veja https://spam.com",
        entities: [{ type: "url", offset: 5, length: 15 }],
      },
    };
    await handleUpdate(ctx, u);
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 501);
    expect(repo.logAction).toHaveBeenCalledWith(null, "telegram.spam_deleted", FAN.id, "spam:link", expect.anything());
  });

  it("edição não conta para flood (não é mensagem nova)", async () => {
    repo.countRecentHash.mockResolvedValue(99);
    const u: Update = {
      update_id: nextId++,
      edited_message: { message_id: 501, from: FAN, chat: { id: GROUP, type: "supergroup" }, text: "compre já" },
    };
    await handleUpdate(ctx, u);
    expect(repo.countRecentHash).not.toHaveBeenCalled();
    expect(api.deleteMessage).not.toHaveBeenCalled();
  });

  it("comando editado não é executado", async () => {
    const u: Update = {
      update_id: nextId++,
      edited_message: {
        message_id: 501,
        from: ADMIN,
        chat: { id: GROUP, type: "supergroup" },
        text: "/banir x",
        reply_to_message: replyTo(FAN),
      },
    };
    await handleUpdate(ctx, u);
    expect(api.banChatMember).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
  });

  it("edição no privado é ignorada", async () => {
    const u: Update = {
      update_id: nextId++,
      edited_message: { message_id: 1, from: FAN, chat: { id: FAN.id, type: "private" }, text: "/start abc" },
    };
    await handleUpdate(ctx, u);
    expect(repo.consumeLinkCode).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("mensagem normal não é apagada", async () => {
    await handleUpdate(ctx, groupMsg(FAN, "bom dia"));
    expect(api.deleteMessage).not.toHaveBeenCalled();
    expect(repo.logAction).not.toHaveBeenCalled();
  });
});

describe("denúncias", () => {
  it("/denunciar menor em resposta a foto com legenda", async () => {
    const target = replyTo(OTHER, { text: undefined, caption: "legenda", photo: [{}] });
    await handleUpdate(ctx, groupMsg(FAN, "/denunciar menor", { reply_to_message: target }));
    expect(repo.createReport).toHaveBeenCalledWith({
      reporterUserId: "u-fan",
      reason: "menor_de_idade",
      details: "",
      chatId: GROUP,
      messageId: 400,
      authorTgId: OTHER.id,
      text: "legenda",
      hasMedia: true,
    });
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
    expect(api.sendMessage.mock.calls[0]?.[0]).toBe(FAN.id);
  });

  it("sem vínculo: só apaga o comando", async () => {
    await handleUpdate(ctx, groupMsg(OTHER, "/denunciar spam", { reply_to_message: replyTo(FAN) }));
    expect(repo.createReport).not.toHaveBeenCalled();
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
  });

  it("sem resposta: só apaga o comando", async () => {
    await handleUpdate(ctx, groupMsg(FAN, "/denunciar spam"));
    expect(repo.createReport).not.toHaveBeenCalled();
    expect(api.deleteMessage).toHaveBeenCalledWith(GROUP, 500);
  });

  it("falha na confirmação privada é ignorada", async () => {
    const { TelegramApiError } = await import("@/server/telegram/client");
    api.sendMessage.mockRejectedValueOnce(new TelegramApiError("sendMessage", 403, "Forbidden"));
    await expect(
      handleUpdate(ctx, groupMsg(FAN, "/denunciar", { reply_to_message: replyTo(OTHER) })),
    ).resolves.toBeUndefined();
    expect(repo.createReport).toHaveBeenCalled();
  });
});

describe("outros chats", () => {
  it("update de outro grupo é ignorado", async () => {
    const u: Update = {
      update_id: nextId++,
      message: { message_id: 1, from: FAN, chat: { id: -999, type: "supergroup" }, text: "/banir" },
    };
    await handleUpdate(ctx, u);
    const calls = [...Object.values(api), ...Object.values(repo)].reduce((n, f) => n + f.mock.calls.length, 0);
    expect(calls).toBe(0);
  });
});
