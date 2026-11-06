import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTokensCss, type TokensFile } from "./tokens-lib";

const root = resolve(import.meta.dirname, "..");
const file = JSON.parse(readFileSync(resolve(root, "design/tokens.json"), "utf8")) as TokensFile;
const target = resolve(root, "src/styles/tokens.css");
writeFileSync(target, buildTokensCss(file));
console.log(
  `tokens.css gerado (${file.color.tokens.length} cores, ${file.color.themes.length} temas) → ${target}`,
);
