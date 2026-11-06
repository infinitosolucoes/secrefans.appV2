import Image from "next/image";
import Link from "next/link";

/**
 * Logo oficial Rebrand 2026 (coração-cadeado). Arquivos raster copiados do design system;
 * pedir ao designer o vetor SVG para tamanhos grandes. Sempre sobre fundo escuro.
 */
export function Logo({
  variant = "horizontal",
  href = "/",
}: {
  variant?: "horizontal" | "symbol";
  href?: string;
}) {
  const img =
    variant === "symbol" ? (
      <Image
        src="/brand/simbolo-coracao-cadeado.png"
        alt="Secretfans"
        width={36}
        height={40}
        priority
      />
    ) : (
      <Image
        src="/brand/logo-cadeado-horizontal.png"
        alt="Secretfans"
        width={160}
        height={44}
        priority
        className="h-9 w-auto"
      />
    );
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center rounded-md"
      aria-label="Secretfans, página inicial"
    >
      {img}
    </Link>
  );
}
