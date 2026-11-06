import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/AppShell";
import { ForgotForm } from "@/features/identity/forms";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function Page() {
  return (
    <AuthLayout
      title="Esqueci minha senha"
      subtitle="Enviaremos um link para você criar uma nova senha."
    >
      <ForgotForm />
    </AuthLayout>
  );
}
