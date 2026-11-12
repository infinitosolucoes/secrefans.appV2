import "server-only";

export interface Escalation {
  warnings: number;
  mute: boolean;
}

// Soma uma advertência; ao atingir o limite, zera o contador e manda silenciar.
export function escalate(currentWarnings: number, warnLimit: number): Escalation {
  const next = currentWarnings + 1;
  if (next >= warnLimit) return { warnings: 0, mute: true };
  return { warnings: next, mute: false };
}
