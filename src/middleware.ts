import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AGE_COOKIE, AGE_GATE_PATH, isAgeGateExempt } from "@/features/age-gate/constants";

const PROTECTED_PREFIXES = [
  "/inicio",
  "/assinaturas",
  "/biblioteca",
  "/checkout",
  "/pedido",
  "/carteira",
  "/mensagens",
  "/notificacoes",
  "/conta",
  "/estudio",
  "/super-admin",
];

const isProtected = (path: string) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Renova a sessão (cookies) e faz o primeiro filtro de rotas. A autorização definitiva
 * (papéis, MFA) é repetida no servidor (requireUser/requireStaffMfa) e no banco (RLS).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = target.split("?");
    url.pathname = pathname ?? "/";
    url.search = query ? `?${query}` : "";
    const res = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  // Visitante sem a autodeclaração de maioridade vê o aviso +18 antes de qualquer página.
  if (!user && !request.cookies.has(AGE_COOKIE) && !isAgeGateExempt(path)) {
    const next = path + request.nextUrl.search;
    return redirectTo(`${AGE_GATE_PATH}?next=${encodeURIComponent(next)}`);
  }

  // A landing é para visitantes; quem já entrou vai direto para o início.
  if (user && (path === "/" || path === AGE_GATE_PATH)) {
    return redirectTo("/inicio");
  }

  if (!user && isProtected(path)) {
    // Mantém a query (ex.: /checkout?tipo=ppv&id=…) para voltar ao mesmo item depois do login.
    return redirectTo(`/entrar?next=${encodeURIComponent(path + request.nextUrl.search)}`);
  }

  if (user && path.startsWith("/super-admin") && path !== "/super-admin/mfa") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") return redirectTo("/super-admin/mfa");
  }

  if (user && (path === "/entrar" || path === "/criar-conta")) {
    return redirectTo("/inicio");
  }

  return response;
}

export const config = {
  // Webhooks e cron são chamados por serviços (sem sessão nem cookie +18); autenticam por token.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|brand/|api/webhooks/|api/cron/).*)",
  ],
};
