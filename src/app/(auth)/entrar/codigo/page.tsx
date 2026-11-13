import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/AppShell";
import { getSessionUser } from "@/server/auth/session";
import { MfaPanel } from "@/features/identity/MfaPanel";
import { safeNextPath } from "@/features/identity/schemas";
import { signOutAction } from "@/features/identity/actions";

export const metadata: Metadata = { title: "Código de verificação" };

/** Segunda etapa do login para quem ativou a verificação em duas etapas. */
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNextPath(next);
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(target)}`);
  if (!user.hasMfaFactor || user.aal === "aal2") redirect(target);
  return (
    <AuthLayout
      title="Verificação em duas etapas"
      subtitle="Digite o código de 6 dígitos do seu app autenticador."
    >
      <MfaPanel hasFactor next={target} />
      <form action={signOutAction} className="mt-4 text-center">
        <button type="submit" className="type-caption text-ink-muted underline">
          Sair e entrar com outra conta
        </button>
      </form>
    </AuthLayout>
  );
}
