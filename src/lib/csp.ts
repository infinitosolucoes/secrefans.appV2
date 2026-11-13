/**
 * Content-Security-Policy com nonce por requisição (gerada no middleware).
 * Scripts: só os da própria aplicação que carregam o nonce ('strict-dynamic' propaga a confiança
 * para os chunks que o Next carrega). Sem 'unsafe-inline' para scripts.
 * Estilos: 'unsafe-inline' continua (atributos style do React); não executa código.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; supabaseUrl: string }) {
  const supabase = opts.supabaseUrl.replace(/\/$/, "");
  const supabaseWs = supabase.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    `media-src 'self' blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(opts.dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Nonce aleatório (128 bits) em base64, gerado com a Web Crypto (funciona no middleware). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
