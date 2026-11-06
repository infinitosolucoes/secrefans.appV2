import type { Metadata } from "next";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Configurações · Admin" };

export default async function Page() {
  await requireStaffMfa("settings.read");
  const supabase = await createServerSupabase();
  const [settings, flags] = await Promise.all([
    supabase.from("platform_settings").select("key, value, description, updated_at").order("key"),
    supabase.from("feature_flags").select("key, enabled, description, updated_at").order("key"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Configurações"
        description="Somente leitura nesta versão. Edição com aprovação e auditoria chega com as regras de comissão (S4)."
      />
      {(settings.error || flags.error) && (
        <Alert tone="error">Não foi possível carregar as configurações.</Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Parâmetros</CardTitle>
          <ul className="mt-3 flex flex-col gap-3">
            {(settings.data ?? []).map((s) => (
              <li key={s.key}>
                <div className="flex items-center justify-between gap-2">
                  <code className="type-label text-accent-text">{s.key}</code>
                  <code className="type-label text-ink">{JSON.stringify(s.value)}</code>
                </div>
                <p className="type-caption text-ink-muted">{s.description}</p>
                <p className="type-caption text-ink-muted">
                  Atualizado {formatDateTime(s.updated_at)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Feature flags</CardTitle>
          <ul className="mt-3 flex flex-col gap-3">
            {(flags.data ?? []).map((f) => (
              <li key={f.key}>
                <div className="flex items-center justify-between gap-2">
                  <code className="type-label text-accent-text">{f.key}</code>
                  <Badge tone={f.enabled ? "success" : "neutral"}>
                    {f.enabled ? "Ligada" : "Desligada"}
                  </Badge>
                </div>
                <p className="type-caption text-ink-muted">{f.description}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
