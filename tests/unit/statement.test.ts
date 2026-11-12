import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/supabase", () => ({ createServerSupabase: vi.fn() }));

const { monthRange, summarize, toCsv } = await import("@/features/commerce/statement");
type Row = Parameters<typeof toCsv>[0][number];

const row = (over: Partial<Row>): Row => ({
  id: "o-1",
  date: "2026-11-12T03:44:19Z",
  kind: "tip",
  kindLabel: "Mimo",
  description: "Mimo",
  status: "paid",
  statusLabel: "Confirmado",
  method: "Pix",
  grossCents: 50000,
  commissionCents: 5000,
  feeCents: 199,
  netCents: 44801,
  splitCents: 44801,
  pendingCents: 0,
  ruleVersion: 1,
  ...over,
});

describe("extrato", () => {
  it("mês no fuso de São Paulo", () => {
    expect(monthRange("2026-11")).toEqual({
      from: "2026-11-01T03:00:00.000Z",
      to: "2026-12-01T03:00:00.000Z",
    });
    expect(monthRange("2026-12")?.to).toBe("2027-01-01T03:00:00.000Z");
    expect(monthRange("2026-13")).toBeNull();
  });

  it("resumo separa split, a receber e estornos", () => {
    const s = summarize([
      row({}),
      row({
        id: "o-2",
        grossCents: 3000,
        commissionCents: 300,
        netCents: 2501,
        splitCents: 0,
        pendingCents: 2501,
      }),
      row({ id: "o-3", status: "refunded", statusLabel: "Estornado" }),
    ]);
    expect(s).toMatchObject({ count: 2, reversed: 1, gross: 53000, split: 44801, pending: 2501 });
  });

  it("CSV em pt-BR (;, vírgula decimal, BOM) e escapa aspas", () => {
    const csv = toCsv([row({ description: 'Mensagem "especial"; oi' })]);
    expect(csv.startsWith("﻿Data;Tipo;")).toBe(true);
    expect(csv).toContain(";500,00;50,00;1,99;448,01;448,01;0,00;v1;o-1");
    expect(csv).toContain('"Mensagem ""especial""; oi"');
  });
});
