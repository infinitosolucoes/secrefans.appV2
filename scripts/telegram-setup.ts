// Registra o webhook do bot de moderação do Telegram e os comandos.
// Uso: npx tsx scripts/telegram-setup.ts
// Lê TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME, TELEGRAM_GROUP_ID e
// NEXT_PUBLIC_SITE_URL do ambiente (carrega .env.local se existir). Nunca imprime o token.
// Não importa módulos `server-only`: roda fora do Next.

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // sem .env.local: usa só o ambiente
}

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_GROUP_ID",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
if (missing.length > 0) {
  console.error(`Variáveis ausentes: ${missing.join(", ")}`);
  console.error("Veja docs/runbooks/telegram-bot.md.");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN!.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET!.trim();
const site = process.env.NEXT_PUBLIC_SITE_URL!.trim().replace(/\/+$/, "");

if (!site.startsWith("https://")) {
  console.error(
    `O Telegram só aceita webhook em https. NEXT_PUBLIC_SITE_URL atual: ${site}. ` +
      "Use a URL da Vercel (https://...vercel.app) ao rodar o script.",
  );
  process.exit(1);
}

type TgResponse = { ok: boolean; description?: string; result?: unknown };

async function call(method: string, body?: Record<string, unknown>): Promise<TgResponse> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json()) as TgResponse;
    console.log(`${method}: ok=${json.ok}${json.description ? ` (${json.description})` : ""}`);
    return json;
  } catch {
    console.log(`${method}: falha de rede`);
    return { ok: false, description: "falha de rede" };
  }
}

const memberCommands = [
  { command: "start", description: "Vincular sua conta" },
  { command: "denunciar", description: "Denunciar uma mensagem (responda a ela)" },
];
const adminCommands = [
  ...memberCommands,
  { command: "advertir", description: "Advertir o autor da mensagem" },
  { command: "silenciar", description: "Silenciar o autor da mensagem" },
  { command: "banir", description: "Banir o autor da mensagem" },
  { command: "desbanir", description: "Desbanir um usuário" },
];

async function main() {
  const results = [
    await call("setWebhook", {
      url: `${site}/api/webhooks/telegram`,
      secret_token: secret,
      allowed_updates: ["message", "chat_join_request", "chat_member"],
      drop_pending_updates: true,
    }),
    await call("setMyCommands", { commands: memberCommands, scope: { type: "default" } }),
    await call("setMyCommands", {
      commands: adminCommands,
      scope: { type: "all_chat_administrators" },
    }),
  ];

  const info = await call("getWebhookInfo");
  const r = (info.result ?? {}) as Record<string, unknown>;
  console.log({
    url: r.url,
    pending_update_count: r.pending_update_count,
    last_error_message: r.last_error_message,
    allowed_updates: r.allowed_updates,
  });

  if (results.some((x) => !x.ok) || !info.ok) process.exit(1);
}

main().catch(() => {
  console.error("Falha inesperada ao configurar o bot.");
  process.exit(1);
});
