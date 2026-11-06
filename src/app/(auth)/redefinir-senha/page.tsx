import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/AppShell";
import { ResetForm } from "@/features/identity/forms";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Nova senha" };

export default async function Page() {
  // A sessão de recuperação é criada em /auth/callback.
  if (!(await getSessionUser())) redirect("/esqueci-senha");
  return (
    <AuthLayout title="Criar nova senha">
      <ResetForm />
    </AuthLayout>
  );
}
