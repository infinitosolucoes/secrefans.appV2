"use client";

import { useState } from "react";
import { Check, Copy, Lock } from "lucide-react";

/** Campo de URL das peças: pílula contorno `accent`, cadeado, URL em `accent-text`, copiar. */
export function UrlField({ url, label = "Link do seu perfil" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex h-12 max-w-full items-center gap-3 rounded-pill border border-accent px-4">
      <Lock aria-hidden className="size-4 shrink-0 text-accent-text" />
      <span className="sr-only">{label}:</span>
      <span className="min-w-0 flex-1 truncate type-label text-accent-text">{url}</span>
      <button
        type="button"
        onClick={copy}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-alt hover:text-ink"
        aria-label={copied ? "Link copiado" : "Copiar link"}
      >
        {copied ? (
          <Check aria-hidden className="size-4 text-success" />
        ) : (
          <Copy aria-hidden className="size-4" />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Link copiado" : ""}
      </span>
    </div>
  );
}
