import "server-only";
import { createServerSupabase } from "@/server/auth/supabase";
import { ORDER_KIND_LABEL, ORDER_STATUS, type OrderKind, type OrderStatus } from "./constants";

export interface StatementRow {
  id: string;
  date: string;
  kind: OrderKind;
  kindLabel: string;
  description: string;
  status: OrderStatus;
  statusLabel: string;
  method: string;
  grossCents: number;
  commissionCents: number;
  feeCents: number;
  netCents: number;
  /** Repassado direto pelo split do provedor. */
  splitCents: number;
  /** Parte do líquido que fica para a Secretfans repassar (vendas sem split). */
  pendingCents: number;
  ruleVersion: number;
}

/** "2026-11" → intervalo [início, fim) no fuso de São Paulo (UTC−3). */
export function monthRange(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const from = new Date(Date.UTC(y, mo - 1, 1, 3));
  const to = new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1, 3));
  return { from: from.toISOString(), to: to.toISOString() };
}

export const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);

/** Vendas do criador no mês (pagas, estornadas e contestadas), pela data do pagamento. */
export async function getStatement(creatorId: string, month: string): Promise<StatementRow[]> {
  const range = monthRange(month);
  if (!range) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, kind, description, status, method, gross_cents, commission_cents, external_fees_cents, creator_net_cents, split_cents, commission_rule_version, paid_at, created_at",
    )
    .eq("creator_id", creatorId)
    .in("status", ["paid", "refunded", "chargeback"])
    .gte("paid_at", range.from)
    .lt("paid_at", range.to)
    .order("paid_at", { ascending: false })
    .limit(5000);
  return (data ?? []).map((o) => {
    const kind = o.kind as OrderKind;
    const status = o.status as OrderStatus;
    const reversed = status !== "paid";
    return {
      id: o.id,
      date: o.paid_at ?? o.created_at,
      kind,
      kindLabel: ORDER_KIND_LABEL[kind],
      description: o.description,
      status,
      statusLabel: ORDER_STATUS[status].label,
      method: o.method === "pix" ? "Pix" : "Cartão",
      grossCents: o.gross_cents,
      commissionCents: o.commission_cents,
      feeCents: o.external_fees_cents,
      netCents: o.creator_net_cents,
      splitCents: o.split_cents,
      pendingCents: reversed ? 0 : Math.max(0, o.creator_net_cents - o.split_cents),
      ruleVersion: o.commission_rule_version,
    };
  });
}

export function summarize(rows: StatementRow[]) {
  const paid = rows.filter((r) => r.status === "paid");
  const sum = (
    k: keyof Pick<
      StatementRow,
      "grossCents" | "commissionCents" | "feeCents" | "netCents" | "splitCents" | "pendingCents"
    >,
  ) => paid.reduce((t, r) => t + r[k], 0);
  return {
    count: paid.length,
    reversed: rows.length - paid.length,
    gross: sum("grossCents"),
    commission: sum("commissionCents"),
    fee: sum("feeCents"),
    net: sum("netCents"),
    split: sum("splitCents"),
    pending: sum("pendingCents"),
  };
}

const cents = (v: number) => (v / 100).toFixed(2).replace(".", ",");
const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV em pt-BR (separador ";" e vírgula decimal), abre direto no Excel. */
export function toCsv(rows: StatementRow[]): string {
  const header = [
    "Data",
    "Tipo",
    "Descrição",
    "Status",
    "Forma",
    "Bruto (R$)",
    "Comissão (R$)",
    "Taxa (R$)",
    "Líquido (R$)",
    "Repassado via split (R$)",
    "A receber da Secretfans (R$)",
    "Regra",
    "Pedido",
  ];
  const lines = rows.map((r) =>
    [
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(r.date)),
      r.kindLabel,
      r.description,
      r.statusLabel,
      r.method,
      cents(r.grossCents),
      cents(r.commissionCents),
      cents(r.feeCents),
      cents(r.netCents),
      cents(r.splitCents),
      cents(r.pendingCents),
      `v${r.ruleVersion}`,
      r.id,
    ]
      .map((v) => csvCell(String(v)))
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
