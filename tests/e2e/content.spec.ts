import { expect, test } from "@playwright/test";
import { login, serviceClient, TINY_PNG, USERS } from "./helpers";

/**
 * S2: criador publica (grátis e PPV) → visitante vê a foto grátis e o PPV bloqueado sem URL de
 * mídia → fã segue, vê no feed, curte, comenta e denuncia.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const FREE_TEXT = `Post grátis ${stamp}`;
const PPV_TEXT = `Post PPV ${stamp}`;

test.beforeAll(async () => {
  const db = serviceClient();
  // O criador do seed precisa estar aprovado (papel creator) para publicar.
  await db
    .from("user_roles")
    .upsert(
      { user_id: USERS.creator.id, role: "creator" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  await db.from("follows").delete().eq("follower_id", USERS.fan.id);
});

test("criador publica post grátis e PPV com foto", async ({ page }) => {
  await login(page, USERS.creator.email);
  for (const [text, visibility] of [
    [FREE_TEXT, "Grátis"],
    [PPV_TEXT, "PPV"],
  ] as const) {
    await page.goto("/estudio/publicar");
    await page.getByLabel("Texto").fill(text);
    await page.locator('input[type="file"]').setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(page.getByAltText("Foto 1 selecionada")).toBeVisible();
    await page.getByText(visibility, { exact: true }).click();
    if (visibility === "PPV") await page.getByLabel("Preço (R$)").fill("19,90");
    await page.getByLabel(/Declaro que tenho os direitos/).check();
    await page.getByRole("button", { name: "Publicar" }).click();
    await page.waitForURL("**/estudio?salvo=1");
    await expect(page.getByText(text)).toBeVisible();
  }
});

test("visitante vê a foto grátis e o PPV bloqueado sem URL de mídia", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: {
      cookies: [
        {
          name: "sf_maior18",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  });
  const page = await ctx.newPage();
  await page.goto("/criador_teste");

  const free = page.locator("article", { hasText: FREE_TEXT });
  await expect(free.locator("img[alt^='Foto 1']")).toHaveAttribute(
    "src",
    /\/object\/sign\/post-media\//,
  );

  const ppv = page.locator("article", { hasText: PPV_TEXT });
  await expect(ppv.getByText("Desbloqueie por R$ 19,90")).toBeVisible();
  await expect(ppv.locator("img[alt^='Foto']")).toHaveCount(0);
  const html = await ppv.innerHTML();
  expect(html).not.toContain("post-media");
  await ctx.close();
});

test("criador define tipo de perfil e categoria; Explorar filtra", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/conta/perfil");
  await page.getByText("Casal", { exact: true }).click();
  const fitness = page.getByLabel("Fitness", { exact: true });
  if (!(await fitness.isChecked())) await page.getByText("Fitness", { exact: true }).click();
  await page.getByRole("button", { name: "Salvar perfil de criador" }).click();
  await expect(page.getByText("Tipo de perfil, categorias e links atualizados.")).toBeVisible();

  await page.goto("/criador_teste");
  await expect(page.getByRole("link", { name: "Casal", exact: true })).toBeVisible();

  await page.goto("/explorar?tipo=casal&categoria=fitness");
  await expect(page.getByRole("heading", { name: "Casal · Fitness" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Criador Teste/ }).first()).toBeVisible();
  await page.goto("/explorar?tipo=homem");
  await expect(page.getByText("Nenhum criador em Homem ainda")).toBeVisible();
});

test("fã cadastra redes sociais e elas aparecem no perfil público", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/conta/perfil");
  await page.getByLabel("Instagram").fill("https://www.instagram.com/fa.teste/");
  await page.getByLabel("TikTok").fill("@fateste");
  await page.getByRole("button", { name: "Salvar redes sociais" }).click();
  await expect(page.getByText("Redes sociais atualizadas.")).toBeVisible();
  await page.goto("/fa_teste");
  const ig = page.getByRole("link", { name: "Instagram: fa.teste" });
  await expect(ig).toHaveAttribute("href", "https://instagram.com/fa.teste");
  await expect(page.getByRole("link", { name: "TikTok: fateste" })).toBeVisible();
});

test("fã segue, vê no feed, curte, comenta e denuncia", async ({ page }) => {
  await login(page, USERS.fan.email);
  await page.goto("/criador_teste");
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByRole("button", { name: "Seguindo" })).toBeVisible();

  await page.goto("/inicio");
  const card = page.locator("article", { hasText: FREE_TEXT });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Curtir" }).click();
  await expect(card.getByRole("button", { name: "Descurtir" })).toBeVisible();

  await card.getByRole("link", { name: /comentários/ }).click();
  await page.getByLabel("Escreva um comentário").fill("Que foto linda!");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Que foto linda!")).toBeVisible();

  await page.goto("/inicio");
  const ppvCard = page.locator("article", { hasText: PPV_TEXT });
  await ppvCard.getByText("Denunciar").click();
  await ppvCard.getByLabel("Motivo").selectOption("spam");
  await ppvCard.getByRole("button", { name: "Enviar denúncia" }).click();
  await expect(ppvCard.getByText(/Denúncia enviada|já denunciou/)).toBeVisible();
});
