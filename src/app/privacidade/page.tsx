import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/AppShell";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function Page() {
  return (
    <AuthLayout title="Política de privacidade">
      <p className="type-body text-ink-muted">
        Documento em elaboração pela equipe jurídica (pendência de go-live, spec §14).
      </p>
    </AuthLayout>
  );
}
