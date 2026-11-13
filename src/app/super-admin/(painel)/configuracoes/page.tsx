import type { Metadata } from "next";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { hasPermission } from "@/server/authorization/roles";
import { requireStaffMfa } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { formatBRL } from "@/features/content/constants";
import { SettingForm } from "@/features/super-admin/SettingForm";
import { EDITABLE_SETTINGS, isEditableSetting } from "@/features/super-admin/settings";

export const metadata: Metadata = { title: "Configurações · Admin" };

export default async function Page() {
  const user = await requireStaffMfa("settings.read");
  const canManage = hasPermission(user.roles, "settings.manage");
  const supabase = await createServerSupabase();
  const [settings, flags] = await Promise.all([
    supabase.from("platform_settings").select("key, value, description, updated_at").order("key"),
    supabase.from("feature_flags").select("key, enabled, description, updated_at").order("key"),
  ]);
  const editable = (settings.data ?? []).filter((s) => isEditableSetting(s.key));
  const fixed = (settings.data ?? []).filter((s) => !isEditableSetting(s.key));

  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Configurações"
        description="Cada mudança exige motivo e fica registrada na auditoria. Comissão e taxas são alteradas nas telas Comissões e Financeiro."
      />
      {(settings.error || flags.error) && (
        <Alert tone="error">Não foi possível carregar as configurações.</Alert>
      )}
      <div className="flex max-w-3xl flex-col gap-4">
        {editable.map((s) => {
          const key = s.key as keyof typeof EDITABLE_SETTINGS;
          const def = EDITABLE_SETTINGS[key];
          const value = Number(s.value);
          return (
            <Card key={s.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle>{def.label}</CardTitle>
                <span className="text-lg font-bold text-accent-text">
                  {def.unit === "brl" ? formatBRL(value) : value}
                </span>
              </div>
              <p className="mt-1 type-caption text-ink-muted">
                {s.description} · Atualizado {formatDateTime(s.updated_at)}
              </p>
              {canManage && (
                <div className="mt-4">
                  <SettingForm settingKey={key} value={value} />
                </div>
              )}
            </Card>
          );
        })}

        <Card>
          <CardTitle>Parâmetros fixos</CardTitle>
          <ul className="mt-3 flex flex-col gap-3">
            {fixed.map((s) => (
              <li key={s.key}>
                <div className="flex items-center justify-between gap-2">
                  <code className="type-label text-accent-text">{s.key}</code>
                  <code className="type-label text-ink">{JSON.stringify(s.value)}</code>
                </div>
                <p className="type-caption text-ink-muted">{s.description}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Feature flags</CardTitle>
          <p className="mt-1 type-caption text-ink-muted">
            Somente leitura: ainda não controlam o site.
          </p>
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
