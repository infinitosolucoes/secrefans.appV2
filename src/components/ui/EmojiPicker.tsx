"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/cn";
import { EMOJIS } from "@/lib/emoji";

export { EMOJIS, insertAt } from "@/lib/emoji";

/**
 * Botão de emoji (estilo Instagram): abre uma grade e chama onPick com o emoji escolhido.
 * Fecha ao escolher, ao clicar fora ou com Esc.
 */
export function EmojiPicker({
  onPick,
  className,
  align = "left",
}: {
  onPick: (emoji: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Inserir emoji"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex size-9 items-center justify-center rounded-pill text-ink-muted transition hover:bg-surface hover:text-ink"
      >
        <Smile className="size-5" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Emojis"
          className={cn(
            "absolute bottom-full z-30 mb-2 grid w-72 grid-cols-8 gap-1 rounded-lg border border-border bg-surface-alt p-2 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Emoji ${emoji}`}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="flex size-8 items-center justify-center rounded-md text-xl transition hover:bg-surface"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
