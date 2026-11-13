"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { browserSupabase } from "@/lib/supabase-browser";

/** Desativa o autenticador (o Supabase exige sessão já verificada com o código, aal2). */
export function MfaDisable() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function disable() {
    if (!window.confirm("Desativar a verificação em duas etapas? Sua conta fica menos protegida."))
      return;
    setPending(true);
    setError(null);
    const supabase = browserSupabase();
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all ?? []) {
      const { error: e } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (e) {
        setPending(false);
        return setError(
          "Não foi possível desativar. Entre de novo com o código e tente outra vez.",
        );
      }
    }
    await supabase.auth.refreshSession();
    setPending(false);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={disable}
        className="self-start"
      >
        Desativar verificação em duas etapas
      </Button>
    </div>
  );
}
