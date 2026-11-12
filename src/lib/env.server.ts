import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** "simulado" (desenvolvimento/homologação) ou "asaas" (S5, depende de aprovação formal). */
  PAYMENT_PROVIDER: z.enum(["simulado", "asaas"]).default("simulado"),
  /** Liga o provedor simulado fora de NODE_ENV=development (ex.: homologação). Nunca em produção. */
  ALLOW_SIMULATED_PAYMENTS: z.enum(["true", "false"]).default("false"),
  /** Segredo HMAC do webhook simulado. */
  SIMULATED_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Estágio do deploy. "hml" marca o projeto de homologação, onde o deploy de produção da
   * Vercel pode usar o pagamento simulado. A produção real fica com "producao" (padrão).
   */
  APP_STAGE: z.enum(["local", "hml", "producao"]).default("producao"),
  /** Asaas (S5). A chave fica só no servidor; sandbox e produção têm chaves diferentes. */
  ASAAS_API_KEY: z.string().min(20).optional(),
  ASAAS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  /** Token que o Asaas envia no header asaas-access-token dos webhooks. */
  ASAAS_WEBHOOK_TOKEN: z.string().min(32).optional(),
  /** Segredo do cron de conciliação (a Vercel envia como Bearer). */
  CRON_SECRET: z.string().min(16).optional(),
  /** E-mails de notificação (Resend). Sem a chave, as notificações ficam só no site. */
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().min(5).default("Secretfans <nao-responda@secretfans.app.br>"),
});

export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || undefined,
    ALLOW_SIMULATED_PAYMENTS: process.env.ALLOW_SIMULATED_PAYMENTS || undefined,
    SIMULATED_WEBHOOK_SECRET: process.env.SIMULATED_WEBHOOK_SECRET || undefined,
    APP_STAGE: process.env.APP_STAGE || undefined,
    ASAAS_API_KEY: process.env.ASAAS_API_KEY || undefined,
    ASAAS_ENV: process.env.ASAAS_ENV || undefined,
    ASAAS_WEBHOOK_TOKEN: process.env.ASAAS_WEBHOOK_TOKEN || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  });
}
