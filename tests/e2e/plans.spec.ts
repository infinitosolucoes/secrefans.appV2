import { expect, test } from "@playwright/test";
import { login, serviceClient, USERS } from "./helpers";

/**
 * Planos e promoção: criador liga o trimestral e lança 80% off no mensal com 1 vaga; o fã vê a
 * oferta no perfil, assina pela promoção (pagamento simulado) e a vaga acaba.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const db = serviceClient();
  const { data: orders } = await db
    .from("orders")
    .select("id")
    .eq("buyer_id", USERS.fan.id)
    .eq("kind", "subscription");
  const ids = (orders ?? []).map((o) => o.id);
  if (ids.length) {
    const { data: entries } = await db.from("ledger_entries").select("id").in("order_id", ids);
    const entryIds = (entries ?? []).map((e) => e.id);
    if (entryIds.length) {
      await db.from("ledger_lines").delete().in("entry_id", entryIds);
      await db.from("ledger_entries").delete().in("id", entryIds);
    }
    await db.from("subscriptions").update({ last_order_id: null }).in("last_order_id", ids);
    await db.from("orders").delete().in("id", ids);
  }
  await db.from("subscriptions").delete().eq("fan_id", USERS.fan.id);
  await db.from("subscription_promotions").delete().eq("creator_id", USERS.creator.id);
  await db.from("subscription_plans").delete().eq("creator_id", USERS.creator.id);
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
  const { error } = await db
    .from("profiles")
    .update({ subscription_price_cents: 10000 })
    .eq("id", USERS.creator.id);
  if (error) throw new Error(`preparação falhou: ${error.message}`);
});

test("criador liga o trimestral e lança a promoção", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/estudio/vendas");
  await page.getByLabel("3 meses").check();
  await page.locator('input[name="discount_3"]').fill("15");
  await expect(page.getByText("R$ 255,00 a cada 3 meses")).toBeVisible();
  await page.getByRole("button", { name: "Salvar planos" }).click();
  await expect(page.getByText("Planos salvos.")).toBeVisible();

  await page.getByLabel("Desconto (%)", { exact: true }).last().fill("80");
  await page.getByLabel("Vagas (opcional)").fill("1");
  await page.getByLabel(/Recado para os fãs/).fill("Última chance: 80% off!");
  await page.getByRole("button", { name: "Lançar promoção" }).click();
  // A página é revalidada e passa a mostrar a promoção ativa.
  await expect(page.getByRole("button", { name: "Encerrar promoção" })).toBeVisible();
  await expect(page.getByText("0 de 1 vagas usadas", { exact: false })).toBeVisible();
});

test("fã vê a oferta e assina pela promoção", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/criador_teste");
  await expect(page.getByText("Última chance: 80% off!")).toBeVisible();
  await expect(page.getByText("1 vaga(s)", { exact: false })).toBeVisible();
  const plans = page.getByRole("list", { name: "Planos de assinatura" });
  await expect(plans.getByRole("link", { name: /3 meses \(15% off\)/ })).toContainText("R$ 255,00");
  await page.getByRole("link", { name: /Assinar por R\$ 20,00/ }).click();

  await expect(page.getByText("Mensal em promoção")).toBeVisible();
  await page.getByLabel(/política de compras/).check();
  await page.getByRole("button", { name: "Pagar R$ 20,00" }).click();
  await page.waitForURL(/\/pedido\//);
  await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();

  await page.goto("/criador_teste");
  await expect(page.getByText("Você assina")).toBeVisible();
  const { data: sub } = await serviceClient()
    .from("subscriptions")
    .select("price_cents, period_months")
    .eq("fan_id", USERS.fan.id)
    .eq("creator_id", USERS.creator.id)
    .single();
  expect(sub).toEqual({ price_cents: 10000, period_months: 1 }); // renova pelo preço normal
});

test("vaga esgotada encerra a promoção", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/estudio/vendas");
  await expect(page.getByRole("button", { name: "Lançar promoção" })).toBeVisible();
  const { data: promo } = await serviceClient()
    .from("subscription_promotions")
    .select("redemptions, ended_at")
    .eq("creator_id", USERS.creator.id)
    .single();
  expect(promo?.redemptions).toBe(1);
  expect(promo?.ended_at).not.toBeNull();
});
