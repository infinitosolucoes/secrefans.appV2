import { z } from "zod";
import {
  MAX_POST_BODY,
  MAX_POST_IMAGES,
  PPV_PRICE_MAX,
  PPV_PRICE_MIN,
  REPORT_REASONS,
  UUID_RE,
  postMediaPathRe,
} from "./constants";

/** Converte "19,90" / "19.90" em centavos. */
export function parsePriceToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw)
    .trim()
    .replace(/^R\$\s*/i, "");
  // "1.234,56" → "1234.56"; "19.90" fica como está.
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  const value = Number(normalized);
  return Math.round(value * 100);
}

export const postInputSchema = (userId: string) =>
  z
    .object({
      postId: z.string().regex(UUID_RE, "Publicação inválida."),
      body: z.string().trim().max(MAX_POST_BODY, `Máximo de ${MAX_POST_BODY} caracteres.`),
      visibility: z.enum(["free", "subscribers", "ppv"]),
      priceCents: z.number().int().nullable(),
      publish: z.boolean(),
      media: z
        .array(
          z.object({
            kind: z.enum(["image", "video"]),
            path: z.string(),
            poster: z.string().nullable(),
            width: z.number().int().min(1).max(10000),
            height: z.number().int().min(1).max(10000),
            duration: z.number().int().min(1).max(3600).nullable(),
            size: z.number().int().min(1).max(104857600),
          }),
        )
        .max(MAX_POST_IMAGES, `No máximo ${MAX_POST_IMAGES} fotos.`),
    })
    .superRefine((d, ctx) => {
      if (!d.body && d.media.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["body"],
          message: "Escreva algo ou adicione fotos.",
        });
      if (d.visibility === "ppv") {
        const c = d.priceCents;
        if (c === null || Number.isNaN(c) || c < PPV_PRICE_MIN * 100 || c > PPV_PRICE_MAX * 100)
          ctx.addIssue({
            code: "custom",
            path: ["price"],
            message: `Informe um preço entre R$ ${PPV_PRICE_MIN} e R$ ${PPV_PRICE_MAX}.`,
          });
        if (d.media.length === 0)
          ctx.addIssue({
            code: "custom",
            path: ["media"],
            message: "PPV precisa de pelo menos uma foto.",
          });
      }
      if (d.visibility === "subscribers" && d.media.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["media"],
          message: "Post para assinantes precisa de pelo menos uma foto.",
        });
      const webp = postMediaPathRe(userId, d.postId, "webp");
      const mp4 = postMediaPathRe(userId, d.postId, "mp4");
      const bad = (m: (typeof d.media)[number]) =>
        m.kind === "image"
          ? !webp.test(m.path) || m.poster !== null
          : !mp4.test(m.path) || !m.poster || !webp.test(m.poster) || !m.duration;
      if (d.media.some(bad))
        ctx.addIssue({ code: "custom", path: ["media"], message: "Arquivo de mídia inválido." });
    });

export const commentSchema = z.object({
  postId: z.string().regex(UUID_RE),
  body: z.string().trim().min(1, "Escreva um comentário.").max(500, "Máximo de 500 caracteres."),
});

export const reportSchema = z.object({
  targetType: z.enum(["post", "comment", "profile"]),
  targetId: z.string().regex(UUID_RE),
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]),
  details: z.string().trim().max(1000, "Máximo de 1000 caracteres."),
});
