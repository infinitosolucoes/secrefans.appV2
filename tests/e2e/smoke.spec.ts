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
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  // Scripts só com nonce (sem 'unsafe-inline'); nonce novo a cada requisição.
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
  expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(scriptSrc).not.toContain("unsafe-inline");
  const again = (await request.get("/")).headers()["content-security-policy"];
  expect(again).not.toBe(csp);
});

test("página carrega e funciona sem violar a CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load)/i.test(m.text()))
      violations.push(m.text());
  });
  await page.goto("/descobrir");
  await expect(page.locator("main")).toBeVisible();
  // Scripts do Next carregaram com o nonce (a página ficou interativa).
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll("script[nonce]").length))
    .toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
