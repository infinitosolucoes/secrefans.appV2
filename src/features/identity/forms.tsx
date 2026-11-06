"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  FieldError,
  Label,
  RadioCard,
  SelectField,
  Textarea,
} from "@/components/ui";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  updateProfileAction,
  type FormState,
} from "./actions";

function Submit({
  children,
  fullWidth = true,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} fullWidth={fullWidth}>
      {children}
    </Button>
  );
}

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={state.values?.next ?? next ?? ""} />
      <Field
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.errors?.email}
      />
      <Field
        name="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        required
        error={state.errors?.password}
      />
      <Link
        href="/esqueci-senha"
        className="self-end type-caption text-accent-text hover:underline"
      >
        Esqueci minha senha
      </Link>
      <Submit>Entrar</Submit>
      <p className="text-center type-caption text-ink-muted">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className="text-accent-text hover:underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ defaultIntent = "fan" }: { defaultIntent?: "fan" | "creator" }) {
  const [state, action] = useActionState(signUpAction, {});
  const intent = state.values?.intent || defaultIntent;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <fieldset>
        <legend className="mb-2 type-label text-ink">Como você quer usar a Secretfans?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["fan", "Sou fã", "Descobrir e apoiar criadores"],
              ["creator", "Sou criador", "Publicar e monetizar"],
            ] as const
          ).map(([value, label, hint]) => (
            <RadioCard
              key={value}
              name="intent"
              value={value}
              title={label}
              description={hint}
              defaultChecked={intent === value}
            />
          ))}
        </div>
      </fieldset>
      <Field
        name="displayName"
        label="Nome público"
        autoComplete="nickname"
        required
        defaultValue={state.values?.displayName}
        error={state.errors?.displayName}
      />
      <Field
        name="handle"
        label="Nome de usuário"
        hint="ex.: maria.silva"
        autoComplete="username"
        required
        defaultValue={state.values?.handle}
        error={state.errors?.handle}
      />
      <Field
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.errors?.email}
      />
      <Field
        name="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        hint="mín. 10, com maiúscula, minúscula e número"
        required
        error={state.errors?.password}
      />
      <div className="flex flex-col gap-2">
        <Checkbox name="age18" error={state.errors?.age18}>
          Declaro que tenho <strong className="text-ink">18 anos ou mais</strong>.
        </Checkbox>
        <Checkbox name="terms" error={state.errors?.terms}>
          Li e aceito os{" "}
          <Link href="/termos" className="text-accent-text underline">
            termos de uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="text-accent-text underline">
            política de privacidade
          </Link>
          .
        </Checkbox>
        <Checkbox name="marketing">Quero receber novidades por e-mail (opcional).</Checkbox>
      </div>
      <Submit>Criar conta</Submit>
      <p className="text-center type-caption text-ink-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="text-accent-text hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        required
        error={state.errors?.email}
      />
      <Submit>Enviar link</Submit>
      <Link href="/entrar" className="text-center type-caption text-accent-text hover:underline">
        Voltar para o login
      </Link>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        name="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.password}
      />
      <Field
        name="confirm"
        label="Confirme a nova senha"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.confirm}
      />
      <Submit>Salvar nova senha</Submit>
    </form>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: { handle: string; displayName: string; bio: string; visibility: string };
}) {
  const [state, action] = useActionState(updateProfileAction, {});
  const v = state.values ?? initial;
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        name="displayName"
        label="Nome público"
        required
        defaultValue={v.displayName}
        error={state.errors?.displayName}
      />
      <Field
        name="handle"
        label="Nome de usuário"
        required
        defaultValue={v.handle}
        error={state.errors?.handle}
      />
      <div>
        <Label htmlFor="bio" hint="até 500 caracteres">
          Bio
        </Label>
        <Textarea
          id="bio"
          name="bio"
          maxLength={500}
          defaultValue={v.bio}
          aria-invalid={state.errors?.bio ? true : undefined}
        />
        <FieldError id="bio-erro" message={state.errors?.bio} />
      </div>
      <SelectField name="visibility" label="Visibilidade do perfil" defaultValue={v.visibility}>
        <option value="public">Público</option>
        <option value="followers">Somente seguidores</option>
        <option value="private">Privado</option>
      </SelectField>
      <Submit fullWidth={false}>Salvar perfil</Submit>
    </form>
  );
}
