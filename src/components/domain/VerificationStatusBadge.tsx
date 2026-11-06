import { Badge, type BadgeTone } from "@/components/ui";
import type { Database } from "@/types/database";

type Status = Database["public"]["Enums"]["verification_status"];

const MAP: Record<Status, { label: string; tone: BadgeTone }> = {
  pending: { label: "Em análise", tone: "warning" },
  approved: { label: "Aprovada", tone: "success" },
  rejected: { label: "Rejeitada", tone: "danger" },
  suspended: { label: "Suspensa", tone: "danger" },
};

export function VerificationStatusBadge({ status }: { status: Status }) {
  const { label, tone } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
