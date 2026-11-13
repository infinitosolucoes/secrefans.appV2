import "server-only";
import type { Ctx } from "./handler";

export interface Escalation {
  warnings: number;
  mute: boolean;
}

// Soma uma advertência; ao atingir o limite, zera o contador e manda silenciar.
export function escalate(currentWarnings: number, warnLimit: number): Escalation {
  const next = currentWarnings + 1;
  if (next >= warnLimit) return { warnings: 0, mute: true };
  return { warnings: next, mute: false };
}

// Aplicação das punições (Bot API + estado + auditoria) -----------------------------------------

function nowOf(ctx: Ctx): Date {
  return (ctx.now ?? (() => new Date()))();
}

// "metadata com o vínculo": conta Secretfans do alvo, quando houver.
async function targetMeta(ctx: Ctx, tgId: number): Promise<Record<string, unknown>> {
  const linked = await ctx.repo.userFor(tgId);
  return { targetUserId: linked?.userId ?? null };
}

async function mute(ctx: Ctx, tgId: number, hours: number, actor: string | null, warnings?: number) {
  const until = new Date(nowOf(ctx).getTime() + hours * 3600 * 1000);
  await ctx.api.restrictChatMember(ctx.config.groupId, tgId, Math.floor(until.getTime() / 1000));
  await ctx.repo.upsertMember(tgId, {
    status: "muted",
    mutedUntil: until.toISOString(),
    lastActionBy: actor,
    ...(warnings !== undefined ? { warnings } : {}),
  });
  return until;
}

/** +1 advertência; ao atingir o limite, silencia por auto_mute_hours e zera o contador. */
export async function applyWarning(ctx: Ctx, tgId: number, actor: string | null, reason: string): Promise<void> {
  const [settings, member, meta] = await Promise.all([
    ctx.repo.getSettings(),
    ctx.repo.getMember(tgId),
    targetMeta(ctx, tgId),
  ]);
  const next = escalate(member?.warnings ?? 0, settings.warnLimit);
  if (next.mute) {
    const until = await mute(ctx, tgId, settings.autoMuteHours, actor, next.warnings);
    await ctx.repo.logAction(actor, "telegram.warn", tgId, reason, { ...meta, warnings: next.warnings, autoMute: true });
    await ctx.repo.logAction(actor, "telegram.mute", tgId, reason, {
      ...meta,
      hours: settings.autoMuteHours,
      until: until.toISOString(),
      auto: true,
    });
    return;
  }
  await ctx.repo.upsertMember(tgId, { warnings: next.warnings, lastActionBy: actor });
  await ctx.repo.logAction(actor, "telegram.warn", tgId, reason, { ...meta, warnings: next.warnings });
}

export async function applyMute(
  ctx: Ctx,
  tgId: number,
  hours: number,
  actor: string | null,
  reason: string,
): Promise<void> {
  const until = await mute(ctx, tgId, hours, actor);
  const meta = await targetMeta(ctx, tgId);
  await ctx.repo.logAction(actor, "telegram.mute", tgId, reason, { ...meta, hours, until: until.toISOString() });
}

export async function applyBan(ctx: Ctx, tgId: number, actor: string | null, reason: string): Promise<void> {
  // Bot API primeiro: se ela falhar, o banco não fica dizendo "banned" com a pessoa no grupo.
  // Sem corrida com o update de saída gerado pelo ban (outra chamada do webhook): ele usa markLeft,
  // que nunca sobrescreve "banned", e se chegar antes deste upsert, o upsert vence de qualquer jeito.
  await ctx.api.banChatMember(ctx.config.groupId, tgId);
  await ctx.repo.upsertMember(tgId, { status: "banned", lastActionBy: actor });
  await ctx.repo.logAction(actor, "telegram.ban", tgId, reason, await targetMeta(ctx, tgId));
}

/** Desbane sem readicionar: a pessoa volta a poder pedir entrada. */
export async function applyUnban(ctx: Ctx, tgId: number, actor: string | null): Promise<void> {
  await ctx.api.unbanChatMember(ctx.config.groupId, tgId);
  await ctx.repo.upsertMember(tgId, { status: "left", mutedUntil: null, lastActionBy: actor });
  await ctx.repo.logAction(actor, "telegram.unban", tgId, "", await targetMeta(ctx, tgId));
}
