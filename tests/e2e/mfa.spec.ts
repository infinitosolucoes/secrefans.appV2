import { expect, test, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { login, serviceClient, USERS } from "./helpers";

/**
 * S8: fã ativa a verificação em duas etapas em Conta → Segurança; no próximo login o código é
 * pedido antes de entrar; depois desativa.
 */
test.describe.configure({ mode: "serial" });

let secret = "";

async function clearFactors() {
  const db = serviceClient();
  const { data } = await db.auth.admin.mfa.listFactors({ userId: USERS.fan.id });
  for (const f of data?.factors ?? [])
    await db.auth.admin.mfa.deleteFactor({ userId: USERS.fan.id, id: f.id });
}

/** Digita o código; se o Supabase recusar (código da janela já usado), espera a próxima janela. */
async function enterCode(page: Page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("Código de 6 dígitos").fill(new TOTP({ secret }).generate());
    await page.getByRole("button", { name: "Verificar" }).click();
    const failed = await page
      .getByText(/Código inválido/)
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!failed) return;
    await page.waitForTimeout(31_000);
  }
}

test.beforeAll(clearFactors);
test.afterAll(clearFactors);

test("fã ativa a verificação em duas etapas", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/conta/seguranca");
  await expect(page.getByText("Desativada")).toBeVisible();
  const key = page.locator("code").first();
  await expect(key).toBeVisible();
  secret = (await key.textContent())!.trim();
  await enterCode(page);
  await expect(page.getByText("Ativa", { exact: true })).toBeVisible();
});

test("no próximo login o código é pedido antes de entrar", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(USERS.fan.email);
  await page.getByLabel("Senha", { exact: true }).fill("Secret-Teste-2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/entrar\/codigo/);
  // Sem o código, as páginas da conta continuam bloqueadas.
  await page.goto("/biblioteca");
  await page.waitForURL(/\/entrar\/codigo/);
  await enterCode(page);
  await page.waitForURL(/\/biblioteca/);
});

test("fã desativa a verificação em duas etapas", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(USERS.fan.email);
  await page.getByLabel("Senha", { exact: true }).fill("Secret-Teste-2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/entrar\/codigo/);
  await enterCode(page);
  await page.goto("/conta/seguranca");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Desativar verificação em duas etapas" }).click();
  await expect(page.getByText("Desativada")).toBeVisible();
});
