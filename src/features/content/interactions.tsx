"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Flag, Heart, UserCheck, UserPlus } from "lucide-react";
import { Alert, Button, buttonClasses, FieldError, Label, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { REPORT_REASONS, type ReportTarget } from "./constants";
import { reportAction, toggleFollowAction, toggleLikeAction } from "./actions";

export function LikeButton({
  postId,
  liked,
  count,
  loggedIn,
}: {
  postId: string;
  liked: boolean;
  count: number;
  loggedIn: boolean;
}) {
  const [state, setOptimistic] = useOptimistic({ liked, count });
  const [, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (!loggedIn)
    return (
      <Link
        href="/entrar"
        className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 type-label text-ink-muted hover:text-ink"
        aria-label={`Curtir (${count} curtidas). Entre para curtir.`}
      >
        <Heart className="size-5" aria-hidden />
        {count}
      </Link>
    );

  return (
    <button
      type="button"
      aria-pressed={state.liked}
      aria-label={state.liked ? "Descurtir" : "Curtir"}
      onClick={() =>
        startTransition(async () => {
          const next = !state.liked;
          setOptimistic({ liked: next, count: state.count + (next ? 1 : -1) });
          const res = await toggleLikeAction(postId, next);
          setError(!res.ok);
        })
      }
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-pill px-3 type-label transition",
        state.liked ? "text-accent-text" : "text-ink-muted hover:text-ink",
        error && "text-danger",
      )}
    >
      <Heart className={cn("size-5", state.liked && "fill-current")} aria-hidden />
      {state.count}
    </button>
  );
}

export function FollowButton({
  creatorId,
  following,
  loggedIn,
  size = "sm",
  className,
}: {
  creatorId: string;
  following: boolean;
  loggedIn: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!loggedIn)
    return (
      <Link href="/entrar" className={cn(buttonClasses("primary", size), className)}>
        <UserPlus className="size-4" aria-hidden />
        Seguir
      </Link>
    );

  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        size={size}
        variant={optimistic ? "secondary" : "primary"}
        aria-pressed={optimistic}
        disabled={pending}
        className={className}
        onClick={() =>
          startTransition(async () => {
            const next = !optimistic;
            setOptimistic(next);
            const res = await toggleFollowAction(creatorId, next);
            setError(res.ok ? null : (res.message ?? "Erro."));
          })
        }
      >
        {optimistic ? (
          <UserCheck className="size-4" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        {optimistic ? "Seguindo" : "Seguir"}
      </Button>
      {error && (
        <span role="alert" className="mt-1 type-caption text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/** Denúncia em painel expansível (sem modal), com motivo e detalhes. */
export function ReportButton({
  targetType,
  targetId,
  loggedIn,
  label = "Denunciar",
}: {
  targetType: ReportTarget;
  targetId: string;
  loggedIn: boolean;
  label?: string;
}) {
  const [state, action, pending] = useActionState(reportAction, null);
  if (!loggedIn)
    return (
      <Link
        href="/entrar"
        className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 type-label text-ink-muted hover:text-ink"
      >
        <Flag className="size-4" aria-hidden />
        {label}
      </Link>
    );
  const id = `denuncia-${targetType}-${targetId}`;
  return (
    <details className="group relative">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-pill px-3 type-label text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <Flag className="size-4" aria-hidden />
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-surface-alt p-4 shadow-glow-sm">
        {state?.ok ? (
          <Alert tone="success">{state.message}</Alert>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            {state?.message && <Alert tone="error">{state.message}</Alert>}
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <div>
              <Label htmlFor={`${id}-motivo`}>Motivo</Label>
              <Select id={`${id}-motivo`} name="reason" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <FieldError id={`${id}-motivo-erro`} message={state?.errors?.reason} />
            </div>
            <div>
              <Label htmlFor={`${id}-detalhes`} hint="opcional">
                Detalhes
              </Label>
              <Textarea
                id={`${id}-detalhes`}
                name="details"
                maxLength={1000}
                className="min-h-20"
              />
            </div>
            <Button type="submit" size="sm" variant="danger" loading={pending}>
              Enviar denúncia
            </Button>
          </form>
        )}
      </div>
    </details>
  );
}
