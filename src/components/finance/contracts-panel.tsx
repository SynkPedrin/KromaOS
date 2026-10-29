"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileSignature, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ClientStatus, ContractStatus, ContractType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Dialog } from "@/components/ui/dialog";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { CLIENT_STATUS, CONTRACT_STATUS, CONTRACT_TYPE } from "@/lib/labels";
import { centsToInput, formatDate, formatMoney, parseMoneyToCents, toDateInput } from "@/lib/format";
import { saveContractFinanceAction } from "@/app/actions/finance";
import { MoneyInput } from "./finance-ui";

type Contract = {
  id: string;
  type: ContractType;
  status: ContractStatus;
  setupFeeCents: number;
  monthlyFeeCents: number;
  mediaBudgetCents: number;
  billingDay: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};
export type ClientContractRow = {
  id: string;
  name: string;
  status: ClientStatus;
  logoFileId: string | null;
  contract: Contract | null;
  contractCount: number;
};

/** Formulário de contrato — exportado para reuso (ex.: página do cliente). */
export function ContractDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  contract,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  clientName: string;
  contract: Contract | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={contract ? "Editar contrato" : "Novo contrato"} description={clientName}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const money = (k: string) => parseMoneyToCents(String(fd.get(k) ?? "")) ?? 0;
          const day = String(fd.get("billingDay") ?? "");
          const input = {
            type: String(fd.get("type")) as ContractType,
            status: String(fd.get("status")) as ContractStatus,
            setupFeeCents: money("setupFee"),
            monthlyFeeCents: money("monthlyFee"),
            mediaBudgetCents: money("mediaBudget"),
            billingDay: day ? Number(day) : null,
            startDate: String(fd.get("startDate") || "") || null,
            endDate: String(fd.get("endDate") || "") || null,
            notes: String(fd.get("notes") || "") || null,
          };
          start(async () => {
            const r = await saveContractFinanceAction(clientId, input, contract?.id);
            if (!r.ok) return setError(r.error);
            toast.success("Contrato salvo.");
            onOpenChange(false);
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de contrato" htmlFor="ct-type">
            <Select id="ct-type" name="type" defaultValue={contract?.type ?? "MONTHLY"}>
              {(Object.keys(CONTRACT_TYPE) as ContractType[]).map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status contratual" htmlFor="ct-status">
            <Select id="ct-status" name="status" defaultValue={contract?.status ?? "ACTIVE"}>
              {(Object.keys(CONTRACT_STATUS) as ContractStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mensalidade" htmlFor="ct-monthly">
            <MoneyInput id="ct-monthly" name="monthlyFee" defaultValue={centsToInput(contract?.monthlyFeeCents ?? 0)} />
          </Field>
          <Field label="Implantação" htmlFor="ct-setup">
            <MoneyInput id="ct-setup" name="setupFee" defaultValue={centsToInput(contract?.setupFeeCents ?? 0)} />
          </Field>
          <Field label="Investimento mensal em mídia" htmlFor="ct-media" hint="Verba do cliente — não é receita da agência.">
            <MoneyInput id="ct-media" name="mediaBudget" defaultValue={centsToInput(contract?.mediaBudgetCents ?? 0)} />
          </Field>
          <Field label="Dia de vencimento" htmlFor="ct-day">
            <Input id="ct-day" name="billingDay" type="number" min={1} max={31} defaultValue={contract?.billingDay ?? ""} placeholder="Ex.: 10" />
          </Field>
          <Field label="Início" htmlFor="ct-start">
            <Input id="ct-start" name="startDate" type="date" defaultValue={toDateInput(contract?.startDate)} />
          </Field>
          <Field label="Encerramento" htmlFor="ct-end">
            <Input id="ct-end" name="endDate" type="date" defaultValue={toDateInput(contract?.endDate)} />
          </Field>
        </div>
        <Field label="Observações" htmlFor="ct-notes">
          <Textarea id="ct-notes" name="notes" maxLength={2000} defaultValue={contract?.notes ?? ""} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Salvar contrato
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ContractsPanel({ rows }: { rows: ClientContractRow[] }) {
  const [editing, setEditing] = useState<ClientContractRow | null>(null);
  if (!rows.length) {
    return (
      <div className="glass rounded-3xl">
        <EmptyState icon={<FileSignature />} title="Nenhum cliente cadastrado" description="Cadastre clientes para registrar seus contratos." />
      </div>
    );
  }
  return (
    <>
      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => {
          const c = r.contract;
          return (
            <li key={r.id} className="glass rounded-[22px] p-4">
              <div className="flex items-center gap-3">
                <ClientLogo name={r.name} logoFileId={r.logoFileId} size={36} />
                <div className="min-w-0 flex-1">
                  <Link href={`/clientes/${r.id}`} className="block truncate font-bold hover:text-purple">
                    {r.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge color={CLIENT_STATUS[r.status].color}>Cliente {CLIENT_STATUS[r.status].label.toLowerCase()}</Badge>
                    {c && <Badge color={CONTRACT_STATUS[c.status].color}>Contrato {CONTRACT_STATUS[c.status].label.toLowerCase()}</Badge>}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
                  {c ? <Pencil /> : <Plus />} {c ? "Editar" : "Contrato"}
                </Button>
              </div>
              {c ? (
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {[
                    ["Mensalidade", formatMoney(c.monthlyFeeCents)],
                    ["Implantação", formatMoney(c.setupFeeCents)],
                    ["Mídia/mês", formatMoney(c.mediaBudgetCents)],
                    ["Vencimento", c.billingDay ? `Dia ${c.billingDay}` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="truncate font-semibold tabular">{v}</dd>
                    </div>
                  ))}
                  <p className="col-span-full text-[11.5px] text-ink-3">
                    {CONTRACT_TYPE[c.type].label}
                    {c.startDate && ` · desde ${formatDate(c.startDate)}`}
                    {c.endDate && ` · até ${formatDate(c.endDate)}`}
                    {r.contractCount > 1 && ` · ${r.contractCount} contratos no histórico`}
                  </p>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-ink-3">Sem contrato registrado.</p>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <ContractDialog
          key={editing.id}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          clientId={editing.id}
          clientName={editing.name}
          contract={editing.contract}
        />
      )}
    </>
  );
}
