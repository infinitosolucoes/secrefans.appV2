import { expect, test } from "@playwright/test";
import { USERS, confirmationLink, login, serviceClient } from "./helpers";

test("cadastro → confirmação de e-mail → sessão ativa com papel fan", async ({ page }) => {
  const stamp = Date.now();
  const email = `novo${stamp}@secretfans.test`;
  await page.goto("/criar-conta");
  await page.getByLabel("Nome público").fill("Pessoa Nova");
  await page.getByLabel(/Nome de usuário/).fill(`novo${stamp}`.slice(0, 30));
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByLabel(/^Senha/).fill("Segura12345A");
  await page.getByLabel(/18 anos ou mais/).check();
  await page.getByLabel(/termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.waitForURL("**/confirmar-email**");
  await expect(page.getByRole("heading", { name: "Confirme seu e-mail" })).toBeVisible();

  // Antes de confirmar, o login é recusado.
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Segura12345A");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Confirme seu e-mail antes de entrar/)).toBeVisible();

  await page.goto(await confirmationLink(email));
  await page.waitForURL("**/inicio");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();

  // Papel mínimo atribuído no cadastro (conferido no banco local).
  const db = serviceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("handle", `novo${stamp}`.slice(0, 30))
    .single();
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", profile!.id);
  expect(roles?.map((r) => r.role)).toEqual(["fan"]);
});

test("cadastro valida maioridade e termos", async ({ page }) => {
  await page.goto("/criar-conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Você precisa ter 18 anos ou mais.")).toBeVisible();
  await expect(page.getByText(/Aceite os termos/)).toBeVisible();
});

test("login com senha errada mostra erro genérico", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(USERS.fan.email);
  await page.getByLabel("Senha", { exact: true }).fill("Errada12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("fã não acessa o Super Admin", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/super-admin/usuarios");
  await page.waitForURL(/\/inicio\?erro=sem-permissao/);
  await expect(page.getByText("Acesso negado")).toBeVisible();
});

test("rotas protegidas exigem login e preservam o destino", async ({ page }) => {
  await page.goto("/conta/perfil");
  await page.waitForURL(/\/entrar\?next=%2Fconta%2Fperfil/);
  await page.getByLabel("E-mail").fill(USERS.fan.email);
  await page.getByLabel("Senha", { exact: true }).fill("Secret-Teste-2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/conta/perfil");
});

test("logout encerra a sessão", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL("**/entrar");
  await page.goto("/inicio");
  await page.waitForURL(/\/entrar/);
});
