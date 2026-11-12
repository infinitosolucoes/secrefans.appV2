import { z } from "zod";

// Fica fora de telegram-actions.ts: arquivos "use server" só podem exportar funções assíncronas.

const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const text = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${label}.`)
    .max(2000, `${label[0]!.toUpperCase()}${label.slice(1)}: máximo de 2000 caracteres.`);

const int = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label}: informe um número.` })
    .int(`${label}: use um número inteiro.`)
    .min(min, `${label}: mínimo ${min}.`)
    .max(max, `${label}: máximo ${max}.`);

export const telegramSettingsSchema = z.object({
  rulesText: text("as regras"),
  welcomeText: text("a mensagem de boas-vindas"),
  // Textarea com um domínio por linha.
  allowedDomains: z
    .string()
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().regex(DOMAIN, "Domínio inválido (ex.: secretfans.app.br)."))
        .min(1, "Informe ao menos um domínio permitido.")
        .max(50, "Máximo de 50 domínios."),
    ),
  warnLimit: int("Advertências até silenciar", 1, 10),
  autoMuteHours: int("Horas de silêncio automático", 1, 168),
  floodRepeatLimit: int("Repetições para flood", 2, 20),
  floodWindowSeconds: int("Janela de flood (segundos)", 10, 600),
});

export type TelegramSettingsInput = z.infer<typeof telegramSettingsSchema>;
