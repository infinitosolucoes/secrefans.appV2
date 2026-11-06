/** Cookie que registra a autodeclaração de maioridade do visitante (não é verificação de idade). */
export const AGE_COOKIE = "sf_maior18";
export const AGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const AGE_GATE_PATH = "/aviso-18";

/**
 * Caminhos acessíveis sem a confirmação: o próprio aviso, textos legais e os links
 * que chegam por e-mail (confirmação de conta e redefinição de senha).
 */
const EXEMPT_PREFIXES = [
  AGE_GATE_PATH,
  "/termos",
  "/privacidade",
  "/auth/",
  "/confirmar-email",
  "/redefinir-senha",
  "/conta-suspensa",
];

export function isAgeGateExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}
