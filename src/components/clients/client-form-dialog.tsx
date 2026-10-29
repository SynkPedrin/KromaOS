"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClientStatus, ContractStatus, ContractType, ServiceType } from "@/generated/prisma/enums";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { useApp } from "@/components/app/app-context";
import { CLIENT_STATUS, CONTRACT_STATUS, CONTRACT_TYPE, SERVICE_TYPE } from "@/lib/labels";
import { centsToInput, parseMoneyToCents, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClientAction, updateClientAction } from "@/app/actions/clients";
import { uploadFile } from "@/components/files/upload";
import { LogoPicker } from "./logo-picker";
import type { ContractInput } from "@/lib/schemas";

export type ClientFormInitial = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  whatsapp: string | null;
  segment: string | null;
  status: ClientStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  services: ServiceType[];
  memberIds: string[];
  contract: {
    id: string;
    type: ContractType;
    status: ContractStatus;
    setupFeeCents: number;
    monthlyFeeCents: number;
    mediaBudgetCents: number;
    billingDay: number | null;
  } | null;
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
        on ? "bg-purple text-white ring-purple" : "bg-white/70 text-ink-2 ring-hairline hover:ring-purple/40",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Cadastro e edição de cliente. No cadastro, só o essencial fica à mostra (logo, nome,
 * status, serviços e mensalidade); o restante fica em "Mais detalhes". O bloco comercial
 * só aparece para quem acessa o financeiro.
 */
export function ClientFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ClientFormInitial;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Editar cliente" : "Novo cliente"}
      description={initial ? initial.name : "Só o essencial agora; o resto você completa quando quiser."}
      className="sm:max-w-2xl"
    >
      {/* Remonta a cada abertura: o formulário sempre começa com os dados atuais. */}
      {open && <ClientForm initial={initial} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ClientForm({ initial, onDone }: { initial?: ClientFormInitial; onDone: () => void }) {
  const { users, canFinance } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [services, setServices] = useState<ServiceType[]>(initial?.services ?? []);
  const [memberIds, setMemberIds] = useState<string[]>(initial?.memberIds ?? []);
  const [logo, setLogo] = useState<File | null>(null);
  // Na edição tudo fica aberto; no cadastro os detalhes são opcionais.
  const [showDetails, setShowDetails] = useState(!!initial);
  const detailsId = useId();

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const c = initial?.contract;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => String(fd.get(k) ?? "").trim();
        const money = (k: string) => {
          const raw = s(k);
          if (!raw) return 0;
          return parseMoneyToCents(raw);
        };

        const client = {
          name: s("name"),
          contactName: s("contactName") || null,
          email: s("email") || null,
          whatsapp: s("whatsapp") || null,
          segment: s("segment") || null,
          status: s("status") as ClientStatus,
          startDate: s("startDate") || null,
          endDate: s("endDate") || null,
          notes: s("notes") || null,
          services,
          memberIds,
        };

        let contract: ContractInput | undefined;
        if (canFinance) {
          const setupFeeCents = money("setupFee");
          const monthlyFeeCents = money("monthlyFee");
          const mediaBudgetCents = money("mediaBudget");
          if (setupFeeCents === null || monthlyFeeCents === null || mediaBudgetCents === null) {
            setError("Valores monetários inválidos. Use o formato 1.500,00.");
            return;
          }
          const billingDay = s("billingDay") ? Number(s("billingDay")) : null;
          contract = {
            type: s("contractType") as ContractType,
            status: s("contractStatus") as ContractStatus,
            setupFeeCents,
            monthlyFeeCents,
            mediaBudgetCents,
            billingDay,
            startDate: client.startDate,
            endDate: client.endDate,
          };
          // Sem contrato existente e sem nenhum valor comercial: não cria contrato vazio.
          if (!c && !setupFeeCents && !monthlyFeeCents && !mediaBudgetCents && !billingDay) contract = undefined;
        }

        start(async () => {
          setError(null);
          setFieldErrors({});
          const r = initial ? await updateClientAction(initial.id, client, contract, c?.id) : await createClientAction(client, contract);
          if (!r.ok) {
            setError(r.error);
            setFieldErrors(r.fieldErrors ?? {});
            // Erro em campo recolhido: abre os detalhes para que fique visível.
            if (Object.keys(r.fieldErrors ?? {}).some((k) => k !== "name" && k !== "status")) setShowDetails(true);
            return;
          }
          if (!initial && r.data && logo) {
            // O cliente já existe; se o logo falhar, ele pode ser reenviado na página do cliente.
            const up = await uploadFile(logo, { type: "clientLogo", id: r.data.id }, { asClientLogo: true });
            if (!up.ok) toast.error(`Cliente cadastrado, mas o logo não foi enviado: ${up.error}. Envie de novo na página do cliente.`);
          }
          toast.success(initial ? "Cliente atualizado." : "Cliente cadastrado.");
          onDone();
          if (!initial && r.data) router.push(`/clientes/${r.data.id}`);
        });
      }}
    >
      <div className="flex gap-4">
        {!initial && <LogoPicker onChange={setLogo} />}
        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa" htmlFor="cf-name" error={fieldErrors.name} className="sm:col-span-2">
            <Input id="cf-name" name="name" required maxLength={120} defaultValue={initial?.name} autoFocus={!initial} />
          </Field>
          <Field label="Status" htmlFor="cf-status">
            <Select id="cf-status" name="status" defaultValue={initial?.status ?? "ACTIVE"}>
              {(Object.keys(CLIENT_STATUS) as ClientStatus[]).map((st) => (
                <option key={st} value={st}>
                  {CLIENT_STATUS[st].label}
                </option>
              ))}
            </Select>
          </Field>
          {canFinance && (
            <Field label="Mensalidade (R$)" htmlFor="cf-fee">
              <Input id="cf-fee" name="monthlyFee" inputMode="decimal" defaultValue={centsToInput(c?.monthlyFeeCents)} placeholder="0,00" />
            </Field>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">Serviços contratados</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SERVICE_TYPE) as ServiceType[]).map((sv) => (
            <Chip key={sv} on={services.includes(sv)} onClick={() => setServices((l) => toggle(l, sv))}>
              {SERVICE_TYPE[sv].label}
            </Chip>
          ))}
        </div>
      </fieldset>

      {!initial && (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          aria-controls={detailsId}
          className="flex w-full items-center justify-between rounded-xl bg-white/60 px-3.5 py-2.5 text-[13px] font-semibold text-ink-2 ring-1 ring-hairline transition-colors hover:bg-white hover:text-ink"
        >
          Mais detalhes (opcional)
          <ChevronDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} />
        </button>
      )}

      {/* Os campos ficam montados mesmo recolhidos: entram no FormData com seus valores padrão. */}
      <div id={detailsId} hidden={!showDetails} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">Contato e cadastro</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsável" htmlFor="cf-contact">
              <Input id="cf-contact" name="contactName" maxLength={120} defaultValue={initial?.contactName ?? ""} />
            </Field>
            <Field label="Segmento" htmlFor="cf-segment">
              <Input
                id="cf-segment"
                name="segment"
                maxLength={80}
                defaultValue={initial?.segment ?? ""}
                placeholder="Ex.: Alimentação, Saúde…"
              />
            </Field>
            <Field label="E-mail" htmlFor="cf-email" error={fieldErrors.email}>
              <Input id="cf-email" name="email" type="email" maxLength={200} defaultValue={initial?.email ?? ""} />
            </Field>
            <Field label="WhatsApp" htmlFor="cf-whats">
              <Input
                id="cf-whats"
                name="whatsapp"
                type="tel"
                maxLength={40}
                defaultValue={initial?.whatsapp ?? ""}
                placeholder="(11) 99999-9999"
              />
            </Field>
            <Field label="Início" htmlFor="cf-start">
              <Input id="cf-start" name="startDate" type="date" defaultValue={toDateInput(initial?.startDate)} />
            </Field>
            <Field label="Encerramento" htmlFor="cf-end">
              <Input id="cf-end" name="endDate" type="date" defaultValue={toDateInput(initial?.endDate)} />
            </Field>
            <Field label="Observações" htmlFor="cf-notes" className="sm:col-span-2">
              <Textarea id="cf-notes" name="notes" maxLength={5000} defaultValue={initial?.notes ?? ""} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">Membros com acesso</legend>
          <p className="mb-2 text-xs text-ink-3">
            Gestores e administradores veem todos os clientes. Membros só veem os clientes aos quais foram vinculados.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => (
              <Chip key={u.id} on={memberIds.includes(u.id)} onClick={() => setMemberIds((l) => toggle(l, u.id))}>
                <Avatar user={u} size={18} className="ring-0" />
                {u.name}
              </Chip>
            ))}
          </div>
        </fieldset>

        {canFinance && (
          <fieldset className="rounded-2xl bg-gradient-to-br from-purple-50/70 to-lime-soft/30 p-4 ring-1 ring-purple/10">
            <legend className="sr-only">Dados comerciais</legend>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-purple">Dados comerciais</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Implantação (R$)" htmlFor="cf-setup">
                <Input id="cf-setup" name="setupFee" inputMode="decimal" defaultValue={centsToInput(c?.setupFeeCents)} placeholder="0,00" />
              </Field>
              <Field label="Mídia mensal (R$)" htmlFor="cf-media" hint="Verba do cliente — não é receita.">
                <Input
                  id="cf-media"
                  name="mediaBudget"
                  inputMode="decimal"
                  defaultValue={centsToInput(c?.mediaBudgetCents)}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Dia de vencimento" htmlFor="cf-day">
                <Input id="cf-day" name="billingDay" type="number" min={1} max={31} defaultValue={c?.billingDay ?? ""} />
              </Field>
              <Field label="Tipo de contrato" htmlFor="cf-ctype">
                <Select id="cf-ctype" name="contractType" defaultValue={c?.type ?? "MONTHLY"}>
                  {(Object.keys(CONTRACT_TYPE) as ContractType[]).map((t) => (
                    <option key={t} value={t}>
                      {CONTRACT_TYPE[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status do contrato" htmlFor="cf-cstatus">
                <Select id="cf-cstatus" name="contractStatus" defaultValue={c?.status ?? "ACTIVE"}>
                  {(Object.keys(CONTRACT_STATUS) as ContractStatus[]).map((t) => (
                    <option key={t} value={t}>
                      {CONTRACT_STATUS[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="mt-3 text-xs text-ink-3">Apenas clientes com status “Ativo” e contrato ativo compõem a receita recorrente (MRR).</p>
          </fieldset>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {initial ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
      </div>
    </form>
  );
}
