"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, FieldError, Label, Textarea } from "@/components/ui";
import { addCommentAction } from "./actions";

export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState(addCommentAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      {state?.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="postId" value={postId} />
      <Label htmlFor="comentario">Escreva um comentário</Label>
      <Textarea
        id="comentario"
        name="body"
        maxLength={500}
        className="min-h-20"
        aria-invalid={state?.errors?.body ? true : undefined}
        aria-describedby={state?.errors?.body ? "comentario-erro" : undefined}
      />
      <FieldError id="comentario-erro" message={state?.errors?.body} />
      <Button type="submit" size="sm" loading={pending} className="self-start">
        Comentar
      </Button>
    </form>
  );
}
