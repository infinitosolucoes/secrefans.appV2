import "server-only";
import { createServiceSupabase } from "@/server/auth/supabase";
import type { Json } from "@/types/database";
import type { ReportReason } from "./commands";

type Db = ReturnType<typeof createServiceSupabase>;

export interface TelegramSettings {
  rulesText: string;
  welcomeText: string;
  allowedDomains: string[];
  warnLimit: number;
  autoMuteHours: number;
  floodRepeatLimit: number;
  floodWindowSeconds: number;
}

export interface LinkedUser {
  userId: string;
  status: "active" | "blocked" | "deleted";
  canModerate: boolean;
}

export type MemberStatus = "member" | "muted" | "banned" | "left";

export interface MemberState {
  status: MemberStatus;
  warnings: number;
  /** Fim do silêncio (ISO); pode estar no passado. */
  mutedUntil: string | null;
}

export type MemberPatch = Partial<MemberState> & { lastActionBy?: string | null };

export type TelegramAction =
  | "telegram.warn"
  | "telegram.mute"
  | "telegram.ban"
  | "telegram.unban"
  | "telegram.kick"
  | "telegram.spam_deleted";

export type ConsumeResult = { ok: true; userId: string } | { ok: false; error: "invalid" | "taken" | "inactive" };

export interface ReportInput {
  reporterUserId: string;
  reason: ReportReason;
  details: string;
  chatId: number;
  messageId: number;
  authorTgId: number;
  text: string;
  hasMedia: boolean;
}

export interface SweepCandidate {
  tgId: number;
  /** Status da conta vinculada no site; null = sem vínculo. */
  accountStatus: LinkedUser["status"] | null;
}

/** Limite de membros avaliados por varredura (consulta única, sem paginação). */
export const SWEEP_LIMIT = 500;

export interface TelegramRepo {
  /** false = update já visto. */
  markUpdateSeen(updateId: number): Promise<boolean>;
  getSettings(): Promise<TelegramSettings>;
  consumeLinkCode(code: string, tgId: number, username: string | null): Promise<ConsumeResult>;
  userFor(tgId: number): Promise<LinkedUser | null>;
  getMember(tgId: number): Promise<MemberState | null>;
  upsertMember(tgId: number, patch: MemberPatch): Promise<void>;
  /** Cria a linha como "member" se ela não existir; nunca altera uma linha existente. */
  ensureMember(tgId: number): Promise<void>;
  /** Marca "left" de forma condicional: nunca sobrescreve "banned"; cria a linha se não existir. */
  markLeft(tgId: number): Promise<void>;
  /** Conta as mensagens iguais na janela (sem a atual), grava a atual e apaga as com mais de 1h. */
  countRecentHash(tgId: number, hash: string, windowSeconds: number): Promise<number>;
  logAction(
    actor: string | null,
    action: TelegramAction,
    tgId: number,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  createReport(input: ReportInput): Promise<string>;
  scheduleDelete(chatId: number, messageId: number, afterSeconds: number): Promise<void>;
  /** Devolve e remove as exclusões vencidas. */
  takeDueDeletes(now: Date): Promise<{ chatId: number; messageId: number }[]>;
  /** telegram_user_id vinculado à conta do site; null sem vínculo. */
  telegramIdForUser(userId: string): Promise<number | null>;
  /**
   * `metadata.cause` do telegram.ban mais recente deste usuário do Telegram na auditoria
   * (admin_audit_logs, via service role); null sem ban registrado ou sem causa.
   */
  lastBanCause(tgId: number): Promise<string | null>;
  /** Membros com status member/muted (até SWEEP_LIMIT) e o status da conta vinculada. */
  listSweepCandidates(): Promise<SweepCandidate[]>;
  /** Apaga updates vistos há mais de 7 dias e códigos de vínculo expirados. */
  purgeStale(now: Date): Promise<void>;
}

const CONSUME_ERRORS: Record<string, "invalid" | "taken" | "inactive"> = {
  P0002: "invalid",
  "23505": "taken",
  "42501": "inactive",
};

function fail(op: string, error: { code?: string }): never {
  // Só o código: a mensagem do Postgres pode trazer dados da linha.
  throw new Error(`telegram repo ${op}: ${error.code ?? "erro"}`);
}

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Tamanho dos lotes de .in() para não estourar o limite de URL do PostgREST. */
const IN_CHUNK = 100;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function createTelegramRepo(db: Db = createServiceSupabase()): TelegramRepo {
  return {
    async markUpdateSeen(updateId) {
      const { error } = await db.from("telegram_updates_seen").insert({ update_id: updateId });
      if (!error) return true;
      if (error.code === "23505") return false;
      fail("markUpdateSeen", error);
    },

    async getSettings() {
      const { data, error } = await db.from("telegram_settings").select("*").eq("id", true).single();
      if (error) fail("getSettings", error);
      return {
        rulesText: data.rules_text,
        welcomeText: data.welcome_text,
        allowedDomains: data.allowed_domains,
        warnLimit: data.warn_limit,
        autoMuteHours: data.auto_mute_hours,
        floodRepeatLimit: data.flood_repeat_limit,
        floodWindowSeconds: data.flood_window_seconds,
      };
    },

    async consumeLinkCode(code, tgId, username) {
      const { data, error } = await db.rpc("telegram_consume_link_code", {
        p_code: code,
        p_telegram_user_id: tgId,
        // A função aceita null; o tipo gerado não reflete isso.
        p_username: username as string,
      });
      if (error) {
        const mapped = error.code ? CONSUME_ERRORS[error.code] : undefined;
        if (mapped) return { ok: false, error: mapped };
        fail("consumeLinkCode", error);
      }
      return { ok: true, userId: data };
    },

    async userFor(tgId) {
      const { data, error } = await db.rpc("telegram_user_for", { p_telegram_user_id: tgId });
      if (error) fail("userFor", error);
      const row = data[0];
      if (!row) return null;
      return { userId: row.user_id, status: row.status, canModerate: row.can_moderate };
    },

    async getMember(tgId) {
      const { data, error } = await db
        .from("telegram_members")
        .select("status, warnings, muted_until")
        .eq("telegram_user_id", tgId)
        .maybeSingle();
      if (error) fail("getMember", error);
      if (!data) return null;
      return { status: data.status as MemberStatus, warnings: data.warnings, mutedUntil: data.muted_until };
    },

    async upsertMember(tgId, patch) {
      // Só as colunas presentes no patch entram no update do upsert.
      const row: {
        telegram_user_id: number;
        updated_at: string;
        status?: string;
        warnings?: number;
        muted_until?: string | null;
        last_action_by?: string | null;
      } = { telegram_user_id: tgId, updated_at: new Date().toISOString() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.warnings !== undefined) row.warnings = patch.warnings;
      if (patch.mutedUntil !== undefined) row.muted_until = patch.mutedUntil;
      if (patch.lastActionBy !== undefined) row.last_action_by = patch.lastActionBy;
      const { error } = await db.from("telegram_members").upsert(row, { onConflict: "telegram_user_id" });
      if (error) fail("upsertMember", error);
    },

    async ensureMember(tgId) {
      const { error } = await db
        .from("telegram_members")
        .upsert(
          { telegram_user_id: tgId, status: "member", updated_at: new Date().toISOString() },
          { onConflict: "telegram_user_id", ignoreDuplicates: true },
        );
      if (error) fail("ensureMember", error);
    },

    async markLeft(tgId) {
      const updatedAt = new Date().toISOString();
      const upd = await db
        .from("telegram_members")
        .update({ status: "left", updated_at: updatedAt })
        .eq("telegram_user_id", tgId)
        .neq("status", "banned")
        .select("telegram_user_id");
      if (upd.error) fail("markLeft.update", upd.error);
      if (upd.data.length > 0) return;
      // Nenhuma linha atualizada: ou não existe (cria como left) ou está banned (o conflito não mexe nela).
      const ins = await db
        .from("telegram_members")
        .upsert(
          { telegram_user_id: tgId, status: "left", updated_at: updatedAt },
          { onConflict: "telegram_user_id", ignoreDuplicates: true },
        );
      if (ins.error) fail("markLeft.insert", ins.error);
    },

    async countRecentHash(tgId, hash, windowSeconds) {
      const now = Date.now();
      const purge = await db
        .from("telegram_recent_messages")
        .delete()
        .lt("sent_at", new Date(now - HOUR_MS).toISOString());
      if (purge.error) fail("countRecentHash.purge", purge.error);

      const { count, error } = await db
        .from("telegram_recent_messages")
        .select("id", { count: "exact", head: true })
        .eq("telegram_user_id", tgId)
        .eq("text_hash", hash)
        .gte("sent_at", new Date(now - windowSeconds * 1000).toISOString());
      if (error) fail("countRecentHash.count", error);

      const ins = await db
        .from("telegram_recent_messages")
        .insert({ telegram_user_id: tgId, text_hash: hash, sent_at: new Date(now).toISOString() });
      if (ins.error) fail("countRecentHash.insert", ins.error);
      return count ?? 0;
    },

    async logAction(actor, action, tgId, reason, metadata) {
      const { error } = await db.rpc("telegram_log_action", {
        // O ator "sistema" é null; o tipo gerado não reflete isso.
        p_actor: actor as string,
        p_action: action,
        p_target: String(tgId),
        p_reason: reason,
        p_metadata: (metadata ?? {}) as Json,
      });
      if (error) fail("logAction", error);
    },

    async createReport(input) {
      const { data, error } = await db.rpc("telegram_create_report", {
        p_reporter: input.reporterUserId,
        p_reason: input.reason,
        p_details: input.details,
        p_chat_id: input.chatId,
        p_message_id: input.messageId,
        p_author_tg: input.authorTgId,
        p_text: input.text.slice(0, 4096),
        p_has_media: input.hasMedia,
      });
      if (error) fail("createReport", error);
      return data;
    },

    async scheduleDelete(chatId, messageId, afterSeconds) {
      const { error } = await db.from("telegram_pending_deletes").upsert(
        {
          chat_id: chatId,
          message_id: messageId,
          delete_after: new Date(Date.now() + afterSeconds * 1000).toISOString(),
        },
        { onConflict: "chat_id,message_id" },
      );
      if (error) fail("scheduleDelete", error);
    },

    async takeDueDeletes(now) {
      const { data, error } = await db
        .from("telegram_pending_deletes")
        .delete()
        .lte("delete_after", now.toISOString())
        .select("chat_id, message_id");
      if (error) fail("takeDueDeletes", error);
      return data.map((r) => ({ chatId: r.chat_id, messageId: r.message_id }));
    },
    async telegramIdForUser(userId) {
      const { data, error } = await db
        .from("telegram_links")
        .select("telegram_user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) fail("telegramIdForUser", error);
      return data ? data.telegram_user_id : null;
    },

    async lastBanCause(tgId) {
      const { data, error } = await db
        .from("admin_audit_logs")
        .select("metadata")
        .eq("action", "telegram.ban")
        .eq("target_type", "telegram_user")
        .eq("target_id", String(tgId))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("lastBanCause", error);
      const meta = data?.metadata;
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
      const cause = (meta as Record<string, unknown>).cause;
      return typeof cause === "string" ? cause : null;
    },

    async listSweepCandidates() {
      const members = await db
        .from("telegram_members")
        .select("telegram_user_id")
        .in("status", ["member", "muted"])
        .order("telegram_user_id")
        .limit(SWEEP_LIMIT);
      if (members.error) fail("listSweepCandidates.members", members.error);
      const tgIds = members.data.map((m) => m.telegram_user_id);

      const userByTg = new Map<number, string>();
      for (const part of chunks(tgIds, IN_CHUNK)) {
        const links = await db
          .from("telegram_links")
          .select("user_id, telegram_user_id")
          .in("telegram_user_id", part);
        if (links.error) fail("listSweepCandidates.links", links.error);
        for (const l of links.data) userByTg.set(l.telegram_user_id, l.user_id);
      }

      const statusByUser = new Map<string, LinkedUser["status"]>();
      for (const part of chunks([...userByTg.values()], IN_CHUNK)) {
        const profiles = await db.from("profiles").select("id, status").in("id", part);
        if (profiles.error) fail("listSweepCandidates.profiles", profiles.error);
        for (const p of profiles.data) statusByUser.set(p.id, p.status);
      }

      return tgIds.map((tgId) => {
        const userId = userByTg.get(tgId);
        // Vínculo sem perfil (não deveria acontecer) conta como conta inativa.
        const accountStatus = userId ? (statusByUser.get(userId) ?? "deleted") : null;
        return { tgId, accountStatus };
      });
    },

    async purgeStale(now) {
      const seen = await db
        .from("telegram_updates_seen")
        .delete()
        .lt("seen_at", new Date(now.getTime() - 7 * DAY_MS).toISOString());
      if (seen.error) fail("purgeStale.updatesSeen", seen.error);
      const codes = await db.from("telegram_link_codes").delete().lt("expires_at", now.toISOString());
      if (codes.error) fail("purgeStale.linkCodes", codes.error);
    },
  };
}
