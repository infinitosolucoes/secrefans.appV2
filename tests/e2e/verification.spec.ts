import { expect, test } from "@playwright/test";
import { TINY_PNG, USERS, login, passMfa, serviceClient } from "./helpers";

test.beforeAll(async () => {
  // Estado limpo para o criador do seed (somente banco local).
  const admin = serviceClient();
  await admin.from("creator_verifications").delete().eq("user_id", USERS.creator.id);
  await admin.from("user_roles").delete().eq("user_id", USERS.creator.id).eq("role", "creator");
});

test("criador envia verificação → moderador com MFA aprova → papel creator", async ({
  browser,
}) => {
  // 1. Criador envia documentos
  const creatorCtx = await browser.newContext();
  const creator = await creatorCtx.newPage();
  await login(creator, USERS.creator.email);
  await creator.goto("/estudio/verificacao");
  await creator.getByLabel("Nome completo (como no documento)").fill("Criador Teste da Silva");
  await creator.getByLabel("Data de nascimento").fill("1995-05-20");
  const png = { name: "doc.png", mimeType: "image/png", buffer: TINY_PNG };
  await creator.getByLabel(/Documento com foto/).setInputFiles(png);
  await creator.getByLabel(/Selfie segurando/).setInputFiles({ ...png, name: "selfie.png" });
  await creator.getByLabel(/titular dos direitos/).check();
  await creator.getByLabel(/pessoas retratadas/).check();
  await creator.getByRole("button", { name: "Enviar para verificação" }).click();
  await expect(creator.getByText("Em análise")).toBeVisible();

  // 2. Moderador sem MFA é barrado; com MFA aprova
  const modCtx = await browser.newContext();
  const mod = await modCtx.newPage();
  await login(mod, USERS.moderator.email);
  await mod.goto("/super-admin/verificacoes");
  await mod.waitForURL(/\/(super-admin\/mfa|entrar\/codigo)/);
  await passMfa(mod);
  await mod.goto("/super-admin/verificacoes");
  await mod.getByRole("link", { name: /Criador Teste da Silva/ }).click();
  await mod.getByLabel(/Motivo/).fill("Documentos e selfie conferidos");
  await mod.getByRole("button", { name: "Aprovar" }).click();
  await expect(mod.getByText("Verificação aprovada.")).toBeVisible();

  // 3. Moderador não tem audit.read: o painel nega; a decisão ficou registrada na auditoria.
  await mod.goto("/super-admin/auditoria");
  await mod.waitForURL(/\/super-admin\?erro=sem-permissao/);
  const { data: audit } = await serviceClient()
    .from("admin_audit_logs")
    .select("action, actor_id, reason")
    .eq("action", "verification.approved")
    .eq("actor_id", USERS.moderator.id)
    .order("created_at", { ascending: false })
    .limit(1);
  expect(audit?.[0]?.reason).toBe("Documentos e selfie conferidos");

  // 4. Criador vê aprovação e o Studio liberado para publicar (papel creator)
  await creator.goto("/estudio/verificacao");
  await expect(creator.getByText("Aprovada")).toBeVisible();
  await creator.goto("/estudio");
  await expect(creator.getByRole("link", { name: "Nova publicação" })).toBeVisible();

  await creatorCtx.close();
  await modCtx.close();
});
