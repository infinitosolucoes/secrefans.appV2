import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Lock, ShieldCheck, Sparkles, UserPlus, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  BenefitRing,
  BrandArt,
  CategoryTile,
  CreatorCard,
  CtaPill,
  EmptyState,
  LinkTabs,
  PremiumBanner,
  ScriptAccent,
  SealStrip,
  SectionHeader,
  Tagline,
} from "@/components/ui";
import { getSessionUser } from "@/server/auth/session";
import { createServerSupabase } from "@/server/auth/supabase";
import { CATEGORIES, categoryHref } from "@/features/discovery/categories";

const POST_TABS = [
  { tipo: "", label: "Todos" },
  { tipo: "fotos", label: "Fotos" },
  { tipo: "videos", label: "Vídeos" },
  { tipo: "ao-vivo", label: "Ao vivo" },
];

const SEALS = [
  { icon: Sparkles, label: "Conteúdo exclusivo" },
  { icon: Users, label: "Conexões reais" },
  { icon: ShieldCheck, label: "Privacidade e segurança" },
  { icon: Lock, label: "Mais liberdade" },
];

export const metadata: Metadata = { title: "Descobrir" };

/** Home de descoberta (layout do DS com sidebar). Visitantes chegam aqui pela landing. */
export default async function Descobrir({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo = "" } = await searchParams;
  const tab = POST_TABS.find((t) => t.tipo === tipo) ?? POST_TABS[0]!;
  const tabHref = (t: string) =>
    t ? `/descobrir?tipo=${t}#publicacoes` : "/descobrir#publicacoes";
  const supabase = await createServerSupabase();
  const [user, { data: creators }] = await Promise.all([
    getSessionUser(),
    supabase
      .from("public_profiles")
      .select("handle, display_name, is_creator")
      .eq("is_creator", true)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const featured = creators ?? [];

  return (
    <AppShell user={user} active="/descobrir">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-lg border border-border bg-surface">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-3/5 md:block"
          aria-hidden
        >
          <BrandArt className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-transparent" />
        </div>
        <div className="relative flex flex-col gap-6 p-6 md:max-w-xl md:p-10">
          <Tagline>Conteúdo • Conexão • Liberdade</Tagline>
          <h1 className="type-hero-italic-fluid text-ink">
            Mais que conteúdo.
            <br />
            <span className="gradient-text">É você no controle.</span>
          </h1>
          <p className="type-body text-ink-muted">
            Um espaço exclusivo para quem cria, assina e vive experiências reais, sem filtros.
          </p>
          <div>
            {user ? (
              <CtaPill href="/inicio" icon={Sparkles} label="Ir para o início" />
            ) : (
              <CtaPill href="/criar-conta" icon={UserPlus} label="Criar Conta Grátis" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {featured.length > 0 && (
              <div className="flex items-center gap-3 rounded-pill border border-border bg-surface-alt py-2 pr-4 pl-2">
                <div className="flex -space-x-2" aria-hidden>
                  {featured.slice(0, 4).map((c) => (
                    <span
                      key={c.handle}
                      className="grid size-8 place-items-center rounded-full border-2 border-surface-alt bg-brand-deep type-caption font-bold text-accent-text"
                    >
                      {(c.display_name || c.handle || "?").charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
                <span className="type-caption text-ink">
                  Criadores reais. Conteúdos autênticos.{" "}
                  <span className="font-bold text-accent-text">+18</span>
                </span>
              </div>
            )}
            <ScriptAccent>Liberdade tem mais sentido aqui.</ScriptAccent>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <SealStrip items={SEALS} />
      </div>

      {/* Explore por categoria */}
      <section className="mt-10" aria-labelledby="categorias">
        <SectionHeader title="Explore por categoria" href="/explorar" />
        <h2 id="categorias" className="sr-only">
          Categorias
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
          {CATEGORIES.map((c) => (
            <CategoryTile
              key={c.slug}
              href={categoryHref(c.slug)}
              icon={c.icon}
              label={c.label}
              active={c.slug === "todos"}
            />
          ))}
        </div>
      </section>

      {/* Criadores em destaque */}
      <section className="mt-10">
        <SectionHeader title="Criadores em destaque" href="/criadores" />
        {featured.length === 0 ? (
          <EmptyState
            title="Os primeiros criadores estão chegando"
            description="Criadores aparecem aqui depois da verificação de identidade."
          />
        ) : (
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {featured.map((c) => (
              <div key={c.handle} className="snap-start">
                <CreatorCard
                  handle={c.handle ?? ""}
                  name={c.display_name ?? ""}
                  verified={Boolean(c.is_creator)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10">
        <PremiumBanner
          title="Conteúdo Premium"
          text="Assinaturas, pacotes de fotos e vídeos e conteúdo avulso, com acesso seguro ao que você comprou."
          href={user ? "/explorar" : "/criar-conta"}
          cta="Quero ver mais"
        />
      </div>

      {/* Benefícios */}
      <section className="mt-10 grid gap-6 md:grid-cols-2" aria-label="Benefícios">
        <BenefitRing icon={Wallet} lead="Para" turn="Criadores">
          Defina seus preços, venda assinaturas e pacotes. Comissão transparente em cada venda.
        </BenefitRing>
        <BenefitRing icon={Heart} lead="Para" turn="Fãs">
          Apoie quem você admira e acesse conteúdo exclusivo com privacidade.
        </BenefitRing>
      </section>

      {/* Publicações recentes */}
      <section className="mt-10 scroll-mt-20" id="publicacoes">
        <SectionHeader title="Publicações recentes" />
        <div className="mb-4">
          <LinkTabs
            items={POST_TABS.map((t) => ({ href: tabHref(t.tipo), label: t.label }))}
            active={tabHref(tab.tipo)}
          />
        </div>
        <EmptyState
          title="Nenhuma publicação ainda"
          description="As publicações dos criadores aparecem aqui assim que a publicação de conteúdo for liberada."
        />
      </section>

      <footer className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 type-caption text-ink-muted">
        <span>© {new Date().getFullYear()} Secretfans · Somente maiores de 18 anos</span>
        <Link href="/termos" className="hover:text-ink">
          Termos
        </Link>
        <Link href="/privacidade" className="hover:text-ink">
          Privacidade
        </Link>
        <span>#sejasecret</span>
      </footer>
    </AppShell>
  );
}
