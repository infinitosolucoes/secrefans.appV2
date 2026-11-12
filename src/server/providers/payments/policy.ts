/**
 * Regra única de quando o provedor simulado pode rodar.
 *
 * - Desenvolvimento local (NODE_ENV != production): sempre, se o provedor for "simulado".
 * - Build de produção (CI, preview da Vercel): só com ALLOW_SIMULATED_PAYMENTS=true.
 * - Deploy de produção da Vercel: bloqueado, EXCETO quando o projeto é declaradamente de
 *   homologação (APP_STAGE=hml). A produção real nunca define APP_STAGE=hml.
 */
export interface SimulatedPolicyInput {
  provider: "simulado" | "asaas";
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  allowSimulated: boolean;
  appStage: "local" | "hml" | "producao";
}

export function isSimulatedAllowed(i: SimulatedPolicyInput): boolean {
  if (i.provider !== "simulado") return false;
  if (i.appStage === "producao" && i.vercelEnv === "production") return false;
  if (i.nodeEnv !== "production") return true;
  return i.allowSimulated;
}
