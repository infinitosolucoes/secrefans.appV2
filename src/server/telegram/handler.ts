import "server-only";
import { detectSpam, textHash } from "./antispam";
import { TelegramApiError, type BotApi } from "./client";
import { parseCommand, type Command } from "./commands";
import type { TelegramConfig } from "./config";
import { applyBan, applyMute, applyUnban, applyWarning } from "./punishments";
import type { TelegramRepo } from "./repo";
import type { ChatJoinRequest, ChatMemberUpdated, Message, Update, User } from "./types";

export interface Ctx {
  api: BotApi;
  repo: TelegramRepo;
  config: TelegramConfig;
  now?: () => Date;
  siteUrl: string;
}

const CONFIRMATION_TTL_S = 30;
const ADMIN_CACHE_MS = 60_000;

function nowOf(ctx: Ctx): Date {
  return (ctx.now ?? (() => new Date()))();
}

function profileUrl(ctx: Ctx): string {
  return `${ctx.siteUrl}/conta/perfil`;
}

/** Ignora só falhas da Bot API (ex.: mensagem já apagada, usuário que nunca abriu o bot). */
async function ignoreApiError(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    if (!(err instanceof TelegramApiError)) throw err;
  }
}

// Cache em memória do módulo: sobrevive entre updates na mesma instância quente.
const adminCache = new Map<number, { ids: number[]; expiresAt: number }>();

export function resetAdminCache(): void {
  adminCache.clear();
}

async function adminIds(ctx: Ctx): Promise<number[]> {
  const chatId = ctx.config.groupId;
  const t = nowOf(ctx).getTime();
  const hit = adminCache.get(chatId);
  if (hit && hit.expiresAt > t) return hit.ids;
  const ids = await ctx.api.getChatAdministratorIds(chatId);
  adminCache.set(chatId, { ids, expiresAt: t + ADMIN_CACHE_MS });
  return ids;
}

/** Exclusão preguiçosa: a função não fica viva 30 s, então cada update do grupo limpa as vencidas. */
async function flushDueDeletes(ctx: Ctx): Promise<void> {
  try {
    const due = await ctx.repo.takeDueDeletes(nowOf(ctx));
    for (const d of due) {
      await ctx.api.deleteMessage(d.chatId, d.messageId).catch(() => {});
    }
  } catch {
    // Erros ignorados: não podem impedir o processamento do update.
  }
}

export async function handleUpdate(ctx: Ctx, update: Update): Promise<void> {
  const groupId = ctx.config.groupId;

  if (update.message) {
    const msg = update.message;
    if (msg.chat.type === "private") return handlePrivate(ctx, msg);
    if (msg.chat.id !== groupId) return;
    await flushDueDeletes(ctx);
    return handleGroupMessage(ctx, msg);
  }

  // Edição: só o antispam (um link pode ser colocado editando uma mensagem antiga). Comandos
  // editados não são executados e o privado é ignorado.
  if (update.edited_message) {
    const msg = update.edited_message;
    if (msg.chat.id !== groupId) return;
    await flushDueDeletes(ctx);
    return handleEditedGroupMessage(ctx, msg);
  }

  if (update.chat_join_request) {
    if (update.chat_join_request.chat.id !== groupId) return;
    await flushDueDeletes(ctx);
    return handleJoinRequest(ctx, update.chat_join_request);
  }

  if (update.chat_member) {
    if (update.chat_member.chat.id !== groupId) return;
    await flushDueDeletes(ctx);
    return handleChatMember(ctx, update.chat_member);
  }
}

// Chat privado: só /start ----------------------------------------------------------------------

async function handlePrivate(ctx: Ctx, msg: Message): Promise<void> {
  const from = msg.from;
  if (!from || from.is_bot || !msg.text) return;
  const cmd = parseCommand(msg.text, ctx.config.botUsername);
  if (cmd?.kind !== "start") return;
  const chatId = msg.chat.id;

  if (!cmd.code) {
    await ctx.api.sendMessage(
      chatId,
      `Para entrar no grupo VIP, acesse ${profileUrl(ctx)} e toque em "Entrar no grupo VIP".`,
    );
    return;
  }

  const result = await ctx.repo.consumeLinkCode(cmd.code, from.id, from.username ?? null);
  if (!result.ok) {
    const text = {
      invalid: `Link expirado ou já usado. Gere outro em ${profileUrl(ctx)}`,
      taken: "Este Telegram já está vinculado a outra conta Secretfans",
      inactive: "Sua conta Secretfans não está ativa",
    }[result.error];
    await ctx.api.sendMessage(chatId, text);
    return;
  }

  const [settings, invite] = await Promise.all([
    ctx.repo.getSettings(),
    ctx.api.createChatInviteLink(ctx.config.groupId),
  ]);
  const rules = settings.rulesText.trim();
  await ctx.api.sendMessage(
    chatId,
    `${rules ? `${rules}\n\n` : ""}Conta vinculada! Peça para entrar no grupo VIP por este link: ${invite}`,
  );
}

// Entrada e saída do grupo ---------------------------------------------------------------------

async function handleJoinRequest(ctx: Ctx, req: ChatJoinRequest): Promise<void> {
  const groupId = ctx.config.groupId;
  const [linked, member] = await Promise.all([ctx.repo.userFor(req.from.id), ctx.repo.getMember(req.from.id)]);

  if (linked?.status === "active" && member?.status !== "banned") {
    await ctx.api.approveChatJoinRequest(groupId, req.from.id);
    return;
  }

  await ctx.api.declineChatJoinRequest(groupId, req.from.id);
  let reason: string;
  if (member?.status === "banned") reason = "Seu acesso ao grupo VIP foi bloqueado pela moderação.";
  else if (!linked) reason = `Para entrar no grupo VIP, vincule seu Telegram em ${profileUrl(ctx)}`;
  else reason = "Sua conta Secretfans não está ativa";
  await ignoreApiError(ctx.api.sendMessage(req.user_chat_id, reason));
}

const WELCOME_TTL_S = 300;

/** Está dentro do grupo? "restricted" depende de is_member (restrito que saiu vem com false). */
function isInside(m: { status: string; is_member?: boolean }): boolean {
  if (m.status === "restricted") return m.is_member === true;
  return m.status !== "left" && m.status !== "kicked";
}

/** O Telegram trata until_date a menos de 30 s como restrição permanente. */
const MIN_RESTRICT_S = 30;

/**
 * Registra a entrada. Quem ainda tem silêncio vigente (ex.: desvinculou, o que expulsa e limpa a
 * restrição no Telegram, e vinculou de novo) volta restrito até muted_until e continua "muted".
 */
async function registerEntry(ctx: Ctx, tgId: number): Promise<void> {
  const member = await ctx.repo.getMember(tgId);
  const until = member?.mutedUntil ? new Date(member.mutedUntil).getTime() : 0;
  if (until - nowOf(ctx).getTime() > MIN_RESTRICT_S * 1000) {
    await ctx.api.restrictChatMember(ctx.config.groupId, tgId, Math.floor(until / 1000));
    await ctx.repo.upsertMember(tgId, { status: "muted" });
    return;
  }
  await ctx.repo.upsertMember(tgId, { status: "member" });
}

async function handleChatMember(ctx: Ctx, upd: ChatMemberUpdated): Promise<void> {
  const user = upd.new_chat_member.user;
  if (user.is_bot) return;
  const groupId = ctx.config.groupId;

  // Só a entrada de fato (de fora para dentro): mudanças de cargo ou fim de restrição não repetem as
  // boas-vindas. Entra como "member" ou já como "restricted" com is_member (ex.: adicionado por um
  // admin com restrição vigente).
  const next = upd.new_chat_member;
  const entering = next.status === "member" || (next.status === "restricted" && next.is_member === true);
  if (entering && !isInside(upd.old_chat_member)) {
    await registerEntry(ctx, user.id);
    const settings = await ctx.repo.getSettings();
    const welcome = settings.welcomeText.replaceAll("{nome}", user.first_name).trim();
    if (welcome) {
      const sent = await ctx.api.sendMessage(groupId, welcome);
      // A boas-vindas some depois de um tempo para não poluir o grupo (spec 4.1.6).
      await ctx.repo.scheduleDelete(groupId, sent.message_id, WELCOME_TTL_S);
    }
    return;
  }

  // Saída: escrita condicional no banco, para não sobrescrever um "banned" gravado em paralelo.
  if (!isInside(upd.new_chat_member)) await ctx.repo.markLeft(user.id);
}

// Mensagens no grupo ---------------------------------------------------------------------------

type ModerationCommand = Extract<Command, { kind: "warn" | "mute" | "ban" | "unban" }>;

function isModeration(cmd: Command | null): cmd is ModerationCommand {
  return cmd !== null && ["warn", "mute", "ban", "unban"].includes(cmd.kind);
}

async function handleGroupMessage(ctx: Ctx, msg: Message): Promise<void> {
  const from = msg.from;
  if (!from || from.is_bot) return;

  // Quem fala no grupo sem linha em telegram_members (membro antigo, adicionado por admin) passa a
  // existir para a varredura diária. Sem boas-vindas: não é uma entrada.
  await ctx.repo.ensureMember(from.id);

  const cmd = msg.text ? parseCommand(msg.text, ctx.config.botUsername) : null;
  if (isModeration(cmd)) return handleModeration(ctx, msg, from, cmd);
  if (cmd?.kind === "report") return handleReport(ctx, msg, from, cmd);

  const admins = await adminIds(ctx);
  if (admins.includes(from.id)) return;
  await checkSpam(ctx, msg, from);
}

async function handleEditedGroupMessage(ctx: Ctx, msg: Message): Promise<void> {
  const from = msg.from;
  if (!from || from.is_bot) return;
  await ctx.repo.ensureMember(from.id);
  const admins = await adminIds(ctx);
  if (admins.includes(from.id)) return;
  // A edição não é mensagem nova: não conta (nem grava) para flood.
  await checkSpam(ctx, msg, from, { flood: false });
}

async function handleModeration(ctx: Ctx, msg: Message, from: User, cmd: ModerationCommand): Promise<void> {
  const groupId = ctx.config.groupId;
  const deleteCommand = () => ignoreApiError(ctx.api.deleteMessage(groupId, msg.message_id));

  const admins = await adminIds(ctx);
  const target = msg.reply_to_message?.from;
  if (!admins.includes(from.id) || !target || target.is_bot || admins.includes(target.id)) {
    return deleteCommand();
  }
  const moderator = await ctx.repo.userFor(from.id);
  if (!moderator?.canModerate || moderator.status !== "active") return deleteCommand();

  const actor = moderator.userId;
  let confirmation: string;
  switch (cmd.kind) {
    case "warn":
      await applyWarning(ctx, target.id, actor, cmd.reason);
      confirmation = `${target.first_name} recebeu uma advertência.`;
      break;
    case "mute":
      await applyMute(ctx, target.id, cmd.hours, actor, cmd.reason);
      confirmation = `${target.first_name} foi silenciado por ${cmd.hours === 168 ? "7 dias" : `${cmd.hours}h`}.`;
      break;
    case "ban":
      await applyBan(ctx, target.id, actor, cmd.reason);
      confirmation = `${target.first_name} foi banido do grupo.`;
      break;
    case "unban": {
      // Só desbane quem está banido; caso contrário, apenas some com o comando.
      const member = await ctx.repo.getMember(target.id);
      if (member?.status !== "banned") return deleteCommand();
      await applyUnban(ctx, target.id, actor);
      confirmation = `${target.first_name} foi desbanido e pode pedir para entrar de novo.`;
      break;
    }
  }

  await deleteCommand();
  const sent = await ctx.api.sendMessage(groupId, confirmation);
  await ctx.repo.scheduleDelete(groupId, sent.message_id, CONFIRMATION_TTL_S);
}

function hasMedia(m: Message): boolean {
  return Boolean(m.photo?.length || m.video || m.document);
}

async function handleReport(
  ctx: Ctx,
  msg: Message,
  from: User,
  cmd: Extract<Command, { kind: "report" }>,
): Promise<void> {
  const groupId = ctx.config.groupId;
  await ignoreApiError(ctx.api.deleteMessage(groupId, msg.message_id));

  const reported = msg.reply_to_message;
  if (!reported?.from) return;
  const reporter = await ctx.repo.userFor(from.id);
  if (!reporter || reporter.status !== "active") return;

  await ctx.repo.createReport({
    reporterUserId: reporter.userId,
    reason: cmd.reason,
    details: cmd.details,
    chatId: groupId,
    messageId: reported.message_id,
    authorTgId: reported.from.id,
    text: reported.text ?? reported.caption ?? "",
    hasMedia: hasMedia(reported),
  });
  await ignoreApiError(
    ctx.api.sendMessage(from.id, "Recebemos sua denúncia. Obrigado por ajudar a manter o grupo VIP seguro."),
  );
}

async function checkSpam(ctx: Ctx, msg: Message, from: User, opts = { flood: true }): Promise<void> {
  const settings = await ctx.repo.getSettings();
  const hash = opts.flood ? textHash(msg) : null;
  const recent = hash ? await ctx.repo.countRecentHash(from.id, hash, settings.floodWindowSeconds) : 0;
  // Sem flood, o limite infinito desliga só essa regra no detectSpam.
  const verdict = detectSpam(
    msg,
    opts.flood ? settings : { ...settings, floodRepeatLimit: Number.POSITIVE_INFINITY },
    recent,
  );
  if (!verdict.spam) return;

  const reason = `spam:${verdict.rule}`;
  await ignoreApiError(ctx.api.deleteMessage(msg.chat.id, msg.message_id));
  await applyWarning(ctx, from.id, null, reason);
  await ctx.repo.logAction(null, "telegram.spam_deleted", from.id, reason, {
    chatId: msg.chat.id,
    messageId: msg.message_id,
  });
}
