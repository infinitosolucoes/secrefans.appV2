/** Redes sociais do perfil: guardamos só o @usuário; o link é montado aqui (sem URL livre). */
export const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", url: (u: string) => `https://instagram.com/${u}` },
  { key: "tiktok", label: "TikTok", url: (u: string) => `https://www.tiktok.com/@${u}` },
  { key: "x", label: "X (Twitter)", url: (u: string) => `https://x.com/${u}` },
  { key: "youtube", label: "YouTube", url: (u: string) => `https://www.youtube.com/@${u}` },
  { key: "telegram", label: "Telegram", url: (u: string) => `https://t.me/${u}` },
] as const;

export type SocialKey = (typeof SOCIAL_NETWORKS)[number]["key"];
export type Socials = Partial<Record<SocialKey, string>>;

export const SOCIAL_HANDLE_RE = /^[A-Za-z0-9_.]{1,32}$/;

/** Aceita "@usuario", "usuario" ou o link do perfil e devolve só o usuário. */
export function normalizeSocialHandle(raw: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\/(www\.)?[^/]+\/(@)?/i, "");
  v = v.replace(/^@/, "").replace(/[/?#].*$/, "");
  return v;
}

export function parseSocials(value: unknown): Socials {
  if (!value || typeof value !== "object") return {};
  const out: Socials = {};
  for (const n of SOCIAL_NETWORKS) {
    const v = (value as Record<string, unknown>)[n.key];
    if (typeof v === "string" && SOCIAL_HANDLE_RE.test(v)) out[n.key] = v;
  }
  return out;
}
