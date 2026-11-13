import { expect, test } from "@playwright/test";
import { serviceClient, USERS } from "./helpers";

/** Cabeçalho do perfil: contadores, bio com "Ler mais" e as abas Postagens e Mídias. */
const BIO = `Primeira linha da bio.\n${"Conteúdo exclusivo toda semana. ".repeat(8)}\nÚltima linha escondida.`;

test.beforeAll(async () => {
  const db = serviceClient();
  await db
    .from("user_roles")
    .upsert(
      { user_id: USERS.creator.id, role: "creator" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  const { error } = await db.from("profiles").update({ bio: BIO }).eq("id", USERS.creator.id);
  if (error) throw new Error(`preparação falhou: ${error.message}`);
});

test("visitante vê contadores, abre a bio e troca para Mídias", async ({ page }) => {
  await page.goto("/criador_teste");
  const numbers = page.getByRole("list", { name: "Números do perfil" });
  for (const label of ["fotos", "vídeos", "curtidas", "seguidores"]) {
    await expect(numbers.getByText(label, { exact: false })).toBeVisible();
  }

  const more = page.getByRole("button", { name: "Ler mais" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(page.getByRole("button", { name: "Ler menos" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.getByRole("link", { name: /^Mídias \(\d+\)$/ }).click();
  await page.waitForURL(/aba=midias/);
  await expect(
    page
      .getByRole("list", { name: "Mídias" })
      .or(page.getByText("Nenhuma foto ou vídeo ainda")),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Postagens \(\d+\)$/ })).toBeVisible();
});
