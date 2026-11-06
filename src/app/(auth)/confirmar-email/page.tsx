import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/layout/AppShell";

export const metadata: Metadata = { title: "Confirme seu e-mail" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <AuthLayout title="Confirme seu e-mail" subtitle="Falta pouco.">
      <p className="type-body text-ink-muted">
        Enviamos um link de confirmação
        {email ? (
          <>
            {" "}
            para <strong className="text-ink">{email}</strong>
          </>
        ) : null}
        . Abra o e-mail e clique no link para ativar sua conta.
      </p>
      <p className="mt-4 type-caption text-ink-muted">
        Não recebeu? Verifique o spam ou tente criar a conta novamente em alguns minutos.
      </p>
      <Link
        href="/entrar"
        className="mt-6 inline-block type-label text-accent-text hover:underline"
      >
        Ir para o login
      </Link>
    </AuthLayout>
  );
}
