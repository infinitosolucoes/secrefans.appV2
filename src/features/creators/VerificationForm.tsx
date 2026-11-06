"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Field, FieldError, Label, Textarea } from "@/components/ui";
import { browserSupabase } from "@/lib/supabase-browser";
import { appealVerificationAction, submitVerificationAction, type ActionResult } from "./actions";
import { ALLOWED_DOC_TYPES, VERIFICATION_BUCKET, validateDocument } from "./verification";

const DOCS = [
  { name: "documentFront", label: "Documento com foto (frente)", required: true },
  { name: "documentBack", label: "Documento (verso)", required: false },
  { name: "selfie", label: "Selfie segurando o documento", required: true },
] as const;

export function VerificationForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(file: File): Promise<string> {
    const ext = ALLOWED_DOC_TYPES[file.type];
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    // Upload direto ao bucket privado com a sessão do usuário; a RLS só permite a própria pasta.
    const { error } = await browserSupabase()
      .storage.from(VERIFICATION_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("upload");
    return path;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};
    const files: Partial<Record<(typeof DOCS)[number]["name"], File>> = {};
    for (const doc of DOCS) {
      const file = fd.get(doc.name);
      if (file instanceof File && file.size > 0) {
        const problem = validateDocument(file);
        if (problem) errors[doc.name] = problem;
        else files[doc.name] = file;
      } else if (doc.required) {
        errors[doc.name] = "Envie este arquivo.";
      }
    }
    if (Object.keys(errors).length) return setState({ ok: false, errors });

    setPending(true);
    setState(null);
    try {
      const [front, back, selfie] = await Promise.all([
        upload(files.documentFront!),
        files.documentBack ? upload(files.documentBack) : Promise.resolve(null),
        upload(files.selfie!),
      ]);
      const result = await submitVerificationAction({
        legalName: fd.get("legalName"),
        birthDate: fd.get("birthDate"),
        documentFrontPath: front,
        documentBackPath: back,
        selfiePath: selfie,
        rightsConsent: fd.get("rightsConsent") === "on",
        depictedConsent: fd.get("depictedConsent") === "on",
      });
      setState(result);
      if (result.ok) router.refresh();
    } catch {
      setState({
        ok: false,
        message: "Falha no envio dos arquivos. Verifique sua conexão e tente novamente.",
      });
    } finally {
      setPending(false);
    }
  }

  const e = state?.errors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4" noValidate>
      {state?.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <Field
        name="legalName"
        label="Nome completo (como no documento)"
        autoComplete="name"
        required
        error={e.legalName}
      />
      <Field name="birthDate" label="Data de nascimento" type="date" required error={e.birthDate} />
      {DOCS.map((doc) => (
        <div key={doc.name}>
          <Label
            htmlFor={doc.name}
            hint={doc.required ? "JPG, PNG, WEBP ou PDF até 10 MB" : "opcional"}
          >
            {doc.label}
          </Label>
          <input
            id={doc.name}
            name={doc.name}
            type="file"
            accept={Object.keys(ALLOWED_DOC_TYPES).join(",")}
            required={doc.required}
            aria-invalid={e[doc.name] ? true : undefined}
            aria-describedby={e[doc.name] ? `${doc.name}-erro` : undefined}
            className="block w-full rounded-sm border border-border bg-surface-alt p-2 type-caption text-ink-muted file:mr-3 file:rounded-pill file:border-0 file:bg-surface file:px-4 file:py-2 file:text-ink"
          />
          <FieldError id={`${doc.name}-erro`} message={e[doc.name]} />
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Checkbox name="rightsConsent" error={e.rightsConsent}>
          Declaro que sou titular dos direitos do conteúdo que vou publicar.
        </Checkbox>
        <Checkbox name="depictedConsent" error={e.depictedConsent}>
          Declaro que todas as pessoas retratadas são maiores de 18 anos e consentiram com a
          publicação.
        </Checkbox>
      </div>
      <p className="type-caption text-ink-muted">
        Seus documentos ficam em armazenamento privado e só a equipe de verificação pode abri-los.
      </p>
      <Button type="submit" loading={pending} className="self-start">
        Enviar para verificação
      </Button>
    </form>
  );
}

export function AppealForm({ verificationId }: { verificationId: string }) {
  const [state, action, pending] = useActionState(appealVerificationAction, null);
  return (
    <form action={action} className="mt-4 flex max-w-xl flex-col gap-3">
      {state?.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <input type="hidden" name="verificationId" value={verificationId} />
      <div>
        <Label htmlFor="appeal">Recorrer da decisão</Label>
        <Textarea
          id="appeal"
          name="appeal"
          maxLength={2000}
          placeholder="Explique o que mudou ou por que a decisão deve ser revista."
        />
        <FieldError id="appeal-erro" message={state?.errors?.appeal} />
      </div>
      <Button type="submit" variant="outline" loading={pending} className="self-start">
        Enviar recurso
      </Button>
    </form>
  );
}
