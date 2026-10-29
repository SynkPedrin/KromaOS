"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Server, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form-controls";
import { useApp } from "@/components/app/app-context";
import { ROLE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { changePasswordAction, updateProfileAction } from "@/app/actions/team";

const SWATCHES = ["#7625F5", "#A855F7", "#5B6BF5", "#D946A8", "#C2185B", "#3E9B12", "#6E9400", "#E08A00", "#111015"];

export type SystemInfo = {
  storageDriver: string;
  emailConfigured: boolean;
  appUrl: string;
  cronConfigured: boolean;
  limits: { IMAGE: number; DOCUMENT: number; VIDEO: number };
};

function Card({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-[26px] p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-purple-50 text-purple ring-1 ring-purple/10 [&_svg]:size-[18px]">{icon}</span>
        <div>
          <h2 className="text-[15px] font-bold">{title}</h2>
          {description && <p className="text-xs text-ink-3">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileCard() {
  const { user } = useApp();
  const [name, setName] = useState(user.name);
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [color, setColor] = useState(user.avatarColor);
  const [pending, start] = useTransition();
  return (
    <Card icon={<UserRound />} title="Perfil" description={`${user.email} · ${ROLE[user.role].label}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateProfileAction({ name, jobTitle: jobTitle || null, avatarColor: color });
            if (!r.ok) toast.error(r.error);
            else toast.success("Perfil atualizado.");
          });
        }}
      >
        <div className="flex items-center gap-4">
          <Avatar user={{ name: name || user.name, avatarColor: color }} size={56} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do avatar">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn("flex size-7 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform hover:scale-110", color === c ? "ring-ink" : "ring-transparent")}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="pf-name">
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </Field>
          <Field label="Cargo" htmlFor="pf-job">
            <Input id="pf-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Salvar perfil
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card icon={<KeyRound />} title="Segurança" description="Ao trocar a senha, suas outras sessões são encerradas.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const next = String(fd.get("next"));
          if (next !== String(fd.get("confirm"))) return setError("A confirmação não confere com a nova senha.");
          start(async () => {
            setError(null);
            const r = await changePasswordAction({ current: String(fd.get("current")), next });
            if (!r.ok) return setError(r.error);
            toast.success("Senha alterada.");
            form.reset();
          });
        }}
      >
        <Field label="Senha atual" htmlFor="pw-current">
          <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nova senha" htmlFor="pw-next" hint="Mínimo de 10 caracteres, com letras e números.">
            <Input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <Field label="Confirmar nova senha" htmlFor="pw-confirm">
            <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

function SystemCard({ info }: { info: SystemInfo }) {
  const ok = (v: boolean, yes: string, no: string) => <Badge color={v ? "#3E9B12" : "#E08A00"}>{v ? yes : no}</Badge>;
  const rows: [string, React.ReactNode][] = [
    ["Armazenamento de arquivos", <Badge key="s" color="#7625F5">{info.storageDriver === "s3" ? "S3 compatível" : "Disco local (desenvolvimento)"}</Badge>],
    ["E-mails de convite (Resend)", ok(info.emailConfigured, "Configurado", "Não configurado")],
    ["Rotina agendada (prazos e cobranças)", ok(info.cronConfigured, "CRON_SECRET definido", "CRON_SECRET ausente")],
    ["Endereço da aplicação", <span key="u" className="break-all font-mono text-xs">{info.appUrl}</span>],
    ["Limite por imagem", mb(info.limits.IMAGE)],
    ["Limite por documento", mb(info.limits.DOCUMENT)],
    ["Limite por vídeo", mb(info.limits.VIDEO)],
  ];
  return (
    <Card icon={<Server />} title="Sistema" description="Somente leitura. Ajuste pelas variáveis de ambiente (veja docs/DEPLOYMENT.md).">
      <dl className="divide-y divide-hairline">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <dt className="text-ink-2">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function SettingsView({ system }: { system: SystemInfo | null }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <ProfileCard />
        <PasswordCard />
      </div>
      {system && (
        <div>
          <SystemCard info={system} />
        </div>
      )}
    </div>
  );
}
