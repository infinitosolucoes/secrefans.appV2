import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { buttonClasses } from "@/components/ui";
import { confirmAgeAction } from "@/features/age-gate/actions";
import { safeNextPath } from "@/features/identity/schemas";

export const metadata: Metadata = {
  title: "Conteúdo para maiores de 18 anos",
  robots: { index: false },
};

/** Aviso +18 mostrado ao visitante antes de qualquer página pública. */
export default async function AvisoMaioridade({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-10">
        <Logo />
      </div>
      <main
        id="conteudo"
        className="w-full max-w-lg rounded-lg border border-border bg-surface-alt p-6 text-center shadow-glow-sm md:p-10"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-full border-2 border-accent text-accent-text shadow-glow-sm">
          <span className="type-feature-title">18+</span>
        </span>
        <h1 className="mt-6 type-heading text-ink">Conteúdo para maiores de 18 anos</h1>
        <p className="mt-3 type-body text-ink-muted">
          A Secretfans reúne conteúdo adulto de criadores verificados. Para continuar, confirme que
          você tem 18 anos ou mais e que esse tipo de conteúdo é permitido onde você está.
        </p>
        <form action={confirmAgeAction} className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
          <input type="hidden" name="next" value={safeNextPath(next, "/")} />
          <button type="submit" className={buttonClasses("primary", "md", true)}>
            Tenho 18 anos ou mais
          </button>
          <a href="https://www.google.com" className={buttonClasses("secondary", "md", true)}>
            Sair
          </a>
        </form>
        <p className="mt-6 type-caption text-ink-muted">
          Ao entrar, você concorda com os{" "}
          <Link href="/termos" className="text-accent-text underline">
            Termos de uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="text-accent-text underline">
            Política de privacidade
          </Link>
          .
        </p>
      </main>
      <p className="mt-10 type-tagline text-ink-muted">Conteúdo • Conexão • Liberdade</p>
    </div>
  );
}
