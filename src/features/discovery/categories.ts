import {
  Coffee,
  Dumbbell,
  Flame,
  Heart,
  LayoutGrid,
  PenTool,
  Plane,
  Radio,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";

/** Categorias da home do DS (tiles 115×58). Lista provisória até a política de conteúdo ser aprovada. */
export const CATEGORIES: Array<{ slug: string; label: string; icon: LucideIcon }> = [
  { slug: "todos", label: "Todos", icon: LayoutGrid },
  { slug: "sensual", label: "Sensual", icon: Flame },
  { slug: "fitness", label: "Fitness", icon: Dumbbell },
  { slug: "lifestyle", label: "Lifestyle", icon: Coffee },
  { slug: "cosplay", label: "Cosplay", icon: VenetianMask },
  { slug: "tattoo", label: "Tattoo", icon: PenTool },
  { slug: "lingerie", label: "Lingerie", icon: Heart },
  { slug: "viagens", label: "Viagens", icon: Plane },
  { slug: "ao-vivo", label: "Conteúdo ao vivo", icon: Radio },
];

/** Tipo de perfil do criador (quem aparece no conteúdo). Filtro do Explorar. */
export const CREATOR_TYPES = [
  { slug: "mulher", label: "Mulher" },
  { slug: "homem", label: "Homem" },
  { slug: "casal", label: "Casal" },
  { slug: "trans", label: "Trans" },
  { slug: "nao_binario", label: "Não binário" },
] as const;

export type CreatorType = (typeof CREATOR_TYPES)[number]["slug"];

export const creatorTypeLabel = (slug: string | null | undefined) =>
  CREATOR_TYPES.find((t) => t.slug === slug)?.label ?? null;

/** Monta /explorar mantendo os filtros (categoria e tipo) que não mudaram. */
export function explorarHref(filters: { categoria?: string; tipo?: string; q?: string }) {
  const params = new URLSearchParams();
  if (filters.categoria && filters.categoria !== "todos")
    params.set("categoria", filters.categoria);
  if (filters.tipo) params.set("tipo", filters.tipo);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return qs ? `/explorar?${qs}` : "/explorar";
}

export const categoryHref = (slug: string) => explorarHref({ categoria: slug });
