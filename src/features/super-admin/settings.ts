/** Configurações que o Super Admin pode editar (mesmas faixas da RPC update_platform_setting). */
export const EDITABLE_SETTINGS = {
  payout_min_cents: { label: "Saque mínimo", unit: "brl", min: 100, max: 1000000 },
  payout_hold_days_pix: {
    label: "Liberação de vendas no Pix (dias)",
    unit: "days",
    min: 0,
    max: 90,
  },
  payout_hold_days_card: {
    label: "Liberação de vendas no cartão (dias)",
    unit: "days",
    min: 0,
    max: 90,
  },
  creator_min_age: { label: "Idade mínima do criador (anos)", unit: "years", min: 18, max: 99 },
} as const;

export type EditableSettingKey = keyof typeof EDITABLE_SETTINGS;

export const isEditableSetting = (k: string): k is EditableSettingKey => k in EDITABLE_SETTINGS;
