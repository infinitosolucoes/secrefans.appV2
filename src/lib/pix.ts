import { z } from "zod";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/cpf";

export const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "evp"] as const;
export type PixKeyTypeName = (typeof PIX_KEY_TYPES)[number];

export const PIX_KEY_LABEL: Record<PixKeyTypeName, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Celular",
  evp: "Chave aleatória",
};

/** Normaliza e valida a chave Pix no formato gravado no banco (telefone como +55DDDNÚMERO). */
export function normalizePixKey(type: PixKeyTypeName, raw: string): string | null {
  const v = raw.trim();
  switch (type) {
    case "cpf": {
      const d = onlyDigits(v);
      return isValidCpf(d) ? d : null;
    }
    case "cnpj": {
      const d = onlyDigits(v);
      return isValidCnpj(d) ? d : null;
    }
    case "email":
      return z.email().safeParse(v.toLowerCase()).success ? v.toLowerCase() : null;
    case "phone": {
      let d = onlyDigits(v);
      if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case "evp":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
        ? v.toLowerCase()
        : null;
  }
}

/** Exibição mascarada (CPF/CNPJ/telefone parciais) para telas e e-mails. */
export function maskPixKey(type: string, value: string): string {
  if (type === "cpf") return `***.${value.slice(3, 6)}.${value.slice(6, 9)}-**`;
  if (type === "cnpj") return `**.${value.slice(2, 5)}.${value.slice(5, 8)}/****-**`;
  if (type === "phone") return `${value.slice(0, 5)}*****${value.slice(-2)}`;
  if (type === "email") {
    const [u, d] = value.split("@");
    return `${u!.slice(0, 2)}***@${d}`;
  }
  return `${value.slice(0, 8)}…`;
}
