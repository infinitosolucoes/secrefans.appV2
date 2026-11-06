"use client";

import { useEffect, useRef } from "react";
import { Film, ImagePlus, X } from "lucide-react";
import { FieldError } from "@/components/ui";
import { ACCEPT_MEDIA, mediaKindOf, quickCheck } from "./upload";
import type { MediaKind } from "./constants";

export interface PickedFile {
  id: string;
  file: File;
  kind: MediaKind;
  preview: string;
}

/** Seleção de fotos/vídeos com pré-visualização local e remoção individual. */
export function MediaPicker({
  files,
  onChange,
  max,
  allowVideo = true,
  error,
  onError,
  label = "Adicionar",
}: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  max: number;
  allowVideo?: boolean;
  error?: string;
  onError: (message: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  function add(list: FileList | null) {
    if (!list) return;
    let problem: string | null = null;
    const next: PickedFile[] = [];
    for (const file of Array.from(list)) {
      const issue = quickCheck(file, allowVideo);
      if (issue) problem = issue;
      else
        next.push({
          id: crypto.randomUUID(),
          file,
          kind: mediaKindOf(file)!,
          preview: URL.createObjectURL(file),
        });
    }
    if (files.length + next.length > max) problem = `No máximo ${max} arquivos.`;
    onChange([...files, ...next].slice(0, max));
    onError(problem);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(id: string) {
    const gone = files.find((f) => f.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    onChange(files.filter((f) => f.id !== id));
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {files.map((f, i) => (
          <li key={f.id} className="relative">
            {f.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local
              <img
                src={f.preview}
                alt={`Foto ${i + 1} selecionada`}
                className="aspect-square w-full rounded-sm border border-border object-cover"
              />
            ) : (
              <div className="relative">
                <video
                  src={f.preview}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label={`Vídeo ${i + 1} selecionado`}
                  className="aspect-square w-full rounded-sm border border-border bg-surface-alt object-cover"
                />
                <Film
                  className="absolute bottom-1 left-1 size-5 text-ink drop-shadow"
                  aria-hidden
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => remove(f.id)}
              aria-label={`Remover arquivo ${i + 1}`}
              className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-surface/90 text-ink hover:text-accent-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {files.length < max && (
          <li>
            <label className="grid aspect-square w-full cursor-pointer place-items-center rounded-sm border border-dashed border-border text-ink-muted hover:border-accent hover:text-accent-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <span className="flex flex-col items-center gap-1 text-center type-caption">
                <ImagePlus className="size-6" aria-hidden />
                {label}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={allowVideo ? ACCEPT_MEDIA : "image/jpeg,image/png,image/webp"}
                multiple
                className="sr-only"
                onChange={(ev) => add(ev.target.files)}
                aria-describedby={error ? "media-erro" : undefined}
              />
            </label>
          </li>
        )}
      </ul>
      <FieldError id="media-erro" message={error} />
    </div>
  );
}
