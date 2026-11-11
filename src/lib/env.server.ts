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
});

export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || undefined,
    ALLOW_SIMULATED_PAYMENTS: process.env.ALLOW_SIMULATED_PAYMENTS || undefined,
    SIMULATED_WEBHOOK_SECRET: process.env.SIMULATED_WEBHOOK_SECRET || undefined,
  });
}
