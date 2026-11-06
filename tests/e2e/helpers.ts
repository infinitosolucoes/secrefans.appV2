import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TOTP } from "otpauth";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const PASSWORD = "Secret-Teste-2026";
/** Segredo TOTP do seed local (supabase/seed.sql). Somente ambiente local. */
export const SEED_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export const USERS = {
  fan: { id: "00000000-0000-4000-a000-000000000001", email: "fa@secretfans.test" },
  creator: { id: "00000000-0000-4000-a000-000000000002", email: "criador@secretfans.test" },
  moderator: { id: "00000000-0000-4000-a000-000000000003", email: "moderador@secretfans.test" },
  admin: { id: "00000000-0000-4000-a000-000000000004", email: "admin@secretfans.test" },
} as const;

/** Cliente service_role do Supabase LOCAL, usado só para preparar dados de teste. */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente (copie de `npx supabase status`).");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(inicio|estudio|super-admin)/);
}

export async function passMfa(page: Page) {
  await page.goto("/super-admin");
  await page.waitForURL("**/super-admin/mfa");
  const code = new TOTP({ secret: SEED_TOTP_SECRET }).generate();
  await page.getByLabel("Código de 6 dígitos").fill(code);
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.waitForURL(/\/super-admin$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
}

interface MailpitSummary {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

/** Espera o e-mail mais recente para o destinatário e devolve o primeiro link de verificação. */
export async function confirmationLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await res.json()) as { messages: MailpitSummary[] };
    const msg = body.messages?.[0];
    if (msg) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const match = (full.HTML || full.Text).match(
        /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/,
      );
      if (match) return match[0].replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`E-mail para ${to} não chegou ao Mailpit`);
}

/** PNG 1x1 válido para uploads de teste. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
