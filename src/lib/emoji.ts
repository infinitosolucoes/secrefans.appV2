/** Emojis mais usados em comentários e conversas (sem biblioteca externa: leve e sem rede). */
export const EMOJIS = [
  "😍",
  "🔥",
  "😘",
  "🥰",
  "😂",
  "🤣",
  "😊",
  "😉",
  "😏",
  "🤤",
  "😮",
  "😳",
  "🥵",
  "😈",
  "👀",
  "🙈",
  "❤️",
  "🩷",
  "💖",
  "💕",
  "💋",
  "💯",
  "✨",
  "⭐",
  "👏",
  "🙌",
  "👍",
  "🙏",
  "💪",
  "👑",
  "💎",
  "🌹",
  "🍑",
  "🍒",
  "🍓",
  "🥂",
  "🎉",
  "😢",
  "😭",
  "🤔",
] as const;

/** Insere o texto na posição do cursor de um textarea/input e devolve o novo valor e cursor. */
export function insertAt(value: string, text: string, start: number, end: number) {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  return { value: value.slice(0, s) + text + value.slice(e), cursor: s + text.length };
}
