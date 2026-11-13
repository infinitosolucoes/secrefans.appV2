"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field } from "@/components/ui";
import { browserSupabase } from "@/lib/supabase-browser";

type Enrollment = { factorId: string; qr: string; secret: string };

/**
 * Cadastro (QR + código) ou desafio do autenticador TOTP. Depois de verificar, vai para `next`.
 * Usado pela equipe (/super-admin/mfa), no login de quem ativou o MFA e em Conta → Segurança.
 */
export function MfaPanel({
  hasFactor,
  next = "/super-admin",
}: {
  hasFactor: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = browserSupabase();
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return setError("Não foi possível carregar seus fatores de MFA.");
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setFactorId(verified.id);
      // Remove cadastros incompletos antes de iniciar um novo.
      for (const f of data.all.filter((f) => f.status === "unverified"))
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Secretfans ${new Date().toISOString()}`,
      });
      if (enrollError) return setError("Não foi possível iniciar o cadastro do autenticador.");
      setFactorId(enrolled.id);
      setEnrollment({
        factorId: enrolled.id,
        qr: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      });
    })();
  }, [hasFactor]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return setError("O código tem 6 dígitos.");
    setPending(true);
    setError(null);
    const { error: verifyError } = await browserSupabase().auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    setPending(false);
    if (verifyError) return setError("Código inválido ou expirado. Tente novamente.");
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      {enrollment && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URL gerado pelo Supabase */}
          <img
            src={enrollment.qr}
            alt="QR code para o app autenticador"
            width={180}
            height={180}
            className="rounded-sm bg-white p-2"
          />
          <p className="text-center type-caption text-ink-muted">
            Escaneie com Google Authenticator, 1Password ou similar. Ou digite a chave:
            <code className="mt-1 block break-all text-ink">{enrollment.secret}</code>
          </p>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          name="code"
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          disabled={!factorId}
        />
        <Button type="submit" loading={pending} disabled={!factorId} fullWidth>
          Verificar
        </Button>
      </form>
    </div>
  );
}
