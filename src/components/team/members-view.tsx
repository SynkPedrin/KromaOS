"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Mail, MailWarning, MessageCircle, Pencil, RotateCw, ShieldCheck, UserPlus, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { ROLE } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { inviteMemberAction, resendInvitationAction, revokeInvitationAction, updateMemberAction } from "@/app/actions/team";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  canViewFinance: boolean;
  avatarColor: string;
  active: boolean;
  lastLoginAt: string | null;
  clientMemberships: { client: { id: string; name: string } }[];
  _count: { assignedTasks: number };
};
export type InvitationRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  jobTitle: string | null;
  expiresAt: string;
  sendCount: number;
  lastSentAt: string | null;
  lastError: string | null;
  invitedBy: { name: string };
};

const ROLE_COLOR: Record<Role, string> = { ADMIN: "#7625F5", MANAGER: "#5B6BF5", MEMBER: "#77717F" };

type Outcome = { email: { sent: true } | { sent: false; reason: string; message?: string }; acceptUrl: string | null };

/** Quando o e-mail não sai, o link de aceite é mostrado para envio manual. */
function OutcomeNotice({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  if (outcome.email.sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-lime/40 text-lime-ink">
          <Mail className="size-5" />
        </div>
        <p className="text-sm text-ink-2">Convite enviado por e-mail. O link vale por 7 dias e só pode ser usado uma vez.</p>
        <Button onClick={onClose}>Fechar</Button>
      </div>
    );
  }
  // Sem Resend configurado, o convite por link é o fluxo normal (não é erro).
  const manual = outcome.email.reason === "not_configured";
  const reason = `O e-mail não pôde ser enviado${outcome.email.message ? `: ${outcome.email.message}` : "."}`;
  return (
    <div className="space-y-4">
      {manual ? (
        <div className="flex items-start gap-3 rounded-2xl bg-purple-50 p-3 text-sm text-ink-2 ring-1 ring-purple/10">
          <Link2 className="mt-0.5 size-4 shrink-0 text-purple" />
          <p>
            Convite criado. Envie o link abaixo para a pessoa (WhatsApp, por exemplo): ela abre, cria a senha e já entra na plataforma. O link é
            pessoal, de uso único e vale por 7 dias.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl bg-warning/10 p-3 text-sm text-[#8a5300]">
          <MailWarning className="mt-0.5 size-4 shrink-0" />
          <p>
            {reason} O convite foi criado — compartilhe o link abaixo diretamente com a pessoa. Ele é pessoal, de uso único e vale por 7 dias.
          </p>
        </div>
      )}
      {outcome.acceptUrl && (
        <div className="flex gap-2">
          <Input readOnly value={outcome.acceptUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" className="font-mono text-xs" />
          <Button
            variant="dark"
            onClick={() =>
              navigator.clipboard.writeText(outcome.acceptUrl!).then(
                () => toast.success("Link copiado."),
                () => toast.error("Não foi possível copiar."),
              )
            }
          >
            <Copy /> Copiar
          </Button>
        </div>
      )}
      {outcome.acceptUrl && (
        <Button variant="secondary" asChild className="w-full">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Seu acesso ao KROMA OS está pronto. Abra o link, crie sua senha e entre: ${outcome.acceptUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle /> Enviar pelo WhatsApp
          </a>
        </Button>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Concluir
        </Button>
      </div>
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useApp();
  const isAdmin = user.role === "ADMIN";
  const [role, setRole] = useState<Role>("MEMBER");
  const [finance, setFinance] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={outcome ? "Convite criado" : "Convidar membro"} description={outcome ? undefined : "A pessoa recebe um link seguro para criar a própria senha."}>
      {outcome ? (
        <OutcomeNotice outcome={outcome} onClose={() => onOpenChange(false)} />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              setError(null);
              setFieldErrors({});
              const r = await inviteMemberAction({
                name: String(fd.get("name")),
                email: String(fd.get("email")),
                jobTitle: String(fd.get("jobTitle") || "") || null,
                role,
                canViewFinance: role === "MANAGER" && finance,
              });
              if (!r.ok) {
                setError(r.error);
                setFieldErrors(r.fieldErrors ?? {});
                return;
              }
              if (r.data.email.sent) toast.success("Convite enviado.");
              setOutcome(r.data);
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="iv-name" error={fieldErrors.name}>
              <Input id="iv-name" name="name" required autoFocus maxLength={80} />
            </Field>
            <Field label="E-mail" htmlFor="iv-email" error={fieldErrors.email}>
              <Input id="iv-email" name="email" type="email" required />
            </Field>
            <Field label="Cargo" htmlFor="iv-job">
              <Input id="iv-job" name="jobTitle" maxLength={80} placeholder="Designer, Social media…" />
            </Field>
            <Field label="Permissão" htmlFor="iv-role">
              <Select id="iv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(isAdmin ? (["MEMBER", "MANAGER", "ADMIN"] as Role[]) : (["MEMBER"] as Role[])).map((r) => (
                  <option key={r} value={r}>
                    {ROLE[r].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="rounded-xl bg-white/60 px-3 py-2 text-xs text-ink-2 ring-1 ring-hairline">{ROLE[role].description}</p>
          {role === "MANAGER" && (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-hairline">
              <span className="text-sm">
                <span className="font-semibold">Acesso ao financeiro</span>
                <span className="block text-xs text-ink-3">{isAdmin ? "Mensalidades, cobranças e investimentos." : "Apenas administradores concedem."}</span>
              </span>
              <Switch checked={finance} onCheckedChange={setFinance} disabled={!isAdmin} aria-label="Acesso ao financeiro" />
            </label>
          )}
          {error && !Object.keys(fieldErrors).length && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              <UserPlus /> Enviar convite
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function EditMemberDialog({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const { user } = useApp();
  const isAdmin = user.role === "ADMIN";
  const self = member.id === user.id;
  const [role, setRole] = useState<Role>(member.role);
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [finance, setFinance] = useState(member.canViewFinance);
  const [active, setActive] = useState(member.active);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Gestores só gerenciam membros comuns; ninguém altera o próprio papel/status.
  const canChangeRole = isAdmin && !self;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Editar ${member.name}`}
      description={member.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await updateMemberAction(member.id, { role, jobTitle: jobTitle || null, canViewFinance: finance, active });
                if (!r.ok) return setError(r.error);
                toast.success("Membro atualizado.");
                onClose();
              })
            }
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Cargo" htmlFor="em-job">
          <Input id="em-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Permissão" htmlFor="em-role" hint={!canChangeRole ? (self ? "Você não pode alterar o próprio papel." : "Apenas administradores alteram papéis.") : ROLE[role].description}>
          <Select id="em-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!canChangeRole}>
            {(["MEMBER", "MANAGER", "ADMIN"] as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE[r].label}
              </option>
            ))}
          </Select>
        </Field>
        {role === "MANAGER" && (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-hairline">
            <span className="text-sm">
              <span className="font-semibold">Acesso ao financeiro</span>
              <span className="block text-xs text-ink-3">{isAdmin ? "Mensalidades, cobranças e investimentos." : "Apenas administradores concedem."}</span>
            </span>
            <Switch checked={finance} onCheckedChange={setFinance} disabled={!isAdmin} aria-label="Acesso ao financeiro" />
          </label>
        )}
        <label className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-hairline">
          <span className="text-sm">
            <span className="font-semibold">Conta ativa</span>
            <span className="block text-xs text-ink-3">Desativar encerra as sessões e bloqueia o acesso. O histórico é preservado.</span>
          </span>
          <Switch checked={active} onCheckedChange={setActive} disabled={self} aria-label="Conta ativa" />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function Invitations({ items }: { items: InvitationRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<InvitationRow | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [, start] = useTransition();
  if (!items.length) return null;
  return (
    <section className="mb-6" aria-labelledby="inv-title">
      <h2 id="inv-title" className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2">
        Convites pendentes
      </h2>
      <ul className="glass divide-y divide-hairline overflow-hidden rounded-3xl">
        {items.map((i) => {
          const expired = new Date(i.expiresAt) < new Date();
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar user={{ name: i.name, avatarColor: "#A855F7" }} size={34} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-semibold">
                  {i.name} <span className="font-normal text-ink-3">· {i.email}</span>
                </p>
                <p className="truncate text-xs text-ink-3">
                  {ROLE[i.role].label} · convidado por {i.invitedBy.name} ·{" "}
                  {expired ? <span className="text-danger">expirado</span> : `expira ${formatRelative(i.expiresAt)}`}
                  {i.lastError && <span className="text-warning"> · {i.lastError}</span>}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pendingId === i.id}
                  onClick={() =>
                    start(async () => {
                      setPendingId(i.id);
                      const r = await resendInvitationAction(i.id);
                      setPendingId(null);
                      if (!r.ok) return void toast.error(r.error);
                      if (r.data.email.sent) toast.success("Convite reenviado.");
                      else setOutcome(r.data);
                    })
                  }
                >
                  <RotateCw /> Reenviar link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setToRevoke(i)} className="hover:text-danger">
                  <X /> Revogar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!outcome} onOpenChange={(o) => !o && setOutcome(null)} title="Novo link gerado">
        {outcome && <OutcomeNotice outcome={outcome} onClose={() => setOutcome(null)} />}
      </Dialog>
      <ConfirmDialog
        open={!!toRevoke}
        onOpenChange={(o) => !o && setToRevoke(null)}
        title="Revogar convite?"
        description={`O link enviado para ${toRevoke?.email} deixará de funcionar.`}
        confirmLabel="Revogar"
        danger
        onConfirm={() =>
          start(async () => {
            const r = await revokeInvitationAction(toRevoke!.id);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Convite revogado.");
            setToRevoke(null);
          })
        }
      />
    </section>
  );
}

export function MembersView({ members, invitations }: { members: MemberRow[]; invitations: InvitationRow[] }) {
  const { isManager, user } = useApp();
  const [inviteKey, setInviteKey] = useState(0);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const canEdit = (m: MemberRow) => isManager && (user.role === "ADMIN" || m.role === "MEMBER");

  return (
    <>
      {isManager && (
        <div className="-mt-2 mb-5 flex justify-end">
          <Button onClick={() => setInviteKey((k) => k + 1)}>
            <UserPlus /> Convidar membro
          </Button>
        </div>
      )}
      {isManager && <Invitations items={invitations} />}
      {members.length === 0 ? (
        <div className="glass rounded-3xl">
          <EmptyState icon={<Users />} title="Nenhum membro" />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {members.map((m) => (
            <li key={m.id} className={`glass rounded-[22px] p-4 ${m.active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <Avatar user={m} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {m.name}
                    {m.id === user.id && <span className="font-normal text-ink-3"> (você)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-2">{m.jobTitle || "Sem cargo definido"}</p>
                  <p className="truncate text-xs text-ink-3">{m.email}</p>
                </div>
                {canEdit(m) && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(m)} aria-label={`Editar ${m.name}`}>
                    <Pencil />
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge color={ROLE_COLOR[m.role]}>
                  {m.role === "ADMIN" && <ShieldCheck className="mr-0.5 inline size-3" />}
                  {ROLE[m.role].label}
                </Badge>
                {m.role !== "MEMBER" && m.canViewFinance && (
                  <Badge color="#6E9400">
                    <Wallet className="mr-0.5 inline size-3" />
                    Financeiro
                  </Badge>
                )}
                {!m.active && <Badge color="#E5484D">Desativado</Badge>}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                  <dt className="text-ink-3">Tarefas abertas</dt>
                  <dd className="font-display text-[15px] font-medium tabular">{m._count.assignedTasks}</dd>
                </div>
                <div className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                  <dt className="text-ink-3">Último acesso</dt>
                  <dd className="truncate font-semibold" title={m.lastLoginAt ? formatDateTime(m.lastLoginAt) : undefined}>
                    {m.lastLoginAt ? formatRelative(m.lastLoginAt) : "Nunca"}
                  </dd>
                </div>
              </dl>
              {m.role === "MEMBER" && (
                <p className="mt-3 text-xs text-ink-3">
                  <span className="font-semibold text-ink-2">Clientes: </span>
                  {m.clientMemberships.length ? m.clientMemberships.map((c) => c.client.name).join(", ") : "nenhum vinculado (vincule na página do cliente)"}
                </p>
              )}
              {m.role !== "MEMBER" && (
                <p className="mt-3 flex items-center gap-1 text-xs text-ink-3">
                  <Check className="size-3.5" /> Acesso a todos os clientes
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {inviteKey > 0 && <InviteDialog key={inviteKey} open onOpenChange={(o) => !o && setInviteKey(0)} />}
      {editing && <EditMemberDialog key={editing.id} member={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
