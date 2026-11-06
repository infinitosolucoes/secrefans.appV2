/** Constantes do módulo de conteúdo (seguras para cliente e servidor). */

export const POST_MEDIA_BUCKET = "post-media";
export const AVATAR_BUCKET = "avatars";
export const BANNER_BUCKET = "banners";

export const MAX_POST_IMAGES = 10;
export const MAX_POST_BODY = 2000;
export const MAX_IMAGE_DIMENSION = 2560;
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Limites de preço do PPV em reais (a cobrança real chega na S4). */
export const PPV_PRICE_MIN = 5;
export const PPV_PRICE_MAX = 1000;

export type PostVisibility = "free" | "subscribers" | "ppv";
export type PostStatus = "draft" | "published" | "removed";

export const VISIBILITY_OPTIONS: Array<{
  value: PostVisibility;
  label: string;
  description: string;
}> = [
  { value: "free", label: "Grátis", description: "Qualquer pessoa vê" },
  { value: "subscribers", label: "Assinantes", description: "Só quem assina vê" },
  { value: "ppv", label: "PPV", description: "Desbloqueio avulso pago" },
];

export const VISIBILITY_LABEL: Record<PostVisibility, string> = {
  free: "Grátis",
  subscribers: "Assinantes",
  ppv: "PPV",
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  removed: "Retirado pela moderação",
};

export const REPORT_REASONS = [
  { value: "nao_consensual", label: "Conteúdo íntimo sem consentimento" },
  { value: "menor_de_idade", label: "Possível menor de idade" },
  { value: "violencia", label: "Violência ou conteúdo ilegal" },
  { value: "assedio", label: "Assédio ou discurso de ódio" },
  { value: "spam", label: "Spam ou golpe" },
  { value: "direitos_autorais", label: "Direitos autorais" },
  { value: "outro", label: "Outro motivo" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportTarget = "post" | "comment" | "profile";

export const REPORT_REASON_LABEL = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
) as Record<ReportReason, string>;

export const formatBRL = (cents: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);

/** URL pública de avatar/banner (buckets públicos, nomes aleatórios). */
export function publicImageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const UUID_RE = new RegExp(`^${UUID}$`);
export const postMediaPathRe = (userId: string, postId: string) =>
  new RegExp(`^${userId}/${postId}/${UUID}\\.webp$`);
export const profileImagePathRe = (userId: string) => new RegExp(`^${userId}/${UUID}\\.webp$`);
