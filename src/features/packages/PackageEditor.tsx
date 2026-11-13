"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, ImagePlus, Info, X } from "lucide-react";
import {
  Alert,
  Button,
  FieldError,
  Input,
  Label,
  RadioCard,
  SelectField,
  Textarea,
} from "@/components/ui";
import { browserSupabase } from "@/lib/supabase-browser";
import { reencodeImage } from "@/lib/image";
import {
  ACCEPTED_IMAGE_TYPES,
  formatBRL,
  formatDuration,
  formatMediaCount,
  MAX_PACKAGE_ITEMS,
  MAX_SOURCE_IMAGE_BYTES,
  PACKAGE_COVER_BUCKET,
  PACKAGE_PRICE_MAX,
  PACKAGE_PRICE_MIN,
  publicImageUrl,
} from "@/features/content/constants";
import { parsePriceToCents } from "@/features/content/schemas";
import { MediaPicker, type PickedFile } from "@/features/content/MediaPicker";
import { removeUploaded, uploadMedia, type UploadedMedia } from "@/features/content/upload";
import { CATEGORIES } from "@/features/discovery/categories";
import { savePackageAction, type PackageResult } from "./actions";
import { ATTESTATION_REQUIRED, ContentAttestation } from "@/features/content/ContentAttestation";
import type { EditorItem } from "./queries";

export interface PackageEditorInitial {
  packageId: string;
  isNew: boolean;
  hasPublished: boolean;
  version: number;
  title: string;
  description: string;
  category: string | null;
  priceCents: number | null;
  audience: "all" | "subscribers";
  coverPath: string | null;
  items: EditorItem[];
}

export function PackageEditor({
  userId,
  initial,
}: {
  userId: string;
  initial: PackageEditorInitial;
}) {
  const router = useRouter();
  const [existing, setExisting] = useState<EditorItem[]>(initial.items);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [audience, setAudience] = useState(initial.audience);
  const [coverPath, setCoverPath] = useState<string | null>(initial.coverPath);
  const [coverBusy, setCoverBusy] = useState(false);
  const [price, setPrice] = useState(
    initial.priceCents ? (initial.priceCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const [state, setState] = useState<PackageResult | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const priceCents = parsePriceToCents(price);
  const total = existing.length + picked.length;
  const photos =
    existing.filter((i) => i.kind === "image").length +
    picked.filter((i) => i.kind === "image").length;

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_SOURCE_IMAGE_BYTES) {
      setState({ ok: false, errors: { cover: "Use JPG, PNG ou WEBP de até 25 MB." } });
      return;
    }
    setCoverBusy(true);
    try {
      const { blob } = await reencodeImage(file, 1600);
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const { error } = await browserSupabase()
        .storage.from(PACKAGE_COVER_BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw new Error("upload");
      setCoverPath(path);
    } catch {
      setState({ ok: false, errors: { cover: "Falha ao enviar a capa." } });
    } finally {
      setCoverBusy(false);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  async function submit(publish: boolean, form: HTMLFormElement) {
    const fd = new FormData(form);
    const attested = fd.get("attest") === "on";
    if (publish && !attested) {
      setState({ ok: false, message: ATTESTATION_REQUIRED });
      return;
    }
    setPending(true);
    setState(null);
    const uploaded: UploadedMedia[] = [];
    try {
      for (const [i, f] of picked.entries()) {
        setProgress(
          `Enviando ${f.kind === "video" ? "vídeo" : "foto"} ${i + 1} de ${picked.length}…`,
        );
        uploaded.push(await uploadMedia(f.file, `${userId}/packages/${initial.packageId}`));
      }
      setProgress("Salvando…");
      const result = await savePackageAction({
        packageId: initial.packageId,
        title: String(fd.get("title") ?? ""),
        description: String(fd.get("description") ?? ""),
        category: String(fd.get("category") ?? "") || null,
        priceCents: priceCents === null || Number.isNaN(priceCents) ? -1 : priceCents,
        audience,
        coverPath,
        publish,
        attested,
        items: [
          ...existing.map((i) => ({
            kind: i.kind,
            path: i.path,
            poster: i.poster,
            width: i.width,
            height: i.height,
            duration: i.duration,
            size: i.size,
          })),
          ...uploaded.map((u) => ({ ...u })),
        ],
      });
      setState(result);
      if (result.ok) {
        router.push(`/estudio/pacotes?salvo=${publish ? "publicado" : "rascunho"}`);
        router.refresh();
      } else {
        await removeUploaded(uploaded);
      }
    } catch (err) {
      await removeUploaded(uploaded);
      setState({
        ok: false,
        message: err instanceof Error && err.message.length > 10 ? err.message : "Falha no envio.",
      });
    } finally {
      setPending(false);
      setProgress("");
    }
  }

  const e = state?.errors ?? {};
  const coverUrl = publicImageUrl(PACKAGE_COVER_BUCKET, coverPath);
  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(ev) => {
        ev.preventDefault();
        const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        void submit(submitter?.value === "publish", ev.currentTarget);
      }}
    >
      {initial.hasPublished && (
        <Alert tone="info" title="Versionamento">
          Alterar um pacote publicado cria uma nova versão. Quem já comprou continua com acesso à
          versão adquirida.
        </Alert>
      )}
      {state?.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}

      <section
        aria-labelledby="info"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6"
      >
        <h2 id="info" className="type-feature-title text-ink">
          Informações
        </h2>
        <div>
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            name="title"
            maxLength={80}
            defaultValue={initial.title}
            placeholder="Nome do pacote"
            aria-invalid={e.title ? true : undefined}
            aria-describedby={e.title ? "title-erro" : undefined}
          />
          <FieldError id="title-erro" message={e.title} />
        </div>
        <div>
          <Label htmlFor="description" hint="até 2000 caracteres">
            Descrição
          </Label>
          <Textarea
            id="description"
            name="description"
            maxLength={2000}
            defaultValue={initial.description}
            placeholder="Conte o que o fã vai receber"
          />
          <FieldError id="description-erro" message={e.description} />
        </div>
        <SelectField name="category" label="Categoria" defaultValue={initial.category ?? ""}>
          <option value="">Sem categoria</option>
          {CATEGORIES.filter((c) => c.slug !== "todos").map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </SelectField>
      </section>

      <section
        aria-labelledby="midia"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="midia" className="type-feature-title text-ink">
            Mídia
          </h2>
          <span className="type-caption text-ink-muted">
            {formatMediaCount(photos, total - photos)}
          </span>
        </div>
        <p className="type-caption text-ink-muted">
          Os arquivos vão direto para o armazenamento privado. Fotos perdem localização e dados do
          arquivo; vídeos MP4 (até 100 MB e 10 min) são enviados como estão.
        </p>
        {existing.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Itens já enviados">
            {existing.map((item, i) => (
              <li key={item.path} className="relative">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- prévia assinada para o dono
                  <img
                    src={item.previewUrl}
                    alt={`${item.kind === "video" ? "Vídeo" : "Foto"} ${i + 1} do pacote`}
                    className="aspect-square w-full rounded-sm border border-border object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-sm border border-border bg-surface" />
                )}
                {item.kind === "video" && (
                  <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-pill bg-surface/90 px-2 type-caption text-ink">
                    <Film className="size-3.5" aria-hidden />
                    {formatDuration(item.duration)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setExisting((prev) => prev.filter((x) => x.path !== item.path))}
                  aria-label={`Remover item ${i + 1}`}
                  className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-surface/90 text-ink hover:text-accent-text"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <MediaPicker
          files={picked}
          onChange={setPicked}
          max={Math.max(0, MAX_PACKAGE_ITEMS - existing.length)}
          error={pickError ?? e.items}
          onError={setPickError}
          label="Adicionar fotos ou vídeos"
        />
      </section>

      <section
        aria-labelledby="capa"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6"
      >
        <h2 id="capa" className="type-feature-title text-ink">
          Capa e prévia
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid aspect-[4/3] w-48 place-items-center overflow-hidden rounded-md border border-border bg-[radial-gradient(80%_80%_at_50%_35%,var(--brand-deep),var(--surface)_85%)]">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- capa pública
              <img src={coverUrl} alt="Capa do pacote" className="h-full w-full object-cover" />
            ) : (
              <span className="type-caption text-ink-muted">Prévia protegida</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={coverInput}
              type="file"
              tabIndex={-1}
              aria-hidden
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(ev) => uploadCover(ev.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={coverBusy}
              onClick={() => coverInput.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {coverPath ? "Trocar capa" : "Escolher capa"}
            </Button>
            {coverPath && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setCoverPath(null)}>
                Usar prévia protegida
              </Button>
            )}
          </div>
        </div>
        <p className="flex gap-2 type-caption text-ink-muted">
          <Info className="size-4 shrink-0" aria-hidden />A capa é pública na vitrine. Não use uma
          imagem do conteúdo pago. Sem capa, mostramos a prévia protegida.
        </p>
        <FieldError id="cover-erro" message={e.cover} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section
          aria-labelledby="preco"
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6"
        >
          <h2 id="preco" className="type-feature-title text-ink">
            Preço
          </h2>
          <div className="max-w-xs">
            <Label htmlFor="price" hint={`R$ ${PACKAGE_PRICE_MIN} a R$ ${PACKAGE_PRICE_MAX}`}>
              Preço do pacote (R$)
            </Label>
            <Input
              id="price"
              inputMode="decimal"
              placeholder="49,90"
              value={price}
              onChange={(ev) => setPrice(ev.target.value)}
              aria-invalid={e.priceCents ? true : undefined}
              aria-describedby={e.priceCents ? "price-erro" : undefined}
            />
            <FieldError id="price-erro" message={e.priceCents} />
          </div>
          <dl className="flex flex-col gap-2 type-label">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Valor da venda</dt>
              <dd className="text-ink">
                {priceCents && !Number.isNaN(priceCents) ? formatBRL(priceCents) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Comissão Secretfans e taxas</dt>
              <dd className="text-ink-muted">definidas com os pagamentos (S4)</dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="quem"
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface-alt p-5 md:p-6"
        >
          <h2 id="quem" className="type-feature-title text-ink">
            Quem pode comprar
          </h2>
          <div className="grid gap-3">
            <RadioCard
              name="audience"
              value="all"
              title="Todos os fãs"
              description="Compra avulsa, sem assinatura"
              checked={audience === "all"}
              onChange={() => setAudience("all")}
            />
            <RadioCard
              name="audience"
              value="subscribers"
              title="Somente assinantes"
              description="Exige assinatura ativa"
              checked={audience === "subscribers"}
              onChange={() => setAudience("subscribers")}
            />
          </div>
        </section>
      </div>

      <ContentAttestation />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" value="publish" loading={pending}>
          {initial.hasPublished ? "Publicar nova versão" : "Publicar pacote"}
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
