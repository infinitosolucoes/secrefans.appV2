// Registra (ou atualiza) o webhook de cobranças do Asaas apontando para a Secretfans.
// Uso: node scripts/asaas-register-webhook.mjs <arquivo .env> <url-base>
//   ex.: node scripts/asaas-register-webhook.mjs .env.hml.local https://secretfans-hml.vercel.app
// Lê ASAAS_API_KEY, ASAAS_ENV e ASAAS_WEBHOOK_TOKEN do arquivo; nada é impresso além do resultado.
import { readFileSync } from "node:fs";

const [envFile = ".env.hml.local", baseUrl = "https://secretfans-hml.vercel.app"] = process.argv.slice(2);
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const k of ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"]) {
  if (!env[k]) throw new Error(`${k} ausente em ${envFile}`);
}
const api =
  env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
const headers = { access_token: env.ASAAS_API_KEY, "Content-Type": "application/json", "User-Agent": "secretfans" };
const url = `${baseUrl.replace(/\/$/, "")}/api/webhooks/asaas`;

const body = {
  name: "Secretfans - cobrancas e saques",
  url,
  email: "nao-responda@secretfans.app.br",
  enabled: true,
  interrupted: false,
  apiVersion: 3,
  authToken: env.ASAAS_WEBHOOK_TOKEN,
  sendType: "SEQUENTIALLY",
  events: [
    "PAYMENT_CREATED",
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_OVERDUE",
    "PAYMENT_DELETED",
    "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
    "PAYMENT_CHARGEBACK_DISPUTE",
    "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
    "TRANSFER_CREATED",
    "TRANSFER_PENDING",
    "TRANSFER_IN_BANK_PROCESSING",
    "TRANSFER_BLOCKED",
    "TRANSFER_DONE",
    "TRANSFER_FAILED",
    "TRANSFER_CANCELLED",
  ],
};

const list = await fetch(`${api}/webhooks`, { headers }).then((r) => r.json());
const existing = (list.data ?? []).find((w) => w.url === url);
const res = await fetch(existing ? `${api}/webhooks/${existing.id}` : `${api}/webhooks`, {
  method: existing ? "PUT" : "POST",
  headers,
  body: JSON.stringify(body),
});
const data = await res.json();
if (!res.ok) {
  console.error(`Falhou (${res.status}):`, JSON.stringify(data.errors ?? data));
  process.exit(1);
}
console.log(`${existing ? "Atualizado" : "Criado"}: ${data.id} → ${data.url} (habilitado: ${data.enabled})`);
