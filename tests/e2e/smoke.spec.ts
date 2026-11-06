import { expect, test } from "@playwright/test";

const noOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test("landing pública renderiza com logo e CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Secretfans" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Criar Conta Grátis/i }).first()).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
});

test("descobrir mostra a home do app para visitantes", async ({ page }) => {
  await page.goto("/descobrir");
  await expect(page.getByRole("heading", { name: "Criadores em destaque" })).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
});

test("perfil público mostra só dados públicos", async ({ page }) => {
  await page.goto("/fa_teste");
  await expect(page.getByRole("heading", { name: "Fã Teste" })).toBeVisible();
  await expect(page.getByText("fa@secretfans.test")).toHaveCount(0);
});

test("headers de segurança presentes", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});
