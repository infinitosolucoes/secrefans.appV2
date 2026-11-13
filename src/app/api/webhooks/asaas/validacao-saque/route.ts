import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import type { ValidationRequest } from "@/lib/transfer-validation";
import { validateTransferRequest } from "@/server/payouts";

const sha = (s: string) => createHash("sha256").update(s).digest();
const refuse = (refuseReason: string) => NextResponse.json({ status: "REFUSED", refuseReason });

/**
 * Mecanismo de validação de saque do Asaas (Integrações → Mecanismos de segurança): o Asaas
 * pergunta, antes de executar cada transferência da conta, se ela foi pedida pela Secretfans.
 * Na dúvida, recusa: o saque fica sem transferência e o financeiro resolve pelo painel.
 */
export async function POST(request: Request) {
  const expected = serverEnv().ASAAS_TRANSFER_VALIDATION_TOKEN;
  const received = request.headers.get("asaas-access-token") ?? "";
  if (!expected || !timingSafeEqual(sha(received), sha(expected)))
    return NextResponse.json({ ok: false }, { status: 401 });
  let body: ValidationRequest;
  try {
    body = (await request.json()) as ValidationRequest;
  } catch {
    return refuse("Requisição inválida");
  }
  try {
    return NextResponse.json(await validateTransferRequest(body));
  } catch {
    return refuse("Erro ao validar na Secretfans");
  }
}
