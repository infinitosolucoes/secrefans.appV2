"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Bio longa aparece cortada em 3 linhas no cabeçalho, com "Ler mais" para abrir o resto. */
export function ExpandableBio({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 160 || text.split("\n").length > 3;
  return (
    <div className={className}>
      <p
        id="perfil-bio"
        className={cn("whitespace-pre-line type-body text-ink", long && !open && "line-clamp-3")}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="perfil-bio"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 type-label font-semibold text-accent-text hover:underline"
        >
          {open ? "Ler menos" : "Ler mais"}
        </button>
      )}
    </div>
  );
}
