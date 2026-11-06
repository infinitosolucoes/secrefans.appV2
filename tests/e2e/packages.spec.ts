import { expect, test, type Page } from "@playwright/test";
import { login, serviceClient, TINY_PNG, USERS } from "./helpers";

/** S3: criador monta pacote (foto + vídeo), publica, versiona; visitante vê a vitrine sem mídia. */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const TITLE = `Ensaio ${stamp}`;
const TITLE_V2 = `Ensaio ${stamp} v2`;

test.beforeAll(async () => {
  await serviceClient()
    .from("user_roles")
    .upsert(
      { user_id: USERS.creator.id, role: "creator" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
});

/** Grava um MP4 curto (H.264) no próprio Chromium; null se o navegador não suportar. */
async function recordMp4(page: Page): Promise<Buffer | null> {
  const b64 = await page.evaluate(async () => {
    // O Chromium do Playwright não tem o decodificador H.264 (proprietário): sem ele, não há
    // como ler o MP4 no navegador de teste. Chrome/Safari/Edge reais leem normalmente.
    const canDecode = document
      .createElement("video")
      .canPlayType('video/mp4; codecs="avc1.42E01E"');
    const type = ["video/mp4;codecs=avc1", "video/mp4"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    if (!type || !canDecode) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(15);
    const rec = new MediaRecorder(stream, { mimeType: type });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = frame++ % 2 ? "#ff0a78" : "#1a0710";
      ctx.fillRect(0, 0, 160, 120);
    }, 66);
    rec.start();
    await new Promise((r) => setTimeout(r, 1600));
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    clearInterval(timer);
    const blob = new Blob(chunks, { type: "video/mp4" });
    // Confere se este navegador consegue de fato decodificar o arquivo gravado.
    const readable = await new Promise<boolean>((resolve) => {
      const v = document.createElement("video");
      v.muted = true;
      v.onloadeddata = () => resolve(true);
      v.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 4000);
      v.src = URL.createObjectURL(blob);
    });
    if (!readable) return null;
    const buf = await blob.arrayBuffer();
    let bin = "";
    new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  });
  return b64 ? Buffer.from(b64, "base64") : null;
}

test("criador cria, publica e versiona um pacote", async ({ page }) => {
  await login(page, USERS.creator.email);
  await page.goto("/estudio/pacotes/novo");
  await page.getByLabel("Título").fill(TITLE);
  await page.getByLabel("Descrição").fill("Fotos e bastidores.");
  const files: Array<{ name: string; mimeType: string; buffer: Buffer }> = [
    { name: "foto.png", mimeType: "image/png", buffer: TINY_PNG },
  ];
  const mp4 = await recordMp4(page);
  if (mp4) files.push({ name: "video.mp4", mimeType: "video/mp4", buffer: mp4 });
  await page.locator('input[type="file"][multiple]').setInputFiles(files);
  await page.getByLabel("Preço do pacote (R$)").fill("49,90");
  await page.getByRole("button", { name: "Publicar pacote" }).click();
  await page.waitForURL("**/estudio/pacotes?salvo=publicado");
  const row = page.getByRole("row", { name: new RegExp(TITLE) });
  await expect(row).toContainText("Publicado");
  await expect(row).toContainText("v1");
  await expect(row).toContainText(mp4 ? "1 foto · 1 vídeo" : "1 foto");

  // Edita: vira rascunho v2 e publica como nova versão.
  await row.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByText("Alterar um pacote publicado cria uma nova versão")).toBeVisible();
  await page.getByLabel("Título").fill(TITLE_V2);
  await page.getByRole("button", { name: "Publicar nova versão" }).click();
  await page.waitForURL("**/estudio/pacotes?salvo=publicado");
  await expect(page.getByRole("row", { name: new RegExp(TITLE_V2) })).toContainText("v2");
});

test("visitante vê o pacote na vitrine, sem caminhos de mídia", async ({ page }) => {
  await page.goto("/criador_teste?aba=pacotes");
  const card = page.locator("article", { hasText: TITLE_V2 });
  await expect(card).toContainText("R$ 49,90");
  await expect(card.getByRole("button", { name: "Compra em breve" })).toBeDisabled();
  expect(await card.innerHTML()).not.toContain("post-media");
});
