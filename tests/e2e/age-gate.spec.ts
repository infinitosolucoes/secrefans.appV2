import { expect, test } from "@playwright/test";

test.describe("aviso +18", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitante novo vê o aviso e volta para a página pedida", async ({ page }) => {
    await page.goto("/descobrir");
    await expect(page).toHaveURL(/\/aviso-18\?next=%2Fdescobrir/);
    await expect(
      page.getByRole("heading", { name: "Conteúdo para maiores de 18 anos" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tenho 18 anos ou mais" }).click();
    await page.waitForURL("**/descobrir");

    // A confirmação fica lembrada.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Criar Conta Grátis/i }).first()).toBeVisible();
  });

  test("termos continuam acessíveis sem confirmar", async ({ page }) => {
    await page.goto("/termos");
    await expect(page).toHaveURL(/\/termos$/);
  });

  test("next externo é ignorado", async ({ page }) => {
    await page.goto("/aviso-18?next=//evil.example");
    await page.getByRole("button", { name: "Tenho 18 anos ou mais" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
  });
});
