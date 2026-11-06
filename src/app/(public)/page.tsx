import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Crown,
  Flame,
  Heart,
  Lock,
  MessageCircle,
  ShieldCheck,
  Star,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { buttonClasses, CreatorCard, CtaPill, SectionHeader } from "@/components/ui";
import { createServerSupabase } from "@/server/auth/supabase";

/*
 * Landing de entrada, layout do canvas "Secretfans 2.0 — Telas MVP" (Landing.dc.html),
 * com cadastro direto no lugar do pré-cadastro.
 */

const SEALS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Lock, label: "Conteúdo exclusivo" },
  { icon: Users, label: "Conexões reais" },
  { icon: ShieldCheck, label: "Privacidade e segurança" },
  { icon: Flame, label: "Mais liberdade" },
];

type Pillar = { icon: LucideIcon; title: string; text: string };

const AUDIENCES: Array<{ id: string; turn: string; lead: string; pillars: Pillar[] }> = [
  {
    id: "criadores",
    turn: "Criadores",
    lead: "Sua imagem é sua marca. Seu conteúdo tem valor.",
    pillars: [
      {
        icon: Crown,
        title: "Monetize",
        text: "Assinaturas mensais e conteúdos pagos, do seu jeito.",
      },
      {
        icon: Users,
        title: "Construa",
        text: "Uma comunidade próxima, com quem valoriza o que você cria.",
      },
      {
        icon: ShieldCheck,
        title: "Proteja",
        text: "Seu conteúdo e sua identidade com privacidade de verdade.",
      },
    ],
  },
  {
    id: "fas",
    turn: "Fãs",
    lead: "Quem você admira, mais perto. Sem filtros.",
    pillars: [
      { icon: Star, title: "Explore", text: "Criadores e categorias para todos os gostos." },
      {
        icon: MessageCircle,
        title: "Conecte-se",
        text: "Conversas exclusivas, direto com quem você assina.",
      },
      { icon: Heart, title: "Seja você", text: "Assine com discrição. Ninguém precisa saber." },
    ],
  },
];

const STEPS = [
  {
    title: "Crie sua conta",
    text: "Cadastro gratuito como criador ou fã, com confirmação por e-mail.",
  },
  {
    title: "Verifique ou explore",
    text: "Criadores confirmam identidade e maioridade. Fãs já podem descobrir perfis.",
  },
  {
    title: "Crie, assine, conecte",
    text: "Monte seu perfil com conteúdos gratuitos e pagos, ou assine quem você admira.",
  },
];

const sectionLinks = [
  { href: "#criadores", label: "Para criadores" },
  { href: "#fas", label: "Para fãs" },
  { href: "#como", label: "Como funciona" },
  { href: "#seguranca", label: "Segurança" },
];

export default async function Landing() {
  const supabase = await createServerSupabase();
  const { data: creators } = await supabase
    .from("public_profiles")
    .select("handle, display_name, is_creator")
    .eq("is_creator", true)
    .order("created_at", { ascending: false })
    .limit(8);
  const featured = creators ?? [];

  return (
    <>
      <header className="mx-auto flex max-w-[1240px] items-center gap-x-3 px-4 py-4 sm:gap-x-8 md:px-6">
        <Logo />
        <nav aria-label="Seções" className="ml-auto hidden flex-wrap gap-x-7 lg:flex">
          {sectionLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="type-label leading-[44px] text-ink hover:text-accent-text"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 gap-1 sm:gap-3 lg:ml-0">
          <Link
            href="/entrar"
            className="inline-flex h-11 items-center rounded-pill border border-transparent px-3 type-label font-semibold text-ink hover:border-accent sm:border-border sm:bg-surface-alt sm:px-5"
          >
            Entrar
          </Link>
          <Link
            href="/criar-conta"
            className="inline-flex h-11 items-center rounded-pill bg-rosa-profundo px-4 type-label sm:px-5 font-bold whitespace-nowrap text-on-accent shadow-glow-sm hover:brightness-110"
          >
            Criar conta
          </Link>
        </div>
      </header>

      <main id="conteudo">
        {/* Hero */}
        <section className="relative overflow-hidden bg-[radial-gradient(45%_70%_at_75%_45%,color-mix(in_srgb,var(--rosa-neon)_32%,transparent),transparent_70%)]">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-20">
            <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
              <span className="inline-flex h-8 items-center gap-2 self-start rounded-pill border border-accent px-3.5 type-caption font-bold tracking-[0.12em] text-accent-text shadow-glow-sm">
                <span aria-hidden className="size-2 rounded-full bg-accent shadow-glow-sm" />
                +18 · CRIADORES VERIFICADOS
              </span>
              <p className="type-tagline text-ink">Conteúdo • Conexão • Liberdade</p>
              <h1 className="type-hero-italic-fluid text-ink">
                Mais que conteúdo.
                <br />
                <span className="gradient-text">É conexão.</span>
              </h1>
              <p className="max-w-[500px] text-lg leading-7 text-ink">
                A plataforma onde quem cria monetiza conteúdo exclusivo e quem assina vive conexões
                reais, com privacidade e liberdade.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <CtaPill href="/criar-conta" icon={UserPlus} label="Criar conta grátis" />
                <Link href="/descobrir" className={buttonClasses("outline", "md")}>
                  <Compass className="size-4" aria-hidden />
                  Explorar criadores
                </Link>
              </div>
            </div>

            <div className="relative flex min-h-[340px] flex-[1_1_380px] items-center justify-center md:min-h-[440px]">
              <div
                aria-hidden
                className="absolute aspect-square w-[min(400px,90%)] rounded-full border border-accent/70 shadow-[0_0_32px_color-mix(in_srgb,var(--rosa-neon)_60%,transparent),inset_0_0_40px_color-mix(in_srgb,var(--rosa-neon)_25%,transparent)]"
              />
              <div
                aria-hidden
                className="absolute aspect-square w-[min(300px,70%)] rounded-full bg-[radial-gradient(circle_at_50%_40%,var(--brand-deep),var(--surface)_75%)]"
              />
              <Image
                src="/brand/simbolo-coracao-cadeado.png"
                alt=""
                width={180}
                height={200}
                className="relative w-[min(180px,45%)] mix-blend-screen"
                priority
              />
              <p className="absolute right-0 bottom-2 -rotate-[7deg] type-script-fluid text-accent-text [text-shadow:0_0_14px_color-mix(in_srgb,var(--rosa-neon)_50%,transparent)]">
                Aqui tem mais.
              </p>
            </div>
          </div>
        </section>

        {/* Faixa de selos */}
        <section aria-label="Pilares" className="border-y border-border bg-surface-alt">
          <ul className="mx-auto grid max-w-[1240px] grid-cols-1 gap-4 px-4 py-5 sm:grid-cols-2 md:px-6 lg:grid-cols-4">
            {SEALS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center justify-center gap-3 type-caption font-medium tracking-[0.25em] text-ink uppercase"
              >
                <Icon aria-hidden className="size-7 shrink-0 text-accent" strokeWidth={1.6} />
                {label}
              </li>
            ))}
          </ul>
        </section>

        {/* Para criadores / Para fãs */}
        <section className="mx-auto grid max-w-[1240px] gap-6 px-4 pt-16 pb-10 md:grid-cols-2 md:px-6 md:pt-22">
          {AUDIENCES.map((a) => (
            <article
              key={a.id}
              id={a.id}
              className="flex scroll-mt-6 flex-col gap-7 rounded-lg border border-border bg-gradient-to-b from-surface-alt to-surface p-6 md:p-9"
            >
              <div className="flex flex-col gap-2.5">
                <p className="type-tagline text-ink-muted">Para</p>
                <h2 className="text-[44px] leading-[0.95] font-black text-accent-text uppercase italic">
                  {a.turn}
                </h2>
                <p className="type-body text-ink-muted">{a.lead}</p>
              </div>
              {a.pillars.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-start gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-full border-[1.5px] border-accent shadow-glow-sm">
                    <Icon aria-hidden className="size-6 text-accent" strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3 className="text-lg leading-6 font-extrabold tracking-[0.04em] text-accent-text uppercase">
                      {title}
                    </h3>
                    <p className="mt-0.5 type-body text-ink-muted">{text}</p>
                  </div>
                </div>
              ))}
              <Link
                href={a.id === "criadores" ? "/criar-conta?perfil=criador" : "/criar-conta"}
                className={`${buttonClasses(a.id === "criadores" ? "primary" : "outline", "md")} mt-auto self-start`}
              >
                {a.id === "criadores" ? "Quero ser criador" : "Criar conta de fã"}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </article>
          ))}
        </section>

        {/* Como funciona */}
        <section
          id="como"
          className="mx-auto flex max-w-[1240px] scroll-mt-6 flex-col gap-8 px-4 py-14 md:px-6"
        >
          <div className="flex flex-col items-center gap-2.5 text-center">
            <p className="type-tagline text-ink-muted">Como funciona</p>
            <h2 className="text-[32px] leading-none font-black text-ink uppercase italic md:text-[40px]">
              Uma nova fase <span className="text-accent-text">começa.</span>
            </h2>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-7"
              >
                <span className="text-[44px] leading-none font-black text-accent-text italic">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl leading-6 font-bold text-ink">{s.title}</h3>
                <p className="type-body text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Segurança */}
        <section
          id="seguranca"
          className="mx-auto max-w-[1240px] scroll-mt-6 px-4 pt-6 pb-14 md:px-6"
        >
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6 rounded-lg border border-accent bg-[radial-gradient(50%_140%_at_85%_50%,color-mix(in_srgb,var(--rosa-neon)_25%,transparent),transparent_70%)] bg-surface-alt p-6 shadow-glow-sm md:px-10 md:py-9">
            <ShieldCheck
              aria-hidden
              className="size-16 shrink-0 text-accent drop-shadow-[0_0_8px_color-mix(in_srgb,var(--rosa-neon)_70%,transparent)]"
              strokeWidth={1.4}
            />
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
              <h2 className="text-[28px] leading-[34px] font-extrabold text-ink">
                Privacidade e segurança em primeiro lugar.
              </h2>
              <p className="type-body text-ink-muted">
                Plataforma exclusiva para maiores de 18 anos, com verificação de identidade para
                criadores e controle total sobre quem vê o seu conteúdo.
              </p>
            </div>
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-rosa-profundo text-xl font-black text-on-accent shadow-glow-lg">
              +18
            </span>
          </div>
        </section>

        {featured.length > 0 && (
          <section className="mx-auto max-w-[1240px] px-4 pb-14 md:px-6">
            <SectionHeader title="Criadores em destaque" href="/criadores" />
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
          </section>
        )}

        {/* Chamada final (cadastro direto) */}
        <section
          id="cadastro"
          className="bg-[radial-gradient(60%_80%_at_20%_50%,color-mix(in_srgb,var(--rosa-neon)_20%,transparent),transparent_70%)]"
        >
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 pt-14 pb-20 md:px-6">
            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
              <p className="type-tagline text-ink-muted">Cadastro gratuito</p>
              <h2 className="text-[36px] leading-[0.95] font-black text-ink uppercase italic md:text-[52px]">
                Faça parte <span className="text-accent-text">desde o início.</span>
              </h2>
              <p className="max-w-[440px] text-[17px] leading-[26px] text-ink">
                Crie sua conta em poucos minutos e seja dos primeiros a viver essa experiência.
              </p>
              <p className="mt-2 origin-left -rotate-[4deg] type-script-fluid text-accent-text">
                O segredo é viver do seu jeito.
              </p>
            </div>
            <div className="flex w-full max-w-[520px] flex-[1_1_440px] flex-col gap-4 rounded-lg border border-border bg-surface-alt p-6 shadow-glow-sm md:p-8">
              <p className="type-label font-semibold text-ink">Eu sou</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/criar-conta?perfil=criador"
                  className="flex min-h-16 flex-col justify-center rounded-md border-[1.5px] border-accent bg-surface px-4 py-2.5 shadow-glow-sm hover:brightness-110"
                >
                  <span className="type-label font-bold text-ink">Criador</span>
                  <span className="type-caption text-ink-muted">Publicar e vender</span>
                </Link>
                <Link
                  href="/criar-conta?perfil=fa"
                  className="flex min-h-16 flex-col justify-center rounded-md border border-border bg-surface px-4 py-2.5 hover:border-accent"
                >
                  <span className="type-label font-bold text-ink">Fã</span>
                  <span className="type-caption text-ink-muted">Assinar e comprar</span>
                </Link>
              </div>
              <Link
                href="/criar-conta"
                className="inline-flex h-14 items-center justify-center gap-3 rounded-pill gradient-cta text-lg font-extrabold tracking-[0.06em] text-on-accent uppercase shadow-glow-lg hover:brightness-110"
              >
                Criar conta grátis
                <ArrowRight className="size-5" aria-hidden />
              </Link>
              <p className="type-caption text-ink-muted">
                Já tem conta?{" "}
                <Link href="/entrar" className="text-accent-text underline">
                  Entrar
                </Link>
                . Somente para maiores de 18 anos.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-5 px-4 py-8 md:px-6">
          <Logo />
          <span className="font-extrabold tracking-[0.06em] text-accent-text">#SEJASECRET</span>
          <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 sm:ml-auto">
            <Link
              href="/termos"
              className="text-[13px] leading-[44px] text-ink-muted hover:text-ink"
            >
              Termos de uso
            </Link>
            <Link
              href="/privacidade"
              className="text-[13px] leading-[44px] text-ink-muted hover:text-ink"
            >
              Política de Privacidade
            </Link>
          </nav>
          <p className="basis-full type-caption text-ink-muted">
            © {new Date().getFullYear()} Secretfans. Conteúdo destinado exclusivamente a maiores de
            18 anos.
          </p>
        </div>
      </footer>
    </>
  );
}
