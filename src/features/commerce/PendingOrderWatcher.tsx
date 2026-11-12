"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";

/** Recarrega a página do pedido a cada 5s enquanto ele estiver pendente (até 15 min). */
export function PendingOrderWatcher() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 15 * 60_000) return clearInterval(timer);
      router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <p className="type-caption text-ink-muted" aria-live="polite">
      Aguardando a confirmação do pagamento. Esta página atualiza sozinha.
    </p>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? "Código copiado" : "Copiar código Pix"}
    </Button>
  );
}
