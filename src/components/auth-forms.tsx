"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { acceptInviteAction, loginAction, setupAction } from "@/app/actions/auth";
import type { ActionResult } from "@/server/errors";

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-3 hover:text-ink"
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function useFormAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const submit = (fn: () => Promise<ActionResult | undefined>) =>
    start(async () => {
      setError(null);
      setFieldErrors({});
      // Em caso de sucesso a action redireciona; só voltamos aqui em erro.
      const r = await fn();
      if (r && !r.ok) {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  return { pending, error, fieldErrors, submit };
}

const ErrorBox = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">
      {error}
    </p>
  ) : null;

export function LoginForm() {
  const { pending, error, submit } = useFormAction();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit(() => loginAction({ email: String(fd.get("email")), password: String(fd.get("password")) }));
      }}
    >
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus placeholder="voce@kroma.com.br" />
      </Field>
      <Field label="Senha" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <ErrorBox error={error} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Entrar
      </Button>
    </form>
  );
}

export function SetupForm() {
  const { pending, error, fieldErrors, submit } = useFormAction();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit(() =>
          setupAction({
            name: String(fd.get("name")),
            email: String(fd.get("email")),
            jobTitle: String(fd.get("jobTitle") || ""),
            password: String(fd.get("password")),
          }),
        );
      }}
    >
      <Field label="Seu nome" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" required autoFocus autoComplete="name" />
      </Field>
      <Field label="Cargo" htmlFor="jobTitle">
        <Input id="jobTitle" name="jobTitle" placeholder="Sócio, Diretor criativo…" />
      </Field>
      <Field label="E-mail" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Senha" htmlFor="password" error={fieldErrors.password} hint="Mínimo de 10 caracteres, com letras e números.">
        <PasswordInput id="password" name="password" required autoComplete="new-password" />
      </Field>
      <ErrorBox error={fieldErrors.password || fieldErrors.email || fieldErrors.name ? null : error} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Criar conta de administrador
      </Button>
    </form>
  );
}

export function AcceptInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const { pending, error, fieldErrors, submit } = useFormAction();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit(() => acceptInviteAction({ token, name: String(fd.get("name")), password: String(fd.get("password")) }));
      }}
    >
      <Field label="E-mail">
        <Input value={email} disabled readOnly />
      </Field>
      <Field label="Como quer ser chamado" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={name} required autoComplete="name" />
      </Field>
      <Field label="Crie uma senha" htmlFor="password" error={fieldErrors.password} hint="Mínimo de 10 caracteres, com letras e números.">
        <PasswordInput id="password" name="password" required autoFocus autoComplete="new-password" />
      </Field>
      <ErrorBox error={fieldErrors.password || fieldErrors.name ? null : error} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Aceitar convite e entrar
      </Button>
    </form>
  );
}
