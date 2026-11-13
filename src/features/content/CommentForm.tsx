"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, FieldError, Label, Textarea } from "@/components/ui";
import { EmojiPicker, insertAt } from "@/components/ui/EmojiPicker";
import { addCommentAction } from "./actions";

export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState(addCommentAction, null);
  const ref = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Campo não controlado: insere o emoji onde está o cursor e devolve o foco.
  const addEmoji = (emoji: string) => {
    const el = textRef.current;
    if (!el) return;
    const next = insertAt(el.value, emoji, el.selectionStart, el.selectionEnd);
    if (next.value.length > 500) return;
    el.value = next.value;
    el.focus();
    el.setSelectionRange(next.cursor, next.cursor);
  };
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      {state?.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="postId" value={postId} />
      <Label htmlFor="comentario">Escreva um comentário</Label>
      <Textarea
        ref={textRef}
        id="comentario"
        name="body"
        maxLength={500}
        className="min-h-20"
        aria-invalid={state?.errors?.body ? true : undefined}
        aria-describedby={state?.errors?.body ? "comentario-erro" : undefined}
      />
      <FieldError id="comentario-erro" message={state?.errors?.body} />
      <div className="flex items-center gap-2">
        <EmojiPicker onPick={addEmoji} />
        <Button type="submit" size="sm" loading={pending}>
          Comentar
        </Button>
      </div>
    </form>
  );
}
