import { expect, test } from "@playwright/test";
import { login, passMfa, serviceClient, USERS } from "./helpers";

/**
 * S6: fã manda um mimo (pagamento simulado) → venda liberada → criador cadastra a chave Pix e pede
 * o saque → financeiro (Super Admin com MFA) aprova → Pix enviado (provedor simulado) e saldo abatido.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const db = serviceClient();
  const { data: ws } = await db.from("withdrawals").select("id").eq("creator_id", USERS.creator.id);
  const ids = (ws ?? []).map((w) => w.id);
  if (ids.length) {
    const { data: entries } = await db.from("ledger_entries").select("id").in("withdrawal_id", ids);
    const entryIds = (entries ?? []).map((e) => e.id);
    if (entryIds.length) {
      await db.from("ledger_lines").delete().in("entry_id", entryIds);
      await db.from("ledger_entries").delete().in("id", entryIds);
    }
    await db.from("withdrawals").delete().in("id", ids);
  }
  await db.from("creator_pix_keys").delete().eq("creator_id", USERS.creator.id);
  await db.from("notifications").delete().eq("user_id", USERS.creator.id).eq("kind", "payout");
  await db
    .from("user_roles")
    .upsert(
      { user_id: USERS.creator.id, role: "creator" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  const { data: rule } = await db.from("commission_rules").select("id").eq("version", 1).single();
  await db
    .from("creator_commission_acceptances")
    .upsert({ creator_id: USERS.creator.id, rule_id: rule!.id }, { ignoreDuplicates: true });
  await db.from("creator_verifications").delete().eq("user_id", USERS.creator.id);
  const { error } = await db.from("creator_verifications").insert({
    user_id: USERS.creator.id,
    status: "approved",
    legal_name: "Criador Teste",
    birth_date: "1990-01-01",
    document_front_path: `${USERS.creator.id}/doc.jpg`,
    selfie_path: `${USERS.creator.id}/selfie.jpg`,
    decided_at: new Date().toISOString(),
    decision_reason: "ok",
  });
  if (error) throw new Error(`preparação falhou: ${error.message}`);
});

test("fã manda mimo de R$ 50 e a venda fica liberada para saque", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto(`/checkout?tipo=mimo&id=${USERS.creator.id}`);
  await page.getByText("R$ 50,00").click();
  await page.getByLabel(/política de compras/).check();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await page.waitForURL(/\/pedido\//);
  await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
  // Passa o prazo de liberação (7 dias no Pix) para as vendas do criador.
  const db = serviceClient();
  await db
    .from("orders")
    .update({ paid_at: new Date(Date.now() - 10 * 86400_000).toISOString() })
    .eq("creator_id", USERS.creator.id)
    .eq("status", "paid");
});

test("criador cadastra a chave Pix e pede o saque", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/carteira");
  await page.getByLabel("Tipo de chave").selectOption("email");
  await page.getByRole("textbox", { name: "Chave Pix" }).fill("criador@secretfans.test");
  await page.getByLabel(/Confirmo que esta chave Pix/).check();
  await page.getByRole("button", { name: "Salvar chave Pix" }).click();
  // A página é revalidada e passa a mostrar a chave cadastrada (mascarada).
  await expect(page.getByText("cr***@secretfans.test")).toBeVisible();
  await page.getByLabel(/Valor do saque/).fill("30,00");
  await page.getByRole("button", { name: "Solicitar saque" }).click();
  await expect(page.getByText("Saque de R$ 30,00 solicitado.", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Seus saques" }).getByText("Aguardando aprovação"),
  ).toBeVisible();
});

test("financeiro aprova e o Pix é enviado", async ({ page }) => {
  await login(page, USERS.admin.email);
  await passMfa(page);
  await page.goto("/super-admin/saques");
  await expect(page.getByText("criador@secretfans.test")).toBeVisible();
  await page.getByRole("button", { name: "Aprovar e enviar R$ 30,00" }).click();
  // Decidido, o saque sai da fila e vai para o histórico já como pago (provedor simulado).
  await expect(
    page.getByRole("table", { name: "Histórico de saques" }).getByText("Pago", { exact: true }),
  ).toBeVisible();
});

test("criador vê o saque pago e a notificação", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/carteira");
  await expect(
    page.getByRole("table", { name: "Seus saques" }).getByText("Pago", { exact: true }),
  ).toBeVisible();
  await page.goto("/notificacoes");
  await expect(page.getByText("Saque de R$ 30,00 enviado")).toBeVisible();
});
