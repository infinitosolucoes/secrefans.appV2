import "server-only";
import {
  matchWithdrawal,
  type ValidationAnswer,
  type ValidationRequest,
} from "@/lib/transfer-validation";
import { createServiceSupabase } from "@/server/auth/supabase";
import {
  activeProviderName,
  getAsaasProvider,
  simulatedPaymentsAllowed,
} from "@/server/providers/payments";
import {
  AsaasError,
  normalizeTransferStatus,
  type AsaasTransfer,
  type PixKeyType,
} from "@/server/providers/payments/asaas";

type Settle = { status: "paid" | "failed"; feeCents?: number; reason?: string | null };

async function settle(id: string, s: Settle) {
  const db = createServiceSupabase();
  const { data, error } = await db.rpc("settle_withdrawal", {
    p_id: id,
    p_status: s.status,
    p_fee_cents: s.feeCents ?? 0,
    p_reason: s.reason ?? undefined,
  });
  if (error) throw new Error(`settle_withdrawal: ${error.message}`);
  return data as string;
}

const asaasReason = (e: AsaasError) => {
  const errors = (e.details as { errors?: Array<{ description?: string }> } | undefined)?.errors;
  return errors?.[0]?.description ?? e.message;
};

/** Aplica o resultado de uma transferência do Asaas ao saque (idempotente). */
export async function applyTransfer(withdrawalId: string, t: AsaasTransfer) {
  const status = normalizeTransferStatus(t);
  if (!status) return "pending";
  return settle(withdrawalId, {
    status,
    feeCents: Math.round((t.transferFee ?? 0) * 100),
    reason: t.failReason ?? (status === "failed" ? `transferência ${t.status}` : null),
  });
}

/**
 * Executa um saque aprovado (status processing, sem transferência): cria o Pix no provedor.
 * Erro de validação do provedor (4xx) marca o saque como falho e devolve o saldo; erro de rede
 * deixa em processamento para a conciliação/nova tentativa manual (sem risco de Pix em dobro).
 */
export async function executeWithdrawal(id: string): Promise<string> {
  const db = createServiceSupabase();
  const { data: w } = await db
    .from("withdrawals")
    .select("id, amount_cents, pix_key_type, pix_key_value, status, provider_transfer_id")
    .eq("id", id)
    .maybeSingle();
  if (!w || w.status !== "processing" || w.provider_transfer_id) return "skip";

  if (activeProviderName() !== "asaas") {
    if (!simulatedPaymentsAllowed()) throw new Error("provedor de saques indisponível");
    await db.rpc("attach_withdrawal_transfer", {
      p_id: id,
      p_provider: "simulado",
      p_transfer_id: `sim_tr_${id}`,
    });
    return settle(id, { status: "paid" });
  }

  const asaas = getAsaasProvider();
  let t: AsaasTransfer;
  try {
    t = await asaas.createPixTransfer({
      amountCents: w.amount_cents,
      keyType: w.pix_key_type as PixKeyType,
      key: w.pix_key_value,
      externalReference: `withdrawal:${id}`,
      description: "Saque Secretfans",
    });
  } catch (e) {
    if (e instanceof AsaasError && e.status >= 400 && e.status < 500) {
      await db.rpc("attach_withdrawal_transfer", {
        p_id: id,
        p_provider: "asaas",
        p_transfer_id: `rejected_${id}`,
      });
      return settle(id, { status: "failed", reason: asaasReason(e) });
    }
    throw e;
  }
  const { error } = await db.rpc("attach_withdrawal_transfer", {
    p_id: id,
    p_provider: "asaas",
    p_transfer_id: t.id,
  });
  if (error) throw new Error(`attach_withdrawal_transfer: ${error.message}`);
  return applyTransfer(id, t);
}

/**
 * Saque aprovado que ficou sem transferência (o provedor não respondeu a tempo): procura no
 * provedor pela referência externa. Achou → vincula e aplica o status; não achou depois de
 * 10 minutos → o provedor não criou o Pix, então marca como falho e devolve o saldo.
 */
export async function resolveStuckWithdrawal(id: string): Promise<string> {
  const db = createServiceSupabase();
  const { data: w } = await db
    .from("withdrawals")
    .select("id, status, provider_transfer_id, decided_at")
    .eq("id", id)
    .maybeSingle();
  if (!w || w.status !== "processing" || w.provider_transfer_id) return "skip";
  if (activeProviderName() !== "asaas") return "skip";
  const asaas = getAsaasProvider();
  const t = (await asaas.listRecentTransfers()).find(
    (x) => x.externalReference === `withdrawal:${id}`,
  );
  if (t) {
    await db.rpc("attach_withdrawal_transfer", {
      p_id: id,
      p_provider: "asaas",
      p_transfer_id: t.id,
    });
    return applyTransfer(id, t);
  }
  if (Date.now() - new Date(w.decided_at ?? 0).getTime() < 10 * 60_000) return "aguardando";
  await db.rpc("attach_withdrawal_transfer", {
    p_id: id,
    p_provider: "asaas",
    p_transfer_id: `none_${id}`,
  });
  return settle(id, {
    status: "failed",
    reason: "O provedor não criou a transferência. Confira a chave Pix e peça de novo.",
  });
}

/** Conciliação: consulta as transferências em processamento e aplica as que já terminaram. */
export async function reconcileWithdrawals() {
  if (activeProviderName() !== "asaas") return { checked: 0, settled: 0 };
  const db = createServiceSupabase();
  const asaas = getAsaasProvider();
  const { data } = await db
    .from("withdrawals")
    .select("id, provider_transfer_id")
    .eq("status", "processing")
    .eq("provider", "asaas")
    .not("provider_transfer_id", "is", null)
    .limit(50);
  let settled = 0;
  const { data: stuck } = await db
    .from("withdrawals")
    .select("id")
    .eq("status", "processing")
    .is("provider_transfer_id", null)
    .lt("decided_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(20);
  for (const w of stuck ?? []) {
    if ((await resolveStuckWithdrawal(w.id).catch(() => "erro")) === "ok") settled++;
  }
  for (const w of data ?? []) {
    try {
      const r = await applyTransfer(w.id, await asaas.getTransfer(w.provider_transfer_id!));
      if (r === "ok") settled++;
    } catch {
      // tenta de novo na próxima execução
    }
  }
  return { checked: data?.length ?? 0, settled };
}

/** Webhook TRANSFER_*: localiza o saque pela transferência e aplica o status. */
export async function applyTransferWebhook(t: AsaasTransfer) {
  const db = createServiceSupabase();
  const { data: w } = await db
    .from("withdrawals")
    .select("id")
    .eq("provider", "asaas")
    .eq("provider_transfer_id", t.id)
    .maybeSingle();
  // O webhook pode chegar antes de a transferência ser vinculada: usa a referência externa.
  const ref = t.externalReference?.match(/^withdrawal:([0-9a-f-]{36})$/)?.[1];
  const id = w?.id ?? ref;
  if (!id) return "sem saque";
  if (!w) {
    await db.rpc("attach_withdrawal_transfer", {
      p_id: id,
      p_provider: "asaas",
      p_transfer_id: t.id,
    });
  }
  return applyTransfer(id, t);
}

/**
 * Validação de saque (Asaas → Secretfans, antes de executar a transferência). Aprova só a
 * transferência de um saque em processamento; vincula o id da transferência se ainda não houver.
 */
export async function validateTransferRequest(req: ValidationRequest): Promise<ValidationAnswer> {
  const db = createServiceSupabase();
  const { data } = await db
    .from("withdrawals")
    .select("id, amount_cents, pix_key_type, pix_key_value, provider_transfer_id, decided_at")
    .eq("status", "processing")
    .limit(50);
  const { answer, withdrawal } = matchWithdrawal(req, data ?? []);
  if (answer.status === "APPROVED" && withdrawal && !withdrawal.provider_transfer_id) {
    await db.rpc("attach_withdrawal_transfer", {
      p_id: withdrawal.id,
      p_provider: "asaas",
      p_transfer_id: req.transfer!.id!,
    });
  }
  return answer;
}
