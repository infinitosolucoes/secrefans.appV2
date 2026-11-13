import "server-only";

export type ReportReason =
  | "nao_consensual"
  | "menor_de_idade"
  | "violencia"
  | "assedio"
  | "spam"
  | "direitos_autorais"
  | "outro";

export type Command =
  | { kind: "start"; code: string | null }
  | { kind: "warn"; reason: string }
  | { kind: "mute"; hours: 1 | 24 | 168; reason: string }
  | { kind: "ban"; reason: string }
  | { kind: "unban" }
  | { kind: "report"; reason: ReportReason; details: string };

// Map (e não objeto literal): "constructor", "__proto__" etc. não podem virar duração.
const DURATIONS = new Map<string, 1 | 24 | 168>([
  ["1h", 1],
  ["24h", 24],
  ["7d", 168],
]);

// Remove acentos e baixa a caixa para casar apelidos.
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Apelidos aceitos no /denunciar (ordem importa: "nao consensual" antes de termos genéricos).
const REASON_ALIASES: Array<[ReportReason, RegExp]> = [
  ["nao_consensual", /^(nao[ _-]?consensual|consensual)\b/],
  ["menor_de_idade", /^(menor|menor[ _-]?de[ _-]?idade)\b/],
  ["violencia", /^violencia\b/],
  ["assedio", /^assedio\b/],
  ["spam", /^spam\b/],
  ["direitos_autorais", /^(copia|direitos|direitos[ _-]?autorais)\b/],
];

function parseReport(args: string): { reason: ReportReason; details: string } {
  const norm = normalize(args);
  for (const [reason, re] of REASON_ALIASES) {
    const m = re.exec(norm);
    if (m) {
      // NFD só remove marcas combinantes, então o comprimento do prefixo casado
      // em ASCII equivale ao do original; os detalhes vêm do texto original.
      return { reason, details: args.slice(m[0].length).trim() };
    }
  }
  return { reason: "outro", details: args.trim() };
}

export function parseCommand(text: string, botUsername: string): Command | null {
  const m = /^\/([a-zA-Z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const name = m[1] ?? "";
  const target = m[2];
  const rest = m[3];
  if (target && target.toLowerCase() !== botUsername.toLowerCase()) return null;
  const args = (rest ?? "").trim();

  switch (name.toLowerCase()) {
    case "start":
      return { kind: "start", code: args ? (args.split(/\s+/)[0] ?? null) : null };
    case "advertir":
      return { kind: "warn", reason: args };
    case "banir":
      return { kind: "ban", reason: args };
    case "desbanir":
      return { kind: "unban" };
    case "silenciar": {
      const [dur = "", ...reason] = args.split(/\s+/);
      const hours = DURATIONS.get(dur.toLowerCase());
      if (!hours) return null;
      return { kind: "mute", hours, reason: reason.join(" ").trim() };
    }
    case "denunciar":
      return { kind: "report", ...parseReport(args) };
    default:
      return null;
  }
}
