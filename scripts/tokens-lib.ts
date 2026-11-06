/**
 * Converte design/tokens.json (formato do design system Secretfans) em CSS.
 * Mantido puro para ser testável (tests/unit/tokens.test.ts).
 */
export type ThemedValue = string | Record<string, string>;
export interface ColorToken {
  name: string;
  value: ThemedValue;
  usage?: string;
}
export interface TypeStyle {
  name: string;
  family?: string;
  fontSize: string;
  lineHeight: string | number;
  fontWeight: number | string;
  fontStyle?: string;
  letterSpacing?: string;
}
export interface TokensFile {
  name: string;
  color: { themes: Array<{ id: string; name: string }>; tokens: ColorToken[] };
  type: {
    families: Record<string, string>;
    groups: Array<{ name: string; family: string; styles: TypeStyle[] }>;
  };
  spacing?: { tokens: Array<{ name: string; value: string }> };
  radius?: { tokens: Array<{ name: string; value: string }> };
  shadow?: { tokens: Array<{ name: string; value: string }> };
}

const ALIAS = /^\{([A-Za-z0-9_.-]+)\}$/;

export function resolveColor(
  tokens: TokensFile["color"],
  themeId: string,
  name: string,
  seen: string[] = [],
): string {
  if (seen.includes(name)) throw new Error(`Alias circular: ${[...seen, name].join(" -> ")}`);
  const token = tokens.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`Token de cor inexistente: ${name}`);
  const firstTheme = tokens.themes[0]?.id;
  const raw =
    typeof token.value === "string"
      ? token.value
      : (token.value[themeId] ?? (firstTheme ? token.value[firstTheme] : undefined));
  if (!raw) throw new Error(`Token ${name} sem valor para o tema ${themeId}`);
  const alias = ALIAS.exec(raw);
  return alias?.[1] ? resolveColor(tokens, themeId, alias[1], [...seen, name]) : raw;
}

export function buildTokensCss(file: TokensFile): string {
  const out: string[] = [
    `/* ${file.name} — gerado de design/tokens.json por scripts/build-tokens.ts. Não editar. */`,
    "",
  ];
  const [defaultTheme, ...otherThemes] = file.color.themes;
  if (!defaultTheme) throw new Error("tokens.json sem temas");

  const themeBlock = (selector: string, themeId: string) => {
    out.push(`${selector} {`);
    out.push(`  color-scheme: ${themeId === "light" ? "light" : "dark"};`);
    for (const t of file.color.tokens)
      out.push(`  --${t.name}: ${resolveColor(file.color, themeId, t.name)};`);
    if (themeId === defaultTheme.id) {
      for (const t of file.spacing?.tokens ?? []) out.push(`  --${t.name}: ${t.value};`);
      for (const t of file.radius?.tokens ?? []) out.push(`  --${t.name}: ${t.value};`);
      for (const t of file.shadow?.tokens ?? []) out.push(`  --${t.name}: ${t.value};`);
    }
    out.push("}", "");
  };

  themeBlock(":root", defaultTheme.id);
  for (const theme of otherThemes) themeBlock(`[data-theme="${theme.id}"]`, theme.id);

  // Mapeamento para utilitários do Tailwind v4 (bg-surface, text-ink, rounded-md, shadow-glow-lg…).
  out.push("@theme inline {");
  for (const t of file.color.tokens) out.push(`  --color-${t.name}: var(--${t.name});`);
  // Raios e sombras não variam por tema: valor direto evita auto-referência (--radius-sm: var(--radius-sm)).
  for (const t of file.radius?.tokens ?? [])
    out.push(`  --radius-${t.name.replace(/^radius-/, "")}: ${t.value};`);
  for (const t of file.shadow?.tokens ?? []) out.push(`  --shadow-${t.name}: ${t.value};`);
  for (const [family, stack] of Object.entries(file.type.families))
    out.push(`  --font-ds-${family}: ${stack};`);
  out.push("}", "");

  // Estilos tipográficos como utilitários: type-hero, type-body, type-label…
  for (const group of file.type.groups) {
    for (const s of group.styles) {
      const family = s.family ?? group.family;
      out.push(`@utility type-${s.name} {`);
      out.push(`  font-family: var(--font-${family === "sans" ? "sans" : `ds-${family}`});`);
      out.push(`  font-size: ${s.fontSize};`);
      out.push(`  line-height: ${s.lineHeight};`);
      out.push(`  font-weight: ${s.fontWeight};`);
      if (s.fontStyle) out.push(`  font-style: ${s.fontStyle};`);
      if (s.letterSpacing) out.push(`  letter-spacing: ${s.letterSpacing};`);
      if (s.name === "tagline" || s.name === "hero-italic" || s.name.startsWith("lettering"))
        out.push("  text-transform: uppercase;");
      out.push("}", "");
    }
  }
  return out.join("\n");
}
