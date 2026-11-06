import { AuthLayout } from "@/components/layout/AppShell";
import { signOutAction } from "@/features/identity/actions";
import { Button } from "@/components/ui";

export default function Page() {
  return (
    <AuthLayout title="Conta suspensa" subtitle="Sua conta está temporariamente indisponível.">
      <p className="type-body text-ink-muted">
        Se acredita que houve um engano, fale com o suporte para abrir um recurso.
      </p>
      <form action={signOutAction} className="mt-6">
        <Button type="submit" variant="secondary">
          Sair
        </Button>
      </form>
    </AuthLayout>
  );
}
