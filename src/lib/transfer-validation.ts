/**
 * Regras do "mecanismo de validação de saque" do Asaas: antes de executar uma transferência
 * pedida pela API, o Asaas pergunta à Secretfans se ela é legítima. Só aprovamos o que bate com
 * um saque já aprovado pelo financeiro (mesmo valor e mesma chave Pix, aprovado há pouco).
 */

export interface ValidationRequest {
  type?: string;
  transfer?: {
    id?: string;
    value?: number;
    operationType?: string;
    bankAccount?: { pixAddressKey?: string | null } | null;
  } | null;
}

export interface PendingWithdrawal {
  id: string;
  amount_cents: number;
  pix_key_type: string;
  pix_key_value: string;
  provider_transfer_id: string | null;
  decided_at: string | null;
}

export type ValidationAnswer = { status: "APPROVED" } | { status: "REFUSED"; refuseReason: string };

/** Compara chaves Pix ignorando formatação (pontuação, +55, maiúsculas). */
export function samePixKey(type: string, ours: string, theirs: string | null | undefined): boolean {
  if (!theirs) return false;
  if (type === "email" || type === "evp")
    return ours.trim().toLowerCase() === theirs.trim().toLowerCase();
  const digits = (s: string) => s.replace(/\D/g, "");
  const a = digits(ours);
  const b = digits(theirs);
  if (type === "phone") return a.replace(/^55/, "") === b.replace(/^55/, "");
  return a === b;
}

export const VALIDATION_WINDOW_MS = 15 * 60_000;

/** Escolhe o saque que corresponde à transferência, ou explica por que recusar. */
export function matchWithdrawal(
  req: ValidationRequest,
  candidates: PendingWithdrawal[],
  now = Date.now(),
): { answer: ValidationAnswer; withdrawal?: PendingWithdrawal } {
  if (req.type !== "TRANSFER" || !req.transfer?.id)
    return {
      answer: { status: "REFUSED", refuseReason: "Operação não solicitada pela Secretfans" },
    };
  const t = req.transfer;
  const cents = Math.round(Number(t.value ?? NaN) * 100);
  const byId = candidates.find((w) => w.provider_transfer_id === t.id);
  const match =
    byId ??
    candidates.find(
      (w) =>
        !w.provider_transfer_id &&
        w.amount_cents === cents &&
        samePixKey(w.pix_key_type, w.pix_key_value, t.bankAccount?.pixAddressKey) &&
        w.decided_at !== null &&
        now - new Date(w.decided_at).getTime() < VALIDATION_WINDOW_MS,
    );
  if (!match)
    return {
      answer: { status: "REFUSED", refuseReason: "Transferência sem saque aprovado na Secretfans" },
    };
  if (match.amount_cents !== cents)
    return { answer: { status: "REFUSED", refuseReason: "Valor diferente do saque aprovado" } };
  return { answer: { status: "APPROVED" }, withdrawal: match };
}
