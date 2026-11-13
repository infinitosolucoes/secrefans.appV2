"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FieldError, Input, Label, RadioCard, Textarea } from "@/components/ui";
import {
  MAX_POST_BODY,
  MAX_POST_IMAGES,
  PPV_PRICE_MAX,
  PPV_PRICE_MIN,
  VISIBILITY_OPTIONS,
  type PostVisibility,
} from "./constants";
import { parsePriceToCents } from "./schemas";
import { savePostAction, type ActionResult } from "./actions";
import { ATTESTATION_REQUIRED, ContentAttestation } from "./ContentAttestation";
import { MediaPicker, type PickedFile } from "./MediaPicker";
import { removeUploaded, uploadMedia, type UploadedMedia } from "./upload";

export function Composer({ userId }: { userId: string }) {
  const router = useRouter();
  const postId = useMemo(() => crypto.randomUUID(), []);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>("free");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  async function submit(publish: boolean, form: HTMLFormElement) {
    const fd = new FormData(form);
    const body = String(fd.get("body") ?? "");
    const priceCents = visibility === "ppv" ? parsePriceToCents(fd.get("price")) : null;
    const attested = fd.get("attest") === "on";
    if (publish && !attested) {
      setState({ ok: false, message: ATTESTATION_REQUIRED });
      return;
    }
    setPending(true);
    setState(null);
    const uploaded: UploadedMedia[] = [];
    try {
      for (const [i, f] of files.entries()) {
        setProgress(
          `Enviando ${f.kind === "video" ? "vídeo" : "foto"} ${i + 1} de ${files.length}…`,
        );
        uploaded.push(await uploadMedia(f.file, `${userId}/${postId}`));
      }
      setProgress("Salvando…");
      const result = await savePostAction({
        postId,
        body,
        visibility,
        priceCents: priceCents === null ? null : Number.isNaN(priceCents) ? -1 : priceCents,
        publish,
        attested,
        media: uploaded,
      });
      setState(result);
      if (result.ok) {
        router.push("/estudio?salvo=1");
        router.refresh();
      } else {
        await removeUploaded(uploaded);
      }
    } catch (err) {
      await removeUploaded(uploaded);
      setState({
        ok: false,
        message:
          err instanceof Error && err.message.length > 10
            ? err.message
            : "Falha no envio. Verifique a conexão e tente de novo.",
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
        <legend className="mb-2 type-label text-ink">Fotos e vídeos</legend>
        <p className="mb-3 type-caption text-ink-muted">
          Até {MAX_POST_IMAGES} arquivos. Fotos JPG, PNG ou WEBP (removemos localização e outros
          dados do arquivo). Vídeos MP4 de até 100 MB e 10 minutos, enviados como estão.
        </p>
        <MediaPicker
          files={files}
          onChange={setFiles}
          max={MAX_POST_IMAGES}
          error={pickError ?? e.media}
          onError={setPickError}
        />
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

      <ContentAttestation />

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
