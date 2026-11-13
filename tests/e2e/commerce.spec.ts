import { expect, test } from "@playwright/test";
import { login, passMfa, serviceClient, TINY_PNG, USERS } from "./helpers";

/**
 * S4: fã compra PPV e assina (pagamento simulado pelo mesmo webhook assinado) → conteúdo liberado;
 * criador vê a venda com 10% de comissão; Super Admin vê a regra e agenda nova versão.
 */
test.describe.configure({ mode: "serial" });

const PPV_ID = "88888888-0000-4000-a000-000000000001";
const SUB_ID = "88888888-0000-4000-a000-000000000002";
const media = (postId: string) =>
  `${USERS.creator.id}/${postId}/99999999-0000-4000-a000-${postId.slice(-12)}.webp`;

test.beforeAll(async () => {
  const db = serviceClient();
  // Estado limpo (somente banco local).
  const { data: orders } = await db.from("orders").select("id").eq("buyer_id", USERS.fan.id);
  const ids = (orders ?? []).map((o) => o.id);
  if (ids.length) {
    // Ledger é imutável; o banco local (marcado pelo seed) permite a limpeza dos testes.
    const { data: entries } = await db.from("ledger_entries").select("id").in("order_id", ids);
    const entryIds = (entries ?? []).map((e) => e.id);
    if (entryIds.length) {
      await db.from("ledger_lines").delete().in("entry_id", entryIds);
      await db.from("ledger_entries").delete().in("id", entryIds);
    }
    await db.from("entitlements").delete().in("order_id", ids);
    await db.from("subscriptions").update({ last_order_id: null }).in("last_order_id", ids);
    await db.from("orders").delete().in("id", ids);
  }
  await db.from("subscriptions").delete().eq("fan_id", USERS.fan.id);
  await db.from("commission_rules").delete().gt("version", 1);
  await db.from("posts").delete().in("id", [PPV_ID, SUB_ID]);

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
  const { error: priceError } = await db
    .from("profiles")
    .update({ subscription_price_cents: 2990 })
    .eq("id", USERS.creator.id);
  if (priceError) throw new Error(`preparação falhou: ${priceError.message}`);

  await db.from("posts").insert([
    {
      id: PPV_ID,
      creator_id: USERS.creator.id,
      body: "PPV de teste S4",
      visibility: "ppv",
      price_cents: 1990,
      status: "published",
      content_attested_at: new Date().toISOString(),
    },
    {
      id: SUB_ID,
      creator_id: USERS.creator.id,
      body: "Só para assinantes S4",
      visibility: "subscribers",
      status: "published",
      content_attested_at: new Date().toISOString(),
    },
  ]);
  for (const id of [PPV_ID, SUB_ID]) {
    await db.storage
      .from("post-media")
      .upload(media(id), TINY_PNG, { contentType: "image/png", upsert: true });
    await db
      .from("post_media")
      .insert({ post_id: id, creator_id: USERS.creator.id, storage_path: media(id) });
  }
});

test("visitante que clica em comprar volta ao mesmo item depois do login", async ({ page }) => {
  await page.goto(`/checkout?tipo=ppv&id=${PPV_ID}`);
  await expect(page).toHaveURL(
    new RegExp(
      `/entrar\\?next=${encodeURIComponent(`/checkout?tipo=ppv&id=${PPV_ID}`).replace(/[?]/g, "\\?")}`,
    ),
  );
  await page.getByRole("textbox", { name: "E-mail" }).fill(USERS.fan.email);
  await page.getByLabel("Senha", { exact: true }).fill("Secret-Teste-2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/checkout\?tipo=ppv/);
  await expect(page.getByRole("heading", { name: "Finalizar compra" })).toBeVisible();
});

test("fã compra PPV e o conteúdo é liberado após o pagamento", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto(`/p/${PPV_ID}`);
  const card = page.locator("article", { hasText: "PPV de teste S4" });
  await expect(card.locator("img[alt^='Foto']")).toHaveCount(0);
  await card.getByRole("link", { name: "Desbloquear por R$ 19,90" }).click();

  await expect(page.getByRole("heading", { name: "Finalizar compra" })).toBeVisible();
  await page.getByLabel(/política de compras/).check();
  await page.getByRole("button", { name: "Pagar R$ 19,90" }).click();
  await page.waitForURL(/\/pedido\//);
  await expect(page.getByText("Aguardando pagamento")).toBeVisible();

  await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver publicação" }).click();
  await expect(
    page.locator("article", { hasText: "PPV de teste S4" }).locator("img[alt^='Foto']"),
  ).toHaveAttribute("src", /\/object\/sign\/post-media\//);
});

test("fã assina o criador e vê o post de assinantes", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/criador_teste");
  await page.getByRole("link", { name: "Assinar agora" }).click();
  await page.getByText("Cartão de crédito", { exact: true }).click();
  await page.getByLabel(/política de compras/).check();
  await page.getByRole("button", { name: "Pagar R$ 29,90" }).click();
  await page.waitForURL(/\/pedido\//);
  await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();

  await page.goto("/criador_teste");
  await expect(page.getByText("Você assina")).toBeVisible();
  await page.goto(`/p/${SUB_ID}`);
  await expect(
    page.locator("article", { hasText: "Só para assinantes S4" }).locator("img[alt^='Foto']"),
  ).toBeVisible();

  await page.goto("/biblioteca?aba=assinaturas");
  await expect(page.getByText(/Ativa · renova em/)).toBeVisible();
});

test("criador vê a venda com comissão de 10% e regra v1", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/estudio/vendas");
  const row = page.getByRole("row", { name: /PPV de teste S4/ });
  await expect(row).toContainText("R$ 19,90");
  await expect(row).toContainText("− R$ 1,99");
  await expect(row).toContainText("R$ 17,91");
  await expect(row).toContainText("v1");
  await page.goto("/estudio/comissao");
  await expect(page.getByText("10%").first()).toBeVisible();
});

test("Super Admin vê a regra de 10% e agenda nova versão para aprovação", async ({ page }) => {
  await login(page, USERS.admin.email);
  await passMfa(page);
  await page.goto("/super-admin/comissoes");
  await expect(page.getByText("Taxa padrão · v1")).toBeVisible();
  await page.getByLabel("Novo percentual (%)").fill("12");
  const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 16);
  await page.getByLabel(/Início da vigência/).fill(tomorrow);
  await page.getByLabel(/Justificativa/).fill("Teste de agendamento E2E");
  await page.getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(page.getByText(/enviada para aprovação/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/A aprovação precisa ser feita por outro administrador/),
  ).toBeVisible();
  await serviceClient().from("commission_rules").delete().gt("version", 1);
});
