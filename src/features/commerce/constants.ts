export type OrderKind = "subscription" | "ppv" | "package" | "tip" | "message";
export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "chargeback";

export const CHECKOUT_KINDS = {
  ppv: "ppv",
  pacote: "package",
  assinatura: "subscription",
  mimo: "tip",
  mensagem: "message",
  /** Nome antigo do mimo: mantido para links já compartilhados. */
  gorjeta: "tip",
} as const satisfies Record<string, OrderKind>;

export type CheckoutSlug = keyof typeof CHECKOUT_KINDS;

export const checkoutHref = (slug: CheckoutSlug, id: string) => `/checkout?tipo=${slug}&id=${id}`;

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  subscription: "Assinatura",
  ppv: "PPV",
  package: "Pacote",
  tip: "Mimo",
  message: "Mensagem paga",
};

export const ORDER_STATUS: Record<
  OrderStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
  pending: { label: "Aguardando pagamento", tone: "warning" },
  paid: { label: "Confirmado", tone: "success" },
  failed: { label: "Recusado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  refunded: { label: "Estornado", tone: "neutral" },
  chargeback: { label: "Contestado", tone: "danger" },
};

export const TIP_OPTIONS = [500, 1000, 2000, 5000];
export const SUBSCRIPTION_PRICE_MIN = 5;
export const SUBSCRIPTION_PRICE_MAX = 1000;

export const formatPercent = (bps: number) =>
  `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export const WITHDRAWAL_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
  requested: { label: "Aguardando aprovação", tone: "warning" },
  processing: { label: "Enviando Pix", tone: "warning" },
  paid: { label: "Pago", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  failed: { label: "Falhou", tone: "danger" },
  canceled: { label: "Cancelado", tone: "neutral" },
};

export const PERIOD_LABEL: Record<number, string> = {
  1: "Mensal",
  3: "3 meses",
  6: "6 meses",
  12: "12 meses",
};

export const percentOff = (bps: number) => `${Math.round(bps / 100)}% off`;
