import { z } from "zod";

export const VERIFICATION_BUCKET = "verification-documents";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function validateDocument(file: { size: number; type: string }): string | null {
  if (!ALLOWED_DOC_TYPES[file.type]) return "Formato não aceito. Use JPG, PNG, WEBP ou PDF.";
  if (file.size > MAX_DOC_BYTES) return "Arquivo maior que 10 MB.";
  if (file.size === 0) return "Arquivo vazio.";
  return null;
}

/** Idade completa em anos numa data de referência (America/Sao_Paulo não altera datas civis). */
export function ageOn(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return -1;
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

const pathFor = (uid: string) =>
  z.string().regex(new RegExp(`^${uid}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$`), "Documento inválido");

export function verificationSubmitSchema(uid: string) {
  return z.object({
    legalName: z.string().trim().min(3, "Informe o nome completo.").max(120),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento.")
      .refine((d) => ageOn(d) >= 18, "É preciso ter 18 anos ou mais."),
    documentFrontPath: pathFor(uid),
    documentBackPath: pathFor(uid).nullable(),
    selfiePath: pathFor(uid),
    rightsConsent: z.literal(true, "Confirme a titularidade do conteúdo."),
    depictedConsent: z.literal(true, "Confirme o consentimento das pessoas retratadas."),
  });
}

export type VerificationSubmitInput = z.infer<ReturnType<typeof verificationSubmitSchema>>;
