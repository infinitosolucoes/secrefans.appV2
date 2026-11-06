import type { Metadata } from "next";
import { AuthSplitLayout } from "@/components/layout/AppShell";
import { SignUpForm } from "@/features/identity/forms";

export const metadata: Metadata = { title: "Criar conta" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil } = await searchParams;
  return (
    <AuthSplitLayout mode="criar-conta" title="Crie sua conta">
      <SignUpForm defaultIntent={perfil === "criador" ? "creator" : "fan"} />
    </AuthSplitLayout>
  );
}
