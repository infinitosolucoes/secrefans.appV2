"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Alert, Button, FieldError, Input, Label, RadioCard, Textarea } from "@/components/ui";
import { browserSupabase } from "@/lib/supabase-browser";
import { reencodeImage } from "@/lib/image";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_DIMENSION,
  MAX_POST_BODY,
  MAX_POST_IMAGES,
  MAX_SOURCE_IMAGE_BYTES,
  POST_MEDIA_BUCKET,
  PPV_PRICE_MAX,
  PPV_PRICE_MIN,
  VISIBILITY_OPTIONS,
  type PostVisibility,
} from "./constants";
import { parsePriceToCents } from "./schemas";
import { savePostAction, type ActionResult } from "./actions";

type Picked = { id: string; file: File; preview: string };

export function Composer({ userId }: { userId: string }) {
  const router = useRouter();
  const postId = useMemo(() => crypto.randomUUID(), []);
  const [files, setFiles] = useState<Picked[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>("free");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Libera as pré-visualizações só ao sair da página (remoções individuais liberam na hora).
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Picked[] = [];
    let problem = "";
    for (const file of Array.from(list)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) problem = "Use fotos JPG, PNG ou WEBP.";
      else if (file.size > MAX_SOURCE_IMAGE_BYTES) problem = "Cada foto pode ter até 25 MB.";
      else next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    const merged = [...files, ...next].slice(0, MAX_POST_IMAGES);
    if (files.length + next.length > MAX_POST_IMAGES)
      problem = `No máximo ${MAX_POST_IMAGES} fotos.`;
    setFiles(merged);
    setState(problem ? { ok: false, errors: { media: problem } } : null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const gone = prev.find((f) => f.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((f) => f.id !== id);
    });
  }

  async function submit(publish: boolean, form: HTMLFormElement) {
    const fd = new FormData(form);
    const body = String(fd.get("body") ?? "");
    const priceCents = visibility === "ppv" ? parsePriceToCents(fd.get("price")) : null;
    setPending(true);
    setState(null);
    const uploaded: string[] = [];
    const supabase = browserSupabase();
    try {
      const media = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Preparando foto ${i + 1} de ${files.length}…`);
        const { blob, width, height } = await reencodeImage(f.file, MAX_IMAGE_DIMENSION);
        const path = `${userId}/${postId}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .upload(path, blob, { contentType: "image/webp", upsert: false });
        if (error) throw new Error("upload");
        uploaded.push(path);
        media.push({ path, width, height });
      }
      setProgress("Salvando…");
      const result = await savePostAction({
        postId,
        body,
        visibility,
        priceCents: priceCents === null ? null : Number.isNaN(priceCents) ? -1 : priceCents,
        publish,
        media,
      });
      setState(result);
      if (result.ok) {
        router.push("/estudio?salvo=1");
        router.refresh();
      } else if (uploaded.length) {
        await supabase.storage.from(POST_MEDIA_BUCKET).remove(uploaded);
      }
    } catch {
      if (uploaded.length) await supabase.storage.from(POST_MEDIA_BUCKET).remove(uploaded);
      setState({
        ok: false,
        message: "Falha ao enviar as fotos. Verifique a conexão e tente de novo.",
      });
    } finally {
      setPending(false);
      setProgress("");
    }
  }

  const e = state?.errors ?? {};
  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        void submit(submitter?.value !== "draft", ev.currentTarget);
      }}
    >
      {state?.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}

      <div>
        <Label htmlFor="body" hint={`até ${MAX_POST_BODY} caracteres`}>
          Texto
        </Label>
        <Textarea
          id="body"
          name="body"
          maxLength={MAX_POST_BODY}
          placeholder="Conte o que você está compartilhando…"
          aria-invalid={e.body ? true : undefined}
          aria-describedby={e.body ? "body-erro" : undefined}
        />
        <FieldError id="body-erro" message={e.body} />
      </div>

      <fieldset>
        <legend className="mb-2 type-label text-ink">Fotos</legend>
        <p className="mb-3 type-caption text-ink-muted">
          Até {MAX_POST_IMAGES} fotos. Antes do envio removemos localização e outros dados do
          arquivo. Vídeos chegam na próxima etapa.
        </p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((f, i) => (
            <li key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização local */}
              <img
                src={f.preview}
                alt={`Foto ${i + 1} selecionada`}
                className="aspect-square w-full rounded-sm border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                aria-label={`Remover foto ${i + 1}`}
                className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-surface/90 text-ink hover:text-accent-text"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {files.length < MAX_POST_IMAGES && (
            <li>
              <label className="grid aspect-square w-full cursor-pointer place-items-center rounded-sm border border-dashed border-border text-ink-muted hover:border-accent hover:text-accent-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                <span className="flex flex-col items-center gap-1 type-caption">
                  <ImagePlus className="size-6" aria-hidden />
                  Adicionar
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(ev) => addFiles(ev.target.files)}
                  aria-describedby={e.media ? "media-erro" : undefined}
                />
              </label>
            </li>
          )}
        </ul>
        <FieldError id="media-erro" message={e.media} />
      </fieldset>

      <fieldset>
        <legend className="mb-2 type-label text-ink">Quem pode ver</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {VISIBILITY_OPTIONS.map((o) => (
            <RadioCard
              key={o.value}
              name="visibility"
              value={o.value}
              title={o.label}
              description={o.description}
              checked={visibility === o.value}
              onChange={() => setVisibility(o.value)}
            />
          ))}
        </div>
        {visibility !== "free" && (
          <p className="mt-3 type-caption text-ink-muted">
            Assinaturas e compras avulsas chegam na próxima etapa. Até lá, este post aparece
            bloqueado para os fãs e só você vê a mídia.
          </p>
        )}
      </fieldset>

      {visibility === "ppv" && (
        <div className="max-w-xs">
          <Label htmlFor="price" hint={`R$ ${PPV_PRICE_MIN} a R$ ${PPV_PRICE_MAX}`}>
            Preço (R$)
          </Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            placeholder="19,90"
            aria-invalid={e.price ? true : undefined}
            aria-describedby={e.price ? "price-erro" : undefined}
          />
          <FieldError id="price-erro" message={e.price} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" value="publish" loading={pending}>
          Publicar
        </Button>
        <Button type="submit" value="draft" variant="secondary" disabled={pending}>
          Salvar rascunho
        </Button>
        {progress && (
          <span role="status" className="type-caption text-ink-muted">
            {progress}
          </span>
        )}
      </div>
    </form>
  );
}
