import type { Metadata } from "next";
import { AuthSplitLayout } from "@/components/layout/AppShell";
import { Alert } from "@/components/ui";
import { SignInForm } from "@/features/identity/forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  return (
    <AuthSplitLayout mode="entrar" title="Bem-vindo de volta">
      {erro === "link-invalido" && (
        <Alert tone="error">Link inválido ou expirado. Entre ou solicite um novo link.</Alert>
      )}
      <SignInForm next={next} />
    </AuthSplitLayout>
  );
}
