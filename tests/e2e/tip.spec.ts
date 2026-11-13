import { expect, test } from "@playwright/test";
import { login, serviceClient, USERS } from "./helpers";

/**
 * Modal do mimo: fã ajusta o valor com − e +, escreve uma mensagem e paga ali mesmo (simulado);
 * a mensagem chega ao chat do criador só depois do pagamento.
 */
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const db = serviceClient();
  await db
    .from("conversations")
    .delete()
    .eq("creator_id", USERS.creator.id)
    .eq("fan_id", USERS.fan.id);
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
});

test("fã envia mimo com mensagem pelo modal", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/criador_teste");
  await page.getByRole("button", { name: "Enviar mimo" }).click();
  const dialog = page.getByRole("dialog", { name: "Enviar mimo" });
  await expect(dialog).toBeVisible();
  // Começa em R$ 20; + duas vezes (R$ 5 cada) → R$ 30; − uma vez → R$ 25.
  await dialog.getByRole("button", { name: "Aumentar R$ 5" }).click();
  await dialog.getByRole("button", { name: "Aumentar R$ 5" }).click();
  await dialog.getByRole("button", { name: "Diminuir R$ 5" }).click();
  await expect(dialog.getByLabel("Valor do mimo em reais")).toHaveValue("25");
  await dialog.getByLabel("Mensagem (opcional)").fill("Você é incrível!");
  await expect(dialog.getByText("16 / 500")).toBeVisible();
  await dialog.getByLabel(/política de compras/).check();
  await dialog.getByRole("button", { name: "Enviar R$ 25,00" }).click();
  await page.waitForURL(/\/pedido\//);
  await page.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
});

test("criador recebe a mensagem do mimo no chat", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/mensagens");
  await page.getByRole("link", { name: /Mimo de R\$ 25,00/ }).click();
  await expect(
    page.getByRole("list", { name: "Mensagens da conversa" }).getByText("Você é incrível!"),
  ).toBeVisible();
});
