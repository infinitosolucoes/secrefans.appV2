import "server-only";
import { createHash } from "node:crypto";
import type { Message, MessageEntity } from "./types";

export interface SpamSettings {
  allowedDomains: string[];
  floodRepeatLimit: number;
  floodWindowSeconds: number;
}

export type SpamVerdict =
  | { spam: false }
  | { spam: true; rule: "link" | "invite" | "channel_forward" | "flood" };

const TG_HOSTS = new Set(["t.me", "telegram.me", "telegram.dog"]);
// Fallback para links do Telegram escritos sem esquema (ex.: "t.me/canal").
const TG_BARE = /(?:^|[^\w.])((?:t\.me|telegram\.me)\/[^\s]+)/gi;

function textOf(msg: Message): string {
  return msg.text ?? msg.caption ?? "";
}

function entitiesOf(msg: Message): MessageEntity[] {
  return (msg.text !== undefined ? msg.entities : msg.caption_entities) ?? [];
}

function parseHost(raw: string): { host: string; path: string } | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: u.pathname };
  } catch {
    return null;
  }
}

function extractLinks(msg: Message): string[] {
  const text = textOf(msg);
  const links: string[] = [];
  for (const e of entitiesOf(msg)) {
    // Offsets do Telegram são em UTF-16, o mesmo que slice em JS.
    if (e.type === "url") links.push(text.slice(e.offset, e.offset + e.length));
    else if (e.type === "text_link" && e.url) links.push(e.url);
  }
  for (const m of text.matchAll(TG_BARE)) if (m[1]) links.push(m[1]);
  return links;
}

function isAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((d) => {
    const dom = d.toLowerCase().replace(/^www\./, "");
    return host === dom || host.endsWith(`.${dom}`);
  });
}

export function textHash(msg: Message): string | null {
  const norm = textOf(msg).trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  return createHash("sha256").update(norm).digest("hex");
}

export function detectSpam(msg: Message, s: SpamSettings, recentSameHashCount: number): SpamVerdict {
  if (msg.forward_origin?.type === "channel") return { spam: true, rule: "channel_forward" };

  let hasLink = false;
  for (const link of extractLinks(msg)) {
    const parsed = parseHost(link);
    if (!parsed) continue;
    if (TG_HOSTS.has(parsed.host)) return { spam: true, rule: "invite" };
    if (!isAllowed(parsed.host, s.allowedDomains)) hasLink = true;
  }
  if (hasLink) return { spam: true, rule: "link" };

  // A mensagem atual ainda não foi contada: com N-1 iguais recentes, ela é a N-ésima.
  if (textHash(msg) !== null && recentSameHashCount + 1 >= s.floodRepeatLimit) {
    return { spam: true, rule: "flood" };
  }
  return { spam: false };
}
