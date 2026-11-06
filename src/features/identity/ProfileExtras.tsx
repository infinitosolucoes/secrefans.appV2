"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FieldError, Input, Label } from "@/components/ui";
import { Avatar } from "@/components/domain/Avatar";
import { browserSupabase } from "@/lib/supabase-browser";
import { reencodeImage } from "@/lib/image";
import {
  ACCEPTED_IMAGE_TYPES,
  AVATAR_BUCKET,
  BANNER_BUCKET,
  MAX_SOURCE_IMAGE_BYTES,
  publicImageUrl,
} from "@/features/content/constants";
import { CATEGORIES } from "@/features/discovery/categories";
import {
  setProfileImageAction,
  updateCreatorDetailsAction,
  updateSocialsAction,
} from "./profile-extras-actions";
import { SOCIAL_NETWORKS, type Socials } from "./socials";

export function ProfileImages({
  userId,
  name,
  avatarPath,
  bannerPath,
}: {
  userId: string;
  name: string;
  avatarPath: string | null;
  bannerPath: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"avatar" | "banner" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  async function upload(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_SOURCE_IMAGE_BYTES) {
      setMessage({ ok: false, text: "Use JPG, PNG ou WEBP de até 25 MB." });
      return;
    }
    setBusy(kind);
    setMessage(null);
    try {
      const { blob } = await reencodeImage(file, kind === "avatar" ? 512 : 1600);
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const bucket = kind === "avatar" ? AVATAR_BUCKET : BANNER_BUCKET;
      const supabase = browserSupabase();
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw new Error("upload");
      const res = await setProfileImageAction(kind, path);
      if (!res.ok) await supabase.storage.from(bucket).remove([path]);
      setMessage({ ok: res.ok, text: res.message ?? "" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Falha no envio. Tente novamente." });
    } finally {
      setBusy(null);
      if (avatarRef.current) avatarRef.current.value = "";
      if (bannerRef.current) bannerRef.current.value = "";
    }
  }

  async function remove(kind: "avatar" | "banner") {
    setBusy(kind);
    const res = await setProfileImageAction(kind, null);
    setMessage({ ok: res.ok, text: res.message ?? "" });
    setBusy(null);
    router.refresh();
  }

  const banner = publicImageUrl(BANNER_BUCKET, bannerPath);
  return (
    <section aria-labelledby="imagens" className="flex max-w-xl flex-col gap-4">
      <h2 id="imagens" className="type-feature-title text-ink">
        Foto e capa
      </h2>
      {message && <Alert tone={message.ok ? "success" : "error"}>{message.text}</Alert>}
      <div className="h-28 overflow-hidden rounded-lg border border-border bg-[radial-gradient(80%_120%_at_50%_0%,var(--brand-deep),var(--surface))]">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element -- pré-visualização do banner
          <img src={banner} alt="Capa atual" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar path={avatarPath} name={name} size="lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={avatarRef}
            type="file"
            tabIndex={-1}
            aria-hidden
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => upload("avatar", e.target.files?.[0])}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={busy === "avatar"}
            onClick={() => avatarRef.current?.click()}
          >
            Trocar foto
          </Button>
          <input
            ref={bannerRef}
            type="file"
            tabIndex={-1}
            aria-hidden
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => upload("banner", e.target.files?.[0])}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={busy === "banner"}
            onClick={() => bannerRef.current?.click()}
          >
            Trocar capa
          </Button>
          {avatarPath && (
            <Button type="button" size="sm" variant="ghost" onClick={() => remove("avatar")}>
              Remover foto
            </Button>
          )}
          {bannerPath && (
            <Button type="button" size="sm" variant="ghost" onClick={() => remove("banner")}>
              Remover capa
            </Button>
          )}
        </div>
      </div>
      <p className="type-caption text-ink-muted">
        Foto e capa são públicas. Removemos localização e outros dados do arquivo antes do envio.
      </p>
    </section>
  );
}

export function SocialsForm({ socials }: { socials: Socials }) {
  const [state, action, pending] = useActionState(updateSocialsAction, null);
  const e = state?.errors ?? {};
  return (
    <section aria-labelledby="redes" className="max-w-xl">
      <h2 id="redes" className="mb-1 type-feature-title text-ink">
        Redes sociais
      </h2>
      <p className="mb-4 type-caption text-ink-muted">
        Aparecem no seu perfil público. Informe só o nome de usuário (ou cole o link do perfil).
      </p>
      <form action={action} className="flex flex-col gap-4">
        {state?.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((n) => (
            <div key={n.key}>
              <Label htmlFor={`social-${n.key}`}>{n.label}</Label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
                >
                  @
                </span>
                <Input
                  id={`social-${n.key}`}
                  name={n.key}
                  defaultValue={socials[n.key] ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="usuario"
                  className="pl-9"
                  aria-invalid={e[n.key] ? true : undefined}
                  aria-describedby={e[n.key] ? `social-${n.key}-erro` : undefined}
                />
              </div>
              <FieldError id={`social-${n.key}-erro`} message={e[n.key]} />
            </div>
          ))}
        </div>
        <Button type="submit" loading={pending} className="self-start">
          Salvar redes sociais
        </Button>
      </form>
    </section>
  );
}

export function CreatorDetailsForm({
  categories,
  links,
}: {
  categories: string[];
  links: string[];
}) {
  const [state, action, pending] = useActionState(updateCreatorDetailsAction, null);
  const e = state?.errors ?? {};
  return (
    <section aria-labelledby="categorias-links" className="max-w-xl">
      <h2 id="categorias-links" className="mb-4 type-feature-title text-ink">
        Categorias e links
      </h2>
      <form action={action} className="flex flex-col gap-4">
        {state?.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <fieldset aria-describedby={e.categories ? "categories-erro" : undefined}>
          <legend className="mb-2 type-label text-ink">Categorias (até 3)</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c.slug !== "todos").map((c) => (
              <label
                key={c.slug}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border border-border px-4 type-label text-ink-muted has-[:checked]:border-accent has-[:checked]:text-accent-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={c.slug}
                  defaultChecked={categories.includes(c.slug)}
                  className="sr-only"
                />
                {c.label}
              </label>
            ))}
          </div>
          <FieldError id="categories-erro" message={e.categories} />
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="link-0" hint="até 3, começando com https://">
            Links
          </Label>
          {[0, 1, 2].map((i) => (
            <Input
              key={i}
              id={`link-${i}`}
              name="links"
              type="url"
              inputMode="url"
              placeholder="https://"
              defaultValue={links[i] ?? ""}
              aria-label={i === 0 ? undefined : `Link ${i + 1}`}
            />
          ))}
          <FieldError id="links-erro" message={e.links} />
        </div>
        <Button type="submit" loading={pending} className="self-start">
          Salvar categorias e links
        </Button>
      </form>
    </section>
  );
}
