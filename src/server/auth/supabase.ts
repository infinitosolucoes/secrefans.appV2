import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/** Cliente com a sessão do usuário (RLS aplicada). Usar em Server Components, Actions e Route Handlers. */
export async function createServerSupabase() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Server Components não podem gravar cookies; o middleware renova a sessão.
          }
        },
      },
    },
  );
}

/**
 * Cliente service_role: ignora RLS. Uso restrito a operações de sistema já autorizadas no servidor.
 * Nunca usar para decidir acesso de usuário nem expor o resultado sem checagem de negócio.
 */
export function createServiceSupabase() {
  const env = publicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
