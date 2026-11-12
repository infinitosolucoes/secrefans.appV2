import { describe, expect, it } from "vitest";
import {
  isSimulatedAllowed,
  type SimulatedPolicyInput,
} from "@/server/providers/payments/policy";

const base: SimulatedPolicyInput = {
  provider: "simulado",
  nodeEnv: "production",
  vercelEnv: undefined,
  allowSimulated: false,
  appStage: "producao",
};

describe("isSimulatedAllowed", () => {
  it("libera no desenvolvimento local", () => {
    expect(isSimulatedAllowed({ ...base, nodeEnv: "development" })).toBe(true);
  });

  it("build de produção (CI) só com a flag explícita", () => {
    expect(isSimulatedAllowed(base)).toBe(false);
    expect(isSimulatedAllowed({ ...base, allowSimulated: true })).toBe(true);
  });

  it("preview da Vercel com a flag", () => {
    expect(isSimulatedAllowed({ ...base, vercelEnv: "preview", allowSimulated: true })).toBe(true);
  });

  it("bloqueia a produção real mesmo com a flag ligada", () => {
    expect(
      isSimulatedAllowed({ ...base, vercelEnv: "production", allowSimulated: true }),
    ).toBe(false);
  });

  it("libera o deploy de produção do projeto de homologação (APP_STAGE=hml + flag)", () => {
    const hml = { ...base, vercelEnv: "production", appStage: "hml" as const };
    expect(isSimulatedAllowed(hml)).toBe(false);
    expect(isSimulatedAllowed({ ...hml, allowSimulated: true })).toBe(true);
  });

  it("nunca libera quando o provedor é o Asaas", () => {
    expect(
      isSimulatedAllowed({ ...base, provider: "asaas", nodeEnv: "development", appStage: "hml" }),
    ).toBe(false);
  });
});
