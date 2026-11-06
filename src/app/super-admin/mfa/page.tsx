import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/AppShell";
import { requireUser } from "@/server/auth/session";
import { MfaPanel } from "@/features/identity/MfaPanel";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function Page() {
  const user = await requireUser("/super-admin");
  if (!user.isStaff) redirect("/inicio?erro=sem-permissao");
  if (user.aal === "aal2") redirect("/super-admin");
  return (
    <AuthLayout
      title="Verificação em duas etapas"
      subtitle={
        user.hasMfaFactor
          ? "Digite o código do seu app autenticador."
          : "A área administrativa exige MFA. Configure um app autenticador (TOTP)."
      }
    >
      <MfaPanel hasFactor={user.hasMfaFactor} />
    </AuthLayout>
  );
}
