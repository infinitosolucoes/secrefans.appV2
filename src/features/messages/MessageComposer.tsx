"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Lock, Send, X } from "lucide-react";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { parsePriceToCents } from "@/features/content/schemas";
import {
  ACCEPT_MEDIA,
  quickCheck,
  removeUploaded,
  uploadMedia,
  type UploadedMedia,
} from "@/features/content/upload";
import { EmojiPicker, insertAt } from "@/components/ui/EmojiPicker";
import { sendBroadcastAction, sendMessageAction } from "./actions";

const MAX_FILES = 10;

/**
 * Campo de mensagem. Fã: só texto. Criador: texto + fotos/vídeos + preço opcional (mensagem paga).
 * Modo "massa": envia para todos os assinantes ativos.
 */
export function MessageComposer({
  userId,
  conversationId,
  canAttach,
  mode = "chat",
}: {
  userId: string;
  conversationId?: string;
  canAttach: boolean;
  mode?: "chat" | "broadcast";
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const addEmoji = (emoji: string) => {
    const el = textRef.current;
    const next = insertAt(
      body,
      emoji,
      el?.selectionStart ?? body.length,
      el?.selectionEnd ?? body.length,
    );
    if (next.value.length > 2000) return;
    setBody(next.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.cursor, next.cursor);
    });
  };
  // Só habilita o envio depois que o React assumir a página (antes disso o clique não enviaria).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = quickCheck(f);
      if (problem) return setError(problem);
      if (next.length >= MAX_FILES) return setError(`Até ${MAX_FILES} arquivos por mensagem.`);
      next.push(f);
    }
    setError(null);
    setFiles(next);
  };

  const submit = () => {
    setError(null);
    setNotice(null);
    if (!body.trim() && files.length === 0) return;
    if (files.length > 0 && !attested)
      return setError(
        "Para enviar fotos ou vídeos, marque a declaração de direitos e consentimento.",
      );
    let priceCents: number | null = null;
    if (paid) {
      priceCents = parsePriceToCents(price);
      if (!priceCents || Number.isNaN(priceCents) || priceCents < 500 || priceCents > 100000)
        return setError("Preço entre R$ 5 e R$ 1.000.");
      if (files.length === 0)
        return setError("Mensagem paga precisa de pelo menos uma foto ou vídeo.");
    }
    startTransition(async () => {
      const originId = crypto.randomUUID();
      const uploaded: UploadedMedia[] = [];
      try {
        for (const f of files)
          uploaded.push(await uploadMedia(f, `${userId}/messages/${originId}`));
      } catch (e) {
        await removeUploaded(uploaded);
        setError(e instanceof Error ? e.message : "Falha ao enviar a mídia.");
        return;
      }
      const media = uploaded.map((u) => ({
        kind: u.kind,
        path: u.path,
        poster_path: u.poster,
        width: Math.round(u.width) || undefined,
        height: Math.round(u.height) || undefined,
        duration_seconds: u.duration ? Math.max(1, Math.round(u.duration)) : undefined,
      }));
      const result =
        mode === "broadcast"
          ? await sendBroadcastAction({ broadcastId: originId, body, priceCents, media, attested })
          : await sendMessageAction({
              messageId: originId,
              conversationId,
              body,
              priceCents,
              media,
              attested,
            });
      if (!result.ok) {
        await removeUploaded(uploaded);
        setError(result.message ?? "Não foi possível enviar.");
        return;
      }
      setBody("");
      setFiles([]);
      setAttested(false);
      setPaid(false);
      setPrice("");
      if (result.message) setNotice(result.message);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-3"
    >
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Textarea
        ref={textRef}
        id="mensagem"
        aria-label="Mensagem"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        placeholder={
          mode === "broadcast" ? "Escreva para todos os seus assinantes…" : "Escreva uma mensagem…"
        }
        className="min-h-16"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && mode === "chat") {
            e.preventDefault();
            submit();
          }
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Arquivos anexados">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-1 rounded-pill border border-border px-3 py-1 type-caption text-ink-muted"
            >
              {f.name.slice(0, 28)}
              <button
                type="button"
                aria-label={`Remover ${f.name}`}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="text-ink-muted hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <label className="flex items-start gap-2 type-caption text-ink-muted">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 accent-[var(--rosa-neon)]"
          />
          Declaro que tenho os direitos sobre este conteúdo e que todas as pessoas que aparecem nele
          são maiores de 18 anos e consentiram com a gravação e a publicação.
        </label>
      )}
      {canAttach && paid && (
        <div className="max-w-xs">
          <Label htmlFor="preco" hint="R$ 5 a R$ 1.000">
            Preço para desbloquear (R$)
          </Label>
          <Input
            id="preco"
            inputMode="decimal"
            placeholder="19,90"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <EmojiPicker onPick={addEmoji} />
        {canAttach && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_MEDIA}
              className="sr-only"
              aria-label="Anexar fotos ou vídeos"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              Foto ou vídeo
            </Button>
            <Button
              type="button"
              variant={paid ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={paid}
              onClick={() => setPaid(!paid)}
            >
              <Lock className="size-4" aria-hidden />
              {paid ? "Mensagem paga" : "Cobrar para ver"}
            </Button>
          </>
        )}
        <Button type="submit" size="sm" loading={pending} disabled={!ready} className="ml-auto">
          <Send className="size-4" aria-hidden />
          {mode === "broadcast" ? "Enviar para assinantes" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
