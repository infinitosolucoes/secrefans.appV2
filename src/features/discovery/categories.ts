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

export const categoryHref = (slug: string) =>
  slug === "todos" ? "/explorar" : `/explorar?categoria=${slug}`;
