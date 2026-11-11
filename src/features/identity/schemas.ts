import { z } from "zod";

export const CONSENT_VERSION = "2026-11";

/** Handles reservados por coincidirem com rotas da aplicação. */
export const RESERVED_HANDLES = new Set([
  "admin",
  "super-admin",
  "superadmin",
  "api",
  "auth",
  "entrar",
  "criar-conta",
  "confirmar-email",
  "esqueci-senha",
  "redefinir-senha",
  "inicio",
  "explorar",
  "assinaturas",
  "biblioteca",
  "carteira",
  "checkout",
  "pedido",
  "mensagens",
  "notificacoes",
  "conta",
  "estudio",
  "criadores",
  "descobrir",
  "secretfans",
  "suporte",
  "ajuda",
  "termos",
  "privacidade",
]);

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, "Use 3 a 30 caracteres: letras minúsculas, números, ponto ou _.")
  .refine((h) => !RESERVED_HANDLES.has(h), "Este nome de usuário é reservado.");

export const passwordSchema = z
  .string()
  .min(10, "A senha precisa de pelo menos 10 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.")
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.");

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const signUpSchema = z.object({
  email: z.email("Informe um e-mail válido.").max(254),
  password: passwordSchema,
  handle: handleSchema,
  displayName: z.string().trim().min(2, "Informe seu nome público.").max(60),
  intent: z.enum(["fan", "creator"]),
  age18: checkbox.refine((v) => v, "Você precisa ter 18 anos ou mais."),
  terms: checkbox.refine((v) => v, "Aceite os termos de uso e a política de privacidade."),
  marketing: checkbox,
});

export const signInSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email: z.email("Informe um e-mail válido.") });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

export const profileSchema = z.object({
  handle: handleSchema,
  displayName: z.string().trim().min(2, "Informe seu nome público.").max(60),
  bio: z.string().trim().max(500, "Máximo de 500 caracteres."),
  visibility: z.enum(["public", "followers", "private"]),
});

/** Aceita só caminhos relativos internos, evitando open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/inicio"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}

export type FieldErrors = Partial<Record<string, string>>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
