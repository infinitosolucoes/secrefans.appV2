import { expect, test } from "@playwright/test";
import { login, serviceClient, TINY_PNG, USERS } from "./helpers";

/**
 * S6: fã abre conversa e manda mensagem; criador responde com mensagem paga (foto);
 * fã desbloqueia pelo checkout (pagamento simulado) e vê a foto; criador envia em massa.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const db = serviceClient();
  // Estado limpo (somente banco local).
  const { data: convs } = await db
    .from("conversations")
    .select("id")
    .eq("creator_id", USERS.creator.id)
    .eq("fan_id", USERS.fan.id);
  const convIds = (convs ?? []).map((c) => c.id);
  const { data: orders } = await db
    .from("orders")
    .select("id")
    .eq("buyer_id", USERS.fan.id)
    .eq("kind", "message");
  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length) {
    const { data: entries } = await db.from("ledger_entries").select("id").in("order_id", orderIds);
    const entryIds = (entries ?? []).map((e) => e.id);
    if (entryIds.length) {
      await db.from("ledger_lines").delete().in("entry_id", entryIds);
      await db.from("ledger_entries").delete().in("id", entryIds);
    }
    await db.from("entitlements").delete().in("order_id", orderIds);
    await db.from("orders").delete().in("id", orderIds);
  }
  if (convIds.length) await db.from("conversations").delete().in("id", convIds);
  await db.from("message_broadcasts").delete().eq("creator_id", USERS.creator.id);
  await db.from("notifications").delete().in("user_id", [USERS.creator.id, USERS.fan.id]);

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
    .update({ dm_policy: "everyone" })
    .eq("id", USERS.creator.id);
  if (error) throw new Error(`preparação falhou: ${error.message}`);
  // Assinatura ativa (para a mensagem em massa).
  await db.from("subscriptions").upsert(
    {
      fan_id: USERS.fan.id,
      creator_id: USERS.creator.id,
      price_cents: 2990,
      status: "active",
      current_period_end: new Date(Date.now() + 20 * 86400_000).toISOString(),
    },
    { onConflict: "fan_id,creator_id" },
  );
});

test("fã abre conversa pelo perfil e envia mensagem", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/criador_teste");
  await page.getByRole("button", { name: "Mensagem" }).click();
  await page.waitForURL(/\/mensagens\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Mensagem" }).fill("Oi! Adoro seu conteúdo");
  await page.getByRole("button", { name: "Inserir emoji" }).click();
  await page.getByRole("button", { name: "Emoji 🔥" }).click();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Mensagens da conversa" }).getByText("Oi! Adoro seu conteúdo🔥"),
  ).toBeVisible();
});

test("criador vê a não lida e responde com mensagem paga (foto)", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/mensagens");
  await expect(page.getByLabel(/não lidas/).first()).toBeVisible();
  await page.getByRole("link", { name: /Adoro seu conteúdo/ }).click();
  await expect(page.getByText("Oi! Adoro seu conteúdo")).toBeVisible();
  await page.getByLabel("Anexar fotos ou vídeos").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByRole("button", { name: "Cobrar para ver" }).click();
  await page.getByLabel(/Preço para desbloquear/).fill("9,90");
  await page.getByRole("textbox", { name: "Mensagem" }).fill("Exclusivo pra você");
  // Sem a declaração de direitos e consentimento a mídia não sai.
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText(/marque a declaração de direitos/)).toBeVisible();
  await page.getByLabel(/Declaro que tenho os direitos/).check();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Mensagem paga · R$ 9,90")).toBeVisible();
});

test("fã desbloqueia a mensagem paga e vê a foto", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/mensagens");
  await page.getByRole("link", { name: /Mensagem paga/ }).click();
  await expect(page.getByAltText("Foto 1 da mensagem")).toHaveCount(0);
  await page.getByRole("link", { name: "Desbloquear por R$ 9,90" }).click();
  await expect(page.getByRole("heading", { name: "Finalizar compra" })).toBeVisible();
  await page.getByLabel(/política de compras/).check();
  await page.getByRole("button", { name: "Pagar R$ 9,90" }).click();
  await page.waitForURL(/\/pedido\//);
  await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver mensagem" }).click();
  await expect(page.getByAltText("Foto 1 da mensagem")).toHaveAttribute(
    "src",
    /\/object\/sign\/post-media\//,
  );
});

test("criador envia mensagem em massa para assinantes", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/mensagens/massa");
  await page.getByRole("textbox", { name: "Mensagem" }).fill("Novidade para assinantes!");
  await page.getByRole("button", { name: "Enviar para assinantes" }).click();
  await expect(page.getByText("Enviada para 1 assinante.")).toBeVisible();
});

test("fã vê a mensagem paga na biblioteca", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/biblioteca?aba=ppv");
  await expect(page.getByRole("link", { name: "Ver mensagem" })).toBeVisible();
});

test("criador recebe notificações e vê a venda no extrato (com CSV)", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/notificacoes");
  await expect(page.getByText("Nova venda: R$ 9,90")).toBeVisible();
  await expect(page.getByText(/te mandou uma mensagem/).first()).toBeVisible();
  await page.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await expect(page.getByRole("button", { name: "Marcar todas como lidas" })).toHaveCount(0);

  await page.goto("/estudio/extrato");
  const row = page.getByRole("row", { name: /Mensagem paga/ });
  await expect(row).toContainText("R$ 9,90");
  const csv = await page.request.get("/estudio/extrato/csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Mensagem paga;");
});
