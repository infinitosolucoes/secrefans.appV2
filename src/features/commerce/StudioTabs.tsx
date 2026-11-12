import { LinkTabs } from "@/components/ui";

const TABS = [
  { href: "/estudio", label: "Publicações" },
  { href: "/estudio/pacotes", label: "Pacotes" },
  { href: "/estudio/vendas", label: "Vendas" },
  { href: "/estudio/recebimentos", label: "Recebimentos" },
  { href: "/estudio/comissao", label: "Comissão" },
];

export function StudioTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="mb-6">
      <LinkTabs items={TABS} active={active} />
    </div>
  );
}
